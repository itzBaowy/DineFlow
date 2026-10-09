import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { type ReportQuery, type HistoryQuery, type ActivityQuery } from '@dineflow/shared';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { orderDto, orderInclude } from '../orders/orders.service';

type AmountRow = {
  paymentCount: bigint;
  subtotal: bigint;
  discount: bigint;
  serviceCharge: bigint;
  tax: bigint;
  collected: bigint;
};
function safe(value: bigint): number {
  if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER))
    throw new ConflictException('Số liệu vượt giới hạn chính xác. Chọn khoảng ngày ngắn hơn');
  return Number(value);
}
function amounts(row: AmountRow) {
  return {
    paymentCount: safe(row.paymentCount),
    subtotal: safe(row.subtotal),
    discount: safe(row.discount),
    serviceCharge: safe(row.serviceCharge),
    tax: safe(row.tax),
    collected: safe(row.collected),
  };
}
const historySelect = {
  id: true,
  number: true,
  status: true,
  source: true,
  totalAmount: true,
  createdAt: true,
  _count: { select: { items: true } },
  diningSession: {
    select: {
      id: true,
      status: true,
      openedAt: true,
      closedAt: true,
      tableId: true,
      table: { select: { name: true } },
      payment: { select: { id: true } },
    },
  },
} satisfies Prisma.OrderSelect;
type HistoryRow = Prisma.OrderGetPayload<{ select: typeof historySelect }>;
function summary(row: HistoryRow) {
  const s = row.diningSession;
  return {
    id: row.id,
    number: row.number,
    status: row.status,
    source: row.source,
    totalAmount: row.totalAmount,
    createdAt: row.createdAt,
    itemCount: row._count.items,
    session: {
      id: s.id,
      status: s.status,
      tableId: s.tableId,
      tableName: s.table.name,
      openedAt: s.openedAt,
      closedAt: s.closedAt,
    },
    paymentId: s.payment?.id ?? null,
  };
}
const detailKeys = new Set([
  'from',
  'to',
  'reason',
  'source',
  'method',
  'total',
  'paidAmount',
  'discount',
  'type',
  'paymentRequested',
  'role',
  'isActive',
]);
function auditDetails(metadata: Prisma.JsonValue | null) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return {};
  return Object.fromEntries(
    Object.entries(metadata)
      .filter(
        ([key, value]) =>
          detailKeys.has(key) &&
          (value === null || ['string', 'number', 'boolean'].includes(typeof value)),
      )
      .map(([key, value]) => [key, typeof value === 'string' ? value.slice(0, 500) : value]),
  );
}
@Injectable()
export class ReportsService {
  constructor(private readonly db: PrismaService) {}
  private async restaurant(tx: Prisma.TransactionClient, restaurantId: string) {
    const restaurant = await tx.restaurant.findUnique({
      where: { id: restaurantId },
      select: { timezone: true },
    });
    if (!restaurant) throw new NotFoundException('Không tìm thấy nhà hàng');
    return restaurant;
  }
  private async window(
    tx: Prisma.TransactionClient,
    from: string,
    to: string,
    timezone: string,
  ) {
    const [row] = await tx.$queryRaw<
      { start: Date; end: Date }[]
    >`SELECT (${from}::date::timestamp AT TIME ZONE ${timezone}) AS start, ((${to}::date + 1)::timestamp AT TIME ZONE ${timezone}) AS end`;
    return { gte: row!.start, lt: row!.end };
  }
  revenue(restaurantId: string, query: ReportQuery) {
    return this.db.$transaction(
      async (tx) => {
        const { timezone } = await this.restaurant(tx, restaurantId);
        const eligible = Prisma.sql`p."restaurantId" = ${restaurantId}::uuid AND p.status = 'COMPLETED'
        AND p."completedAt" >= (${query.from}::date::timestamp AT TIME ZONE ${timezone})
        AND p."completedAt" < ((${query.to}::date + 1)::timestamp AT TIME ZONE ${timezone})
        ${query.method ? Prisma.sql`AND p.method = ${query.method}::"PaymentMethod"` : Prisma.empty}`;
        const rows = await tx.$queryRaw<(AmountRow & { period: string })[]>(Prisma.sql`
        WITH bucket AS (
          SELECT date_trunc(${query.groupBy}, p."completedAt" AT TIME ZONE ${timezone})::date AS period,
            count(*)::bigint AS "paymentCount", sum(p.subtotal)::bigint AS subtotal,
            sum(p.discount)::bigint AS discount, sum(p."serviceCharge")::bigint AS "serviceCharge",
            sum(p.tax)::bigint AS tax, sum(p."paidAmount")::bigint AS collected
          FROM "Payment" p WHERE ${eligible} GROUP BY 1
        ), calendar AS (
          SELECT generate_series(date_trunc(${query.groupBy}, ${query.from}::date::timestamp),
            date_trunc(${query.groupBy}, ${query.to}::date::timestamp),
            CASE WHEN ${query.groupBy} = 'month' THEN interval '1 month' ELSE interval '1 day' END)::date AS period
        )
        SELECT to_char(c.period, 'YYYY-MM-DD') AS period, coalesce(b."paymentCount", 0)::bigint AS "paymentCount",
          coalesce(b.subtotal, 0)::bigint AS subtotal, coalesce(b.discount, 0)::bigint AS discount,
          coalesce(b."serviceCharge", 0)::bigint AS "serviceCharge", coalesce(b.tax, 0)::bigint AS tax,
          coalesce(b.collected, 0)::bigint AS collected FROM calendar c LEFT JOIN bucket b ON b.period = c.period ORDER BY c.period
      `);
        const rawTotal: AmountRow = {
          paymentCount: 0n,
          subtotal: 0n,
          discount: 0n,
          serviceCharge: 0n,
          tax: 0n,
          collected: 0n,
        };
        for (const row of rows)
          for (const key of Object.keys(rawTotal) as (keyof AmountRow)[])
            rawTotal[key] += row[key];
        const methods = await tx.$queryRaw<
          { method: 'CASH' | 'BANK_TRANSFER'; paymentCount: bigint; collected: bigint }[]
        >(Prisma.sql`
        SELECT p.method, count(*)::bigint AS "paymentCount", sum(p."paidAmount")::bigint AS collected FROM "Payment" p WHERE ${eligible} GROUP BY p.method
      `);
        const bestSellers = await tx.$queryRaw<
          {
            menuItemId: string;
            name: string;
            quantity: bigint;
            lineAmount: bigint;
            orderCount: bigint;
          }[]
        >(Prisma.sql`
        SELECT i."menuItemId", i."nameSnapshot" AS name, sum(i.quantity)::bigint AS quantity,
          sum(i."totalAmount")::bigint AS "lineAmount", count(DISTINCT o.id)::bigint AS "orderCount"
        FROM "Payment" p JOIN "Order" o ON o."diningSessionId" = p."diningSessionId" AND o."restaurantId" = p."restaurantId"
        JOIN "OrderItem" i ON i."orderId" = o.id AND i."restaurantId" = o."restaurantId"
        WHERE ${eligible} AND o.status <> 'CANCELLED' GROUP BY i."menuItemId", i."nameSnapshot"
        ORDER BY quantity DESC, "lineAmount" DESC, i."nameSnapshot" ASC, i."menuItemId" ASC LIMIT 10
      `);
        return {
          from: query.from,
          to: query.to,
          timezone,
          groupBy: query.groupBy,
          method: query.method ?? null,
          generatedAt: new Date().toISOString(),
          totals: {
            ...amounts(rawTotal),
            averagePayment: rawTotal.paymentCount
              ? safe(
                  (2n * rawTotal.collected + rawTotal.paymentCount) /
                    (2n * rawTotal.paymentCount),
                )
              : 0,
          },
          buckets: rows.map((row) => ({ period: row.period, ...amounts(row) })),
          methods: (['CASH', 'BANK_TRANSFER'] as const).map((method) => {
            const row = methods.find((entry) => entry.method === method);
            return {
              method,
              paymentCount: safe(row?.paymentCount ?? 0n),
              collected: safe(row?.collected ?? 0n),
            };
          }),
          bestSellers: bestSellers.map((row) => ({
            ...row,
            quantity: safe(row.quantity),
            lineAmount: safe(row.lineAmount),
            orderCount: safe(row.orderCount),
          })),
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
  history(restaurantId: string, query: HistoryQuery) {
    return this.db.$transaction(
      async (tx) => {
        const { timezone } = await this.restaurant(tx, restaurantId);
        const where: Prisma.OrderWhereInput = {
          restaurantId,
          status: query.status,
          source: query.source,
          number: query.number,
          createdAt: await this.window(tx, query.from, query.to, timezone),
          diningSession: { status: query.sessionStatus, tableId: query.tableId },
        };
        const total = await tx.order.count({ where });
        const orders = await tx.order.findMany({
          where,
          select: historySelect,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        });
        return {
          orders: orders.map(summary),
          total,
          page: query.page,
          pageSize: query.pageSize,
          timezone,
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
  async detail(restaurantId: string, id: string) {
    const row = await this.db.order.findFirst({
      where: { id, restaurantId },
      include: {
        ...orderInclude,
        _count: { select: { items: true } },
        diningSession: {
          include: { table: { select: { name: true } }, payment: { select: { id: true } } },
        },
      },
    });
    if (!row) throw new NotFoundException('Không tìm thấy đơn');
    const { idempotencyKey: _key, ...order } = orderDto(row);
    void _key;
    return { ...summary(row), order };
  }
  activity(restaurantId: string, query: ActivityQuery) {
    return this.db.$transaction(
      async (tx) => {
        const { timezone } = await this.restaurant(tx, restaurantId);
        const where: Prisma.ActivityLogWhereInput = {
          restaurantId,
          actorUserId: query.actorUserId,
          action: query.action,
          createdAt: await this.window(tx, query.from, query.to, timezone),
        };
        const total = await tx.activityLog.count({ where });
        const entries = await tx.activityLog.findMany({
          where,
          select: {
            id: true,
            action: true,
            entityType: true,
            entityId: true,
            createdAt: true,
            metadata: true,
            actorUser: { select: { id: true, name: true } },
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        });
        return {
          entries: entries.map(({ actorUser, metadata, ...row }) => ({
            ...row,
            actor: actorUser,
            details: auditDetails(metadata),
          })),
          total,
          page: query.page,
          pageSize: query.pageSize,
          timezone,
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
}
