import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  canTransitionOrder,
  orderStatuses,
  type CreateOrderInput,
  type OrderListQuery,
  type OrderStatusInput,
  type StaffPrincipal,
} from '@dineflow/shared';
import { PrismaService } from '../database/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import { lockSession, lockTable } from '../dining-sessions/dining-sessions.service';
import { OrdersService, orderDto, orderInclude } from './orders.service';
import { priceOrder } from './order-pricing';
import { RealtimeService } from '../realtime/realtime.service';

@Injectable()
export class OperationsService {
  constructor(
    private readonly db: PrismaService,
    private readonly orders: OrdersService,
    private readonly realtime: RealtimeService,
  ) {}
  async overview(restaurantId: string) {
    return this.db.$transaction(
      async (tx) => {
        const rows = await tx.order.groupBy({
          by: ['status'],
          where: {
            restaurantId,
            diningSession: { status: { in: ['OPEN', 'PAYMENT_REQUESTED'] } },
          },
          _count: { _all: true },
        });
        const counts = Object.fromEntries(
          orderStatuses.map((status) => [
            status,
            rows.find((row) => row.status === status)?._count._all ?? 0,
          ]),
        );
        const occupiedTables = await tx.diningTable.count({
          where: { restaurantId, archivedAt: null, status: 'OCCUPIED' },
        });
        const needsCleaningTables = await tx.diningTable.count({
          where: { restaurantId, archivedAt: null, status: 'NEEDS_CLEANING' },
        });
        return { counts, occupiedTables, needsCleaningTables };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
  list(restaurantId: string, query: OrderListQuery) {
    const timestamp =
      query.status === 'ACCEPTED'
        ? 'acceptedAt'
        : query.status === 'PREPARING'
          ? 'preparingAt'
          : query.status === 'READY'
            ? 'readyAt'
            : 'createdAt';
    const where: Prisma.OrderWhereInput = {
      restaurantId,
      status: query.status,
      diningSession: {
        status: { in: ['OPEN', 'PAYMENT_REQUESTED'] },
        ...(query.tableId ? { tableId: query.tableId } : {}),
      },
    };
    return this.db.$transaction(
      async (tx) => {
        const total = await tx.order.count({ where });
        const orders = await tx.order.findMany({
          where,
          include: {
            ...orderInclude,
            diningSession: { select: { table: { select: { id: true, name: true } } } },
          },
          orderBy: [{ [timestamp]: 'asc' }, { number: 'asc' }],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        });
        return {
          orders: orders.map((order) => ({
            ...orderDto(order),
            table: order.diningSession.table,
          })),
          total,
          page: query.page,
          pageSize: query.pageSize,
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
  private async context(staff: StaffPrincipal, sessionId: string) {
    const session = await this.db.diningSession.findFirst({
      where: { id: sessionId, restaurantId: staff.restaurantId },
      include: { table: true },
    });
    if (!session) throw new NotFoundException('Không tìm thấy phiên bàn');
    return session;
  }
  async menu(staff: StaffPrincipal, sessionId: string) {
    const session = await this.context(staff, sessionId);
    if (session.status !== 'OPEN')
      throw new ConflictException('Phiên bàn không còn nhận thêm đơn');
    const menu = await this.orders.menu(session.table.publicCode);
    if (menu.diningSessionId !== sessionId || !menu.orderingEnabled)
      throw new ConflictException('Phiên bàn đã thay đổi');
    return menu;
  }
  async create(staff: StaffPrincipal, sessionId: string, input: CreateOrderInput) {
    if (input.diningSessionId !== sessionId)
      throw new ConflictException('Phiên bàn trong yêu cầu không khớp');
    const context = await this.context(staff, sessionId);
    const requestHash = createHash('sha256')
      .update(
        JSON.stringify({
          staffUserId: staff.userId,
          ...input,
          items: input.items.map((item) => ({
            ...item,
            modifierOptionIds: [...item.modifierOptionIds].sort(),
          })),
        }),
      )
      .digest('hex');
    const result = await this.db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Restaurant" WHERE id = ${staff.restaurantId}::uuid FOR UPDATE`;
        const table = await lockTable(tx, staff.restaurantId, context.tableId);
        const session = await lockSession(tx, table.id);
        if (
          !session ||
          session.id !== sessionId ||
          session.status !== 'OPEN' ||
          table.status !== 'OCCUPIED'
        )
          throw new ConflictException('Phiên bàn không còn nhận thêm đơn');
        const existing = await tx.order.findUnique({
          where: {
            diningSessionId_idempotencyKey: {
              diningSessionId: sessionId,
              idempotencyKey: input.idempotencyKey,
            },
          },
          include: orderInclude,
        });
        if (existing) {
          if (existing.source !== 'STAFF' || existing.requestHash !== requestHash)
            throw new ConflictException('Mã gửi đơn đã được sử dụng cho yêu cầu khác');
          return { order: orderDto(existing), created: false };
        }
        const { items, totalAmount } = await priceOrder(tx, staff.restaurantId, input);
        const order = await tx.order.create({
          data: {
            restaurantId: staff.restaurantId,
            diningSessionId: sessionId,
            source: 'STAFF',
            guestSessionId: null,
            idempotencyKey: input.idempotencyKey,
            requestHash,
            totalAmount,
            note: input.note || null,
            items: { create: items },
          },
          include: orderInclude,
        });
        await tx.activityLog.create({
          data: {
            restaurantId: staff.restaurantId,
            actorUserId: staff.userId,
            action: 'order.created',
            entityType: 'Order',
            entityId: order.id,
            metadata: { diningSessionId: sessionId, source: 'STAFF' },
          },
        });
        return { order: orderDto(order), created: true };
      },
      { maxWait: 10000, timeout: 15000 },
    );
    if (result.created)
      await this.realtime.publish(
        'order.created',
        {
          restaurantId: staff.restaurantId,
          tableId: context.tableId,
          diningSessionId: sessionId,
        },
        result.order.id,
      );
    return result.order;
  }
  async transition(staff: StaffPrincipal, id: string, input: OrderStatusInput) {
    const context = await this.db.order.findFirst({
      where: { id, restaurantId: staff.restaurantId },
      select: {
        diningSessionId: true,
        guestSessionId: true,
        diningSession: { select: { tableId: true } },
      },
    });
    if (!context) throw new NotFoundException('Không tìm thấy đơn');
    const order = await this.db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Restaurant" WHERE id = ${staff.restaurantId}::uuid FOR UPDATE`;
        const table = await lockTable(tx, staff.restaurantId, context.diningSession.tableId);
        const session = await lockSession(tx, table.id);
        if (!session || session.id !== context.diningSessionId || table.status !== 'OCCUPIED')
          throw new ConflictException('Phiên bàn đã đóng hoặc không còn phục vụ');
        await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${id}::uuid AND "restaurantId" = ${staff.restaurantId}::uuid FOR UPDATE`;
        const current = await tx.order.findUniqueOrThrow({ where: { id } });
        if (current.status !== input.from)
          throw new ConflictException('Đơn đã được người khác cập nhật. Vui lòng tải lại');
        if (!canTransitionOrder(current.status, input.to, 'OWNER'))
          throw new ConflictException(
            'Không thể bỏ bước, chuyển ngược hoặc thay đổi đơn đã hoàn tất',
          );
        if (!canTransitionOrder(current.status, input.to, staff.role))
          throw new ForbiddenException('Vai trò của bạn không được thực hiện bước này');
        const fields = {
          ACCEPTED: 'acceptedAt',
          PREPARING: 'preparingAt',
          READY: 'readyAt',
          SERVED: 'servedAt',
          CANCELLED: 'cancelledAt',
        } as const;
        if (input.to === 'PENDING_CONFIRMATION')
          throw new ConflictException('Không thể quay lại chờ xác nhận');
        const order = await tx.order.update({
          where: { id },
          data: {
            status: input.to,
            [fields[input.to]]: new Date(),
            cancellationReason: input.to === 'CANCELLED' ? input.reason : null,
          },
          include: orderInclude,
        });
        await tx.activityLog.create({
          data: {
            restaurantId: staff.restaurantId,
            actorUserId: staff.userId,
            action: `order.${input.to.toLowerCase()}`,
            entityType: 'Order',
            entityId: id,
            metadata: { from: input.from, to: input.to, reason: input.reason },
          },
        });
        return orderDto(order);
      },
      { maxWait: 10000, timeout: 15000 },
    );
    await this.realtime.publish(
      input.to === 'ACCEPTED' ? 'order.accepted' : 'order.status_changed',
      {
        restaurantId: staff.restaurantId,
        tableId: context.diningSession.tableId,
        diningSessionId: context.diningSessionId,
        guestId: context.guestSessionId,
        kitchen: input.to !== 'CANCELLED' || input.from === 'ACCEPTED',
      },
      id,
    );
    return order;
  }
}
