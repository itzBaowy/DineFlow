import { lockActiveRestaurant } from '../common/tenant-scope';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  calculateBill,
  billOrderSchema,
  receiptBillSchema,
  receiptSchema,
  type Bill,
  type DiscountInput,
  type PaymentInput,
  type BillingSessionInput,
  type StaffPrincipal,
} from '@dineflow/shared';
import { PrismaService } from '../database/prisma.service';
import type {
  Prisma,
  Restaurant,
  DiningTable,
  DiningSession,
  Payment,
} from '../generated/prisma/client';
import { lockTable } from '../dining-sessions/dining-sessions.service';
import { orderDto, orderInclude, OrdersService } from '../orders/orders.service';
import { RealtimeService } from '../realtime/realtime.service';

const digest = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
function receipt(payment: Payment) {
  const result = receiptSchema.safeParse({
    id: payment.id,
    diningSessionId: payment.diningSessionId,
    status: payment.status,
    method: payment.method,
    paidAmount: payment.paidAmount,
    reference: payment.reference,
    completedAt: payment.completedAt.toISOString(),
    bill: payment.receiptSnapshot,
  });
  if (!result.success)
    throw new ConflictException('Biên nhận cũ chưa có dữ liệu lưu tại thời điểm thanh toán');
  return result.data;
}
@Injectable()
export class PaymentsService {
  constructor(
    private readonly db: PrismaService,
    private readonly orders: OrdersService,
    private readonly realtime: RealtimeService,
  ) {}
  private async withSession<T>(
    restaurantId: string,
    id: string,
    work: (
      tx: Prisma.TransactionClient,
      restaurant: Restaurant,
      table: DiningTable,
      session: DiningSession,
    ) => Promise<T>,
  ) {
    const context = await this.db.diningSession.findFirst({
      where: { id, restaurantId },
      select: { tableId: true },
    });
    if (!context) throw new NotFoundException('Không tìm thấy phiên bàn');
    return this.db.$transaction(
      async (tx) => {
        await lockActiveRestaurant(tx, restaurantId);
        const restaurant = await tx.restaurant.findUniqueOrThrow({
          where: { id: restaurantId },
        });
        const table = await lockTable(tx, restaurantId, context.tableId);
        await tx.$queryRaw`SELECT id FROM "DiningSession" WHERE id = ${id}::uuid AND "restaurantId" = ${restaurantId}::uuid FOR UPDATE`;
        const session = await tx.diningSession.findUniqueOrThrow({ where: { id } });
        return work(tx, restaurant, table, session);
      },
      { maxWait: 10000, timeout: 15000 },
    );
  }
  private active(table: DiningTable, session: DiningSession) {
    if (session.status === 'CLOSED' || table.status !== 'OCCUPIED')
      throw new ConflictException('Phiên bàn đã đóng hoặc ngừng phục vụ');
  }
  private async quote(
    tx: Prisma.TransactionClient,
    restaurant: Restaurant,
    table: DiningTable,
    session: DiningSession,
  ): Promise<Bill> {
    const stored = await tx.order.findMany({
      where: { diningSessionId: session.id, restaurantId: restaurant.id },
      include: orderInclude,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    const orders = stored.map((order) =>
      billOrderSchema.parse({ ...orderDto(order), createdAt: order.createdAt.toISOString() }),
    );
    const valid = orders.filter((order) => order.status !== 'CANCELLED');
    const subtotal = valid.reduce((sum, order) => sum + order.totalAmount, 0);
    let amounts;
    try {
      amounts = calculateBill({
        subtotal,
        discount: session.discount,
        serviceChargeBps: restaurant.serviceChargeBps,
        taxBps: restaurant.taxBps,
      });
    } catch {
      throw new ConflictException(
        'Số tiền hoặc giảm giá không còn hợp lệ. Cần quản lý kiểm tra hóa đơn',
      );
    }
    const blockingOrderCount = valid.filter((order) => order.status !== 'SERVED').length;
    const data = {
      diningSessionId: session.id,
      table: { id: table.id, name: table.name },
      restaurant: {
        name: restaurant.name,
        address: restaurant.address,
        phone: restaurant.phone,
        currency: 'VND' as const,
        timezone: restaurant.timezone,
      },
      status: session.status,
      openedAt: session.openedAt.toISOString(),
      closedAt: session.closedAt?.toISOString() ?? null,
      orders,
      totals: { ...amounts, discountReason: session.discountReason },
      validOrderCount: valid.length,
      blockingOrderCount,
      cashierMaxDiscountBps: restaurant.cashierMaxDiscountBps,
      canPay: session.status !== 'CLOSED' && valid.length > 0 && blockingOrderCount === 0,
    };
    return { ...data, revision: digest(data) };
  }
  private checkRevision(bill: Bill, revision: string) {
    if (bill.revision !== revision)
      throw new ConflictException(
        'Hóa đơn đã thay đổi. Cập nhật và kiểm tra lại trước khi xác nhận',
      );
  }
  private discountPermission(
    staff: StaffPrincipal,
    amount: number,
    subtotal: number,
    cap: number,
  ) {
    if (amount > subtotal)
      throw new ConflictException('Giảm giá không được vượt tổng tiền món');
    if (staff.role === 'CASHIER' && BigInt(amount) * 10000n > BigInt(subtotal) * BigInt(cap))
      throw new ForbiddenException(
        'Giảm giá vượt hạn mức thu ngân. Cần chủ nhà hàng hoặc quản lý xử lý',
      );
  }
  bill(restaurantId: string, id: string) {
    return this.withSession(restaurantId, id, async (tx, r, t, s) => {
      this.active(t, s);
      return this.quote(tx, r, t, s);
    });
  }
  guestBill(code: string, token?: string) {
    return this.orders.withGuest(code, token, async (tx, { table, session }) => {
      const restaurant = await tx.restaurant.findUniqueOrThrow({
        where: { id: table.restaurantId },
      });
      const bill = await this.quote(tx, restaurant, table, session);
      const { discountReason: _reason, ...totals } = bill.totals;
      void _reason;
      return {
        diningSessionId: session.id,
        tableName: table.name,
        status: session.status,
        totals,
        validOrderCount: bill.validOrderCount,
        blockingOrderCount: bill.blockingOrderCount,
      };
    });
  }
  async discount(staff: StaffPrincipal, id: string, input: DiscountInput) {
    const result = await this.withSession(staff.restaurantId, id, async (tx, r, t, s) => {
      this.active(t, s);
      const bill = await this.quote(tx, r, t, s);
      this.checkRevision(bill, input.revision);
      if (!bill.canPay)
        throw new ConflictException(
          'Chỉ áp dụng giảm giá sau khi phục vụ xong tất cả đơn hợp lệ',
        );
      this.discountPermission(
        staff,
        input.amount,
        bill.totals.subtotal,
        r.cashierMaxDiscountBps,
      );
      const updated = await tx.diningSession.update({
        where: { id },
        data: { discount: input.amount, discountReason: input.reason },
      });
      await tx.activityLog.create({
        data: {
          restaurantId: staff.restaurantId,
          actorUserId: staff.userId,
          action: 'billing.discount_updated',
          entityType: 'DiningSession',
          entityId: id,
          metadata: { from: s.discount, to: input.amount, reason: input.reason },
        },
      });
      return this.quote(tx, r, t, updated);
    });
    await this.realtime.publish('billing.updated', {
      restaurantId: staff.restaurantId,
      tableId: result.table.id,
      diningSessionId: id,
    });
    return result;
  }
  async transition(staff: StaffPrincipal, id: string, input: BillingSessionInput) {
    const result = await this.withSession(staff.restaurantId, id, async (tx, r, t, s) => {
      this.active(t, s);
      if (s.status !== input.from)
        throw new ConflictException('Trạng thái phiên bàn đã thay đổi. Vui lòng cập nhật');
      const now = new Date();
      const updated = await tx.diningSession.update({
        where: { id },
        data: {
          status: input.to,
          paymentRequestedAt: input.to === 'PAYMENT_REQUESTED' ? now : null,
        },
      });
      if (input.to === 'OPEN')
        await tx.serviceRequest.updateMany({
          where: {
            diningSessionId: id,
            type: 'REQUEST_PAYMENT',
            status: { in: ['PENDING', 'ACKNOWLEDGED'] },
          },
          data: { status: 'RESOLVED', resolvedAt: now },
        });
      await tx.activityLog.create({
        data: {
          restaurantId: staff.restaurantId,
          actorUserId: staff.userId,
          action:
            input.to === 'OPEN'
              ? 'dining_session.reopened'
              : 'dining_session.payment_requested',
          entityType: 'DiningSession',
          entityId: id,
          metadata: { from: input.from, to: input.to, reason: input.reason },
        },
      });
      return this.quote(tx, r, t, updated);
    });
    const scope = {
      restaurantId: staff.restaurantId,
      tableId: result.table.id,
      diningSessionId: id,
    };
    await this.realtime.publish('table.status_changed', scope);
    if (input.to === 'OPEN') await this.realtime.publish('service_request.updated', scope);
    return result;
  }
  async pay(staff: StaffPrincipal, id: string, input: PaymentInput) {
    const requestHash = digest({ ...input, actorUserId: staff.userId });
    const result = await this.withSession(staff.restaurantId, id, async (tx, r, t, s) => {
      const existing = await tx.payment.findUnique({ where: { diningSessionId: id } });
      if (existing) {
        if (
          existing.idempotencyKey !== input.idempotencyKey ||
          existing.requestHash !== requestHash
        )
          throw new ConflictException(
            'Phiên đã được thanh toán. Không ghi nhận thêm giao dịch',
          );
        return { receipt: receipt(existing), created: false, tableId: t.id };
      }
      this.active(t, s);
      const bill = await this.quote(tx, r, t, s);
      this.checkRevision(bill, input.revision);
      if (!bill.canPay)
        throw new ConflictException(
          'Cần ít nhất một đơn hợp lệ và phục vụ tất cả món trước khi thanh toán',
        );
      this.discountPermission(staff, s.discount, bill.totals.subtotal, r.cashierMaxDiscountBps);
      if (input.paidAmount !== bill.totals.total)
        throw new ConflictException('Số tiền đã nhận phải bằng tổng hóa đơn');
      const now = new Date();
      const snapshot = receiptBillSchema.parse({
        ...bill,
        status: 'CLOSED',
        closedAt: now.toISOString(),
      });
      const { discountReason: _reason, ...amounts } = bill.totals;
      void _reason;
      const payment = await tx.payment.create({
        data: {
          restaurantId: staff.restaurantId,
          diningSessionId: id,
          method: input.method,
          ...amounts,
          paidAmount: input.paidAmount,
          reference: input.reference,
          completedAt: now,
          idempotencyKey: input.idempotencyKey,
          requestHash,
          receiptSnapshot: snapshot as Prisma.InputJsonValue,
        },
      });
      await tx.diningSession.update({
        where: { id },
        data: { status: 'CLOSED', closedAt: now, closeReason: 'Thanh toán đầy đủ' },
      });
      await tx.diningTable.update({ where: { id: t.id }, data: { status: 'NEEDS_CLEANING' } });
      await tx.guestSession.updateMany({
        where: { diningSessionId: id, revokedAt: null },
        data: { revokedAt: now },
      });
      await tx.serviceRequest.updateMany({
        where: { diningSessionId: id, status: { in: ['PENDING', 'ACKNOWLEDGED'] } },
        data: { status: 'RESOLVED', resolvedAt: now },
      });
      await tx.activityLog.create({
        data: {
          restaurantId: staff.restaurantId,
          actorUserId: staff.userId,
          action: 'payment.completed',
          entityType: 'Payment',
          entityId: payment.id,
          metadata: {
            diningSessionId: id,
            method: input.method,
            total: payment.total,
            reference: input.reference,
          },
        },
      });
      await tx.activityLog.create({
        data: {
          restaurantId: staff.restaurantId,
          actorUserId: staff.userId,
          action: 'dining_session.closed_paid',
          entityType: 'DiningSession',
          entityId: id,
          metadata: { paymentId: payment.id },
        },
      });
      return { receipt: receipt(payment), created: true, tableId: t.id };
    });
    if (result.created) {
      const scope = {
        restaurantId: staff.restaurantId,
        tableId: result.tableId,
        diningSessionId: id,
      };
      await this.realtime.publish('dining_session.closed', scope);
      await this.realtime.publish('payment.completed', scope);
      await this.realtime.publish('table.status_changed', scope);
    }
    return result.receipt;
  }
  async getReceipt(restaurantId: string, id: string) {
    const payment = await this.db.payment.findFirst({ where: { id, restaurantId } });
    if (!payment) throw new NotFoundException('Không tìm thấy biên nhận');
    return receipt(payment);
  }
  async recent(restaurantId: string) {
    const payments = await this.db.payment.findMany({
      where: { restaurantId, idempotencyKey: { not: null } },
      orderBy: [{ completedAt: 'desc' }, { id: 'desc' }],
      take: 20,
    });
    return payments.map((payment) => ({
      id: payment.id,
      diningSessionId: payment.diningSessionId,
      method: payment.method,
      paidAmount: payment.paidAmount,
      completedAt: payment.completedAt.toISOString(),
      tableName: receipt(payment).bill.table.name,
    }));
  }
  async sessionReceipt(restaurantId: string, id: string) {
    const payment = await this.db.payment.findFirst({
      where: { restaurantId, diningSessionId: id },
    });
    if (!payment) throw new NotFoundException('Chưa có thanh toán được ghi nhận cho phiên này');
    return receipt(payment);
  }
}
