import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import type { CreateOrderInput, StaffPrincipal } from '@dineflow/shared';
import { PrismaService } from '../database/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import { CONFIG, type AppConfig } from '../config/env';
import { priceOrder } from './order-pricing';
import { lockSession, lockTable } from '../dining-sessions/dining-sessions.service';

const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export const orderInclude = {
  items: {
    orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
    include: { modifiers: { orderBy: { id: 'asc' as const } } },
  },
} satisfies Prisma.OrderInclude;
type StoredOrder = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;
export function orderDto(order: StoredOrder) {
  return {
    id: order.id,
    number: order.number,
    diningSessionId: order.diningSessionId,
    idempotencyKey: order.idempotencyKey,
    status: order.status,
    source: order.source,
    cancellationReason: order.cancellationReason,
    acceptedAt: order.acceptedAt,
    preparingAt: order.preparingAt,
    readyAt: order.readyAt,
    servedAt: order.servedAt,
    cancelledAt: order.cancelledAt,
    totalAmount: order.totalAmount,
    note: order.note,
    createdAt: order.createdAt,
    items: order.items.map((item) => ({
      id: item.id,
      name: item.nameSnapshot,
      basePrice: item.basePriceSnapshot,
      unitPrice: item.unitPrice,
      quantity: item.quantity,
      totalAmount: item.totalAmount,
      note: item.note,
      modifiers: item.modifiers.map((modifier) => ({
        groupName: modifier.groupNameSnapshot,
        name: modifier.optionNameSnapshot,
        priceDelta: modifier.priceDeltaSnapshot,
      })),
    })),
  };
}
@Injectable()
export class OrdersService {
  constructor(
    private readonly db: PrismaService,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}
  cookiePath(code: string) {
    return `/api/v1/public/tables/${code}`;
  }
  private async table(code: string) {
    if (!/^[A-Za-z0-9_-]{32}$/.test(code)) throw new NotFoundException('Mã bàn không hợp lệ');
    const table = await this.db.diningTable.findFirst({
      where: { publicCode: code, archivedAt: null, status: { not: 'OUT_OF_SERVICE' } },
    });
    if (!table) throw new NotFoundException('Mã bàn không hợp lệ hoặc bàn đang tạm ngưng');
    return table;
  }
  private async withTable<T>(
    code: string,
    work: (
      tx: Prisma.TransactionClient,
      table: Awaited<ReturnType<typeof lockTable>>,
      session: Awaited<ReturnType<typeof lockSession>>,
    ) => Promise<T>,
  ) {
    const context = await this.table(code);
    return this.db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Restaurant" WHERE id = ${context.restaurantId}::uuid FOR UPDATE`;
        const table = await lockTable(tx, context.restaurantId, context.id);
        if (table.publicCode !== code || table.status === 'OUT_OF_SERVICE')
          throw new NotFoundException('Mã bàn đã thay đổi hoặc đang tạm ngưng');
        const session = await lockSession(tx, table.id);
        return work(tx, table, session);
      },
      { maxWait: 10000, timeout: 15000 },
    );
  }
  private async authenticate(
    tx: Prisma.TransactionClient,
    token: string | undefined,
    sessionId: string | undefined,
  ) {
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token) || !sessionId)
      throw new UnauthorizedException('Phiên khách đã hết hạn. Vui lòng bắt đầu lại tại bàn');
    const guest = await tx.guestSession.findFirst({
      where: {
        tokenHash: digest(token),
        diningSessionId: sessionId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    if (!guest)
      throw new UnauthorizedException('Phiên khách đã hết hạn. Vui lòng bắt đầu lại tại bàn');
    return guest;
  }
  async menu(code: string) {
    // Menu/context are public; no guest IDs, tokens, prior orders or private restaurant fields.
    return this.withTable(code, async (tx, table, session) => {
      const restaurant = await tx.restaurant.findUniqueOrThrow({
        where: { id: table.restaurantId },
        select: { name: true, logoUrl: true, address: true },
      });
      const categories = await tx.menuCategory.findMany({
        where: { restaurantId: table.restaurantId, isActive: true, archivedAt: null },
        orderBy: [{ position: 'asc' }, { name: 'asc' }],
        select: { id: true, name: true, description: true },
      });
      const items = await tx.menuItem.findMany({
        where: {
          restaurantId: table.restaurantId,
          archivedAt: null,
          categoryId: { in: categories.map((category) => category.id) },
        },
        orderBy: [{ position: 'asc' }, { name: 'asc' }],
        include: {
          modifierGroups: {
            orderBy: { position: 'asc' },
            include: {
              modifierGroup: {
                include: {
                  options: {
                    where: { archivedAt: null },
                    orderBy: [{ position: 'asc' }, { name: 'asc' }],
                  },
                },
              },
            },
          },
        },
      });
      return {
        restaurant,
        table: { name: table.name },
        diningSessionId: session?.id ?? null,
        orderingEnabled: table.status === 'OCCUPIED' && session?.status === 'OPEN',
        categories,
        items: items.map((item) => {
          const groups = item.modifierGroups.map((link) => link.modifierGroup);
          return {
            id: item.id,
            categoryId: item.categoryId,
            name: item.name,
            description: item.description,
            imageUrl: item.imageUrl,
            basePrice: item.basePrice,
            isAvailable:
              item.isAvailable &&
              groups.every(
                (group) =>
                  !group.archivedAt &&
                  group.options.filter((option) => option.isAvailable).length >=
                    group.minSelections,
              ),
            modifierGroups: groups
              .filter((group) => !group.archivedAt)
              .map((group) => ({
                id: group.id,
                name: group.name,
                minSelections: group.minSelections,
                maxSelections: group.maxSelections,
                position: group.position,
                options: group.options.map((option) => ({
                  id: option.id,
                  name: option.name,
                  priceDelta: option.priceDelta,
                  isAvailable: option.isAvailable,
                  position: option.position,
                })),
              })),
          };
        }),
      };
    });
  }
  async admit(code: string, expectedSessionId: string, token?: string) {
    return this.withTable(code, async (tx, table, session) => {
      if (
        table.status !== 'OCCUPIED' ||
        !session ||
        session.status !== 'OPEN' ||
        session.id !== expectedSessionId
      )
        throw new ConflictException(
          'Phiên bàn đã thay đổi hoặc chưa được mở. Vui lòng tải lại thực đơn',
        );
      if (token && /^[A-Za-z0-9_-]{43}$/.test(token)) {
        const guest = await tx.guestSession.findFirst({
          where: {
            tokenHash: digest(token),
            diningSessionId: session.id,
            revokedAt: null,
            expiresAt: { gt: new Date() },
          },
        });
        if (guest)
          return {
            guest: {
              id: guest.id,
              diningSessionId: guest.diningSessionId,
              expiresAt: guest.expiresAt,
            },
            token,
          };
      }
      const newToken = randomBytes(32).toString('base64url');
      const guest = await tx.guestSession.create({
        data: {
          diningSessionId: session.id,
          tokenHash: digest(newToken),
          expiresAt: new Date(Date.now() + this.config.GUEST_TOKEN_TTL_SECONDS * 1000),
        },
      });
      return {
        guest: { id: guest.id, diningSessionId: guest.diningSessionId, expiresAt: guest.expiresAt },
        token: newToken,
      };
    });
  }
  me(code: string, token?: string) {
    return this.withTable(code, async (tx, _table, session) => {
      const guest = await this.authenticate(tx, token, session?.id);
      return { id: guest.id, diningSessionId: guest.diningSessionId, expiresAt: guest.expiresAt };
    });
  }
  history(code: string, token?: string) {
    return this.withTable(code, async (tx, _table, session) => {
      const guest = await this.authenticate(tx, token, session?.id);
      return (
        await tx.order.findMany({
          where: { diningSessionId: guest.diningSessionId, guestSessionId: guest.id },
          include: orderInclude,
          orderBy: [{ createdAt: 'desc' }, { number: 'desc' }],
        })
      ).map(orderDto);
    });
  }
  async staffOrders(staff: StaffPrincipal, sessionId: string) {
    if (
      !(await this.db.diningSession.findFirst({
        where: {
          id: sessionId,
          restaurantId: staff.restaurantId,
          status: { in: ['OPEN', 'PAYMENT_REQUESTED'] },
        },
      }))
    )
      throw new NotFoundException('Không tìm thấy phiên đang phục vụ');
    return (
      await this.db.order.findMany({
        where: { diningSessionId: sessionId, restaurantId: staff.restaurantId },
        include: orderInclude,
        orderBy: [{ createdAt: 'desc' }, { number: 'desc' }],
      })
    ).map(orderDto);
  }
  create(code: string, input: CreateOrderInput, token?: string) {
    // Canonical modifier IDs prevent harmless selection order changes from breaking retries.
    const requestHash = digest(
      JSON.stringify({
        ...input,
        items: input.items.map((item) => ({
          ...item,
          modifierOptionIds: [...item.modifierOptionIds].sort(),
        })),
      }),
    );
    return this.withTable(code, async (tx, table, session) => {
      const guest = await this.authenticate(tx, token, session?.id);
      if (
        table.status !== 'OCCUPIED' ||
        !session ||
        session.status !== 'OPEN' ||
        input.diningSessionId !== session.id
      )
        throw new ConflictException('Phiên bàn không còn nhận đơn. Vui lòng tải lại thực đơn');
      const existing = await tx.order.findUnique({
        where: {
          diningSessionId_idempotencyKey: {
            diningSessionId: session.id,
            idempotencyKey: input.idempotencyKey,
          },
        },
        include: orderInclude,
      });
      if (existing) {
        if (existing.guestSessionId !== guest.id || existing.requestHash !== requestHash)
          throw new ConflictException('Mã gửi đơn đã được sử dụng cho yêu cầu khác');
        return orderDto(existing);
      }
      const { items, totalAmount } = await priceOrder(tx, table.restaurantId, input);
      const order = await tx.order.create({
        data: {
          restaurantId: table.restaurantId,
          diningSessionId: session.id,
          guestSessionId: guest.id,
          source: 'GUEST',
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
          restaurantId: table.restaurantId,
          action: 'order.created',
          entityType: 'Order',
          entityId: order.id,
          metadata: { diningSessionId: session.id, guestSessionId: guest.id },
        },
      });
      return orderDto(order);
    });
  }
}
