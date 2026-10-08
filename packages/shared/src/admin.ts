import { z } from 'zod';
import { orderSchema, orderStatuses } from './ordering';

const integer = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const date = z.iso
  .date()
  .refine(
    (value) => value >= '2000-01-01' && value <= '2100-12-31',
    'Chọn ngày từ năm 2000 đến 2100',
  );
export const dateRangeFields = { from: date, to: date };
export function validDateRange(value: { from: string; to: string }) {
  const days = (Date.parse(value.to) - Date.parse(value.from)) / 86400000;
  return days >= 0 && days < 366;
}
export const reportQuerySchema = z
  .object({
    ...dateRangeFields,
    groupBy: z.enum(['day', 'month']).default('day'),
    method: z.enum(['CASH', 'BANK_TRANSFER']).optional(),
  })
  .strict()
  .refine(validDateRange, 'Khoảng ngày phải đúng thứ tự và tối đa 366 ngày');
export type ReportQuery = z.infer<typeof reportQuerySchema>;
export const reportAmountsSchema = z.object({
  paymentCount: integer,
  subtotal: integer,
  discount: integer,
  serviceCharge: integer,
  tax: integer,
  collected: integer,
});
export const reportSchema = z.object({
  from: date,
  to: date,
  timezone: z.string(),
  groupBy: z.enum(['day', 'month']),
  method: z.enum(['CASH', 'BANK_TRANSFER']).nullable(),
  generatedAt: z.iso.datetime(),
  totals: reportAmountsSchema.extend({ averagePayment: integer }),
  buckets: z.array(reportAmountsSchema.extend({ period: date })),
  methods: z.array(
    z.object({
      method: z.enum(['CASH', 'BANK_TRANSFER']),
      paymentCount: integer,
      collected: integer,
    }),
  ),
  bestSellers: z.array(
    z.object({
      menuItemId: z.uuid(),
      name: z.string(),
      quantity: integer,
      lineAmount: integer,
      orderCount: integer,
    }),
  ),
});
export type RevenueReport = z.infer<typeof reportSchema>;
export const paginationFields = {
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
};
const sessionStatus = z.enum(['OPEN', 'PAYMENT_REQUESTED', 'CLOSED']);
export const historyQuerySchema = z
  .object({
    ...dateRangeFields,
    ...paginationFields,
    status: z.enum(orderStatuses).optional(),
    source: z.enum(['GUEST', 'STAFF']).optional(),
    sessionStatus: sessionStatus.optional(),
    tableId: z.uuid().optional(),
    number: z.coerce.number().int().min(1).max(2147483647).optional(),
  })
  .strict()
  .refine(validDateRange, 'Khoảng ngày phải đúng thứ tự và tối đa 366 ngày');
export type HistoryQuery = z.infer<typeof historyQuerySchema>;
export const historySummarySchema = orderSchema
  .pick({
    id: true,
    number: true,
    status: true,
    source: true,
    totalAmount: true,
    createdAt: true,
  })
  .extend({
    itemCount: integer,
    session: z.object({
      id: z.uuid(),
      status: sessionStatus,
      tableId: z.uuid(),
      tableName: z.string(),
      openedAt: z.iso.datetime(),
      closedAt: z.iso.datetime().nullable(),
    }),
    paymentId: z.uuid().nullable(),
  });
export const historyDetailSchema = historySummarySchema.extend({
  order: orderSchema.omit({ idempotencyKey: true }),
});
export type HistoryDetail = z.infer<typeof historyDetailSchema>;
export const historyPageSchema = z.object({
  orders: z.array(historySummarySchema),
  total: integer,
  page: integer,
  pageSize: integer,
  timezone: z.string(),
});
export const activityQuerySchema = z
  .object({
    ...dateRangeFields,
    ...paginationFields,
    actorUserId: z.uuid().optional(),
    action: z.string().trim().min(1).max(120).optional(),
  })
  .strict()
  .refine(validDateRange, 'Khoảng ngày phải đúng thứ tự và tối đa 366 ngày');
export type ActivityQuery = z.infer<typeof activityQuerySchema>;
export const activitySchema = z.object({
  id: z.uuid(),
  action: z.string(),
  entityType: z.string(),
  entityId: z.string().nullable(),
  createdAt: z.iso.datetime(),
  actor: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  details: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
});
export const activityPageSchema = z.object({
  entries: z.array(activitySchema),
  total: integer,
  page: integer,
  pageSize: integer,
  timezone: z.string(),
});
export const staffRoles = ['OWNER', 'MANAGER', 'CASHIER', 'WAITER', 'KITCHEN'] as const;
const name = z.string().trim().min(2).max(120);
export const newPasswordSchema = z.string().min(12, 'Mật khẩu tối thiểu 12 ký tự').max(128);
export const staffCreateSchema = z
  .object({
    name,
    email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
    password: newPasswordSchema,
    role: z.enum(staffRoles),
  })
  .strict();
export type StaffCreate = z.infer<typeof staffCreateSchema>;
export const staffUpdateSchema = z
  .object({
    name,
    role: z.enum(staffRoles),
    isActive: z.boolean(),
    expectedUpdatedAt: z.iso.datetime(),
  })
  .strict();
export type StaffUpdate = z.infer<typeof staffUpdateSchema>;
export const staffPasswordSchema = z
  .object({
    password: newPasswordSchema,
    reason: z.string().trim().min(3).max(500),
    expectedUpdatedAt: z.iso.datetime(),
  })
  .strict();
export type StaffPassword = z.infer<typeof staffPasswordSchema>;
export const staffListQuerySchema = z
  .object({
    ...paginationFields,
    search: z.string().trim().max(120).optional(),
    role: z.enum(staffRoles).optional(),
    active: z.enum(['true', 'false']).optional(),
  })
  .strict();
export type StaffListQuery = z.infer<typeof staffListQuerySchema>;
export const staffMemberSchema = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  email: z.email(),
  name: z.string(),
  role: z.enum(staffRoles),
  isActive: z.boolean(),
  userActive: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type StaffMember = z.infer<typeof staffMemberSchema>;
export const staffPageSchema = z.object({
  members: z.array(staffMemberSchema),
  total: integer,
  page: integer,
  pageSize: integer,
});

export function localDate(now: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const value = (type: string) => parts.find((part) => part.type === type)!.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}
export function recentDateRange(now: Date, timezone: string) {
  const to = localDate(now, timezone);
  return { from: new Date(Date.parse(to) - 29 * 86400000).toISOString().slice(0, 10), to };
}
