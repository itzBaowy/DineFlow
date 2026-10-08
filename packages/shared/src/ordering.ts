import { z } from 'zod';
import { imageUrlSchema, modifierSchema } from './setup';
export const orderStatuses = [
  'PENDING_CONFIRMATION',
  'ACCEPTED',
  'PREPARING',
  'READY',
  'SERVED',
  'CANCELLED',
] as const;
export type OrderStatus = (typeof orderStatuses)[number];

export const emptyInputSchema = z.object({}).strict();
export const admissionInputSchema = z.object({ diningSessionId: z.uuid() }).strict();
export const closeEmptyInputSchema = z
  .object({ reason: z.string().trim().min(3).max(500) })
  .strict();
const note = z.string().trim().max(500).nullable();
export const orderLineInputSchema = z
  .object({
    menuItemId: z.uuid(),
    quantity: z.number().int().min(1).max(20),
    modifierOptionIds: z
      .array(z.uuid())
      .max(100)
      .refine((ids) => new Set(ids).size === ids.length, 'Tùy chọn bị trùng'),
    note,
  })
  .strict();
export const createOrderInputSchema = z
  .object({
    idempotencyKey: z.uuid(),
    diningSessionId: z.uuid(),
    items: z.array(orderLineInputSchema).min(1).max(20),
    note,
    expectedTotal: z.number().int().min(0).max(2147483647),
  })
  .strict();
export type CreateOrderInput = z.infer<typeof createOrderInputSchema>;
export type OrderLineInput = z.infer<typeof orderLineInputSchema>;
export const guestSchema = z.object({
  id: z.uuid(),
  diningSessionId: z.uuid(),
  expiresAt: z.iso.datetime(),
});
export const publicMenuItemSchema = z.object({
  id: z.uuid(),
  categoryId: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  imageUrl: imageUrlSchema,
  basePrice: z.number().int(),
  isAvailable: z.boolean(),
  modifierGroups: z.array(modifierSchema),
});
export const publicMenuSchema = z.object({
  restaurant: z.object({
    name: z.string(),
    logoUrl: imageUrlSchema,
    address: z.string().nullable(),
  }),
  table: z.object({ name: z.string() }),
  diningSessionId: z.uuid().nullable(),
  orderingEnabled: z.boolean(),
  categories: z.array(
    z.object({ id: z.uuid(), name: z.string(), description: z.string().nullable() }),
  ),
  items: z.array(publicMenuItemSchema),
});
export type PublicMenu = z.infer<typeof publicMenuSchema>;
export type PublicMenuItem = z.infer<typeof publicMenuItemSchema>;
export const orderSchema = z.object({
  id: z.uuid(),
  number: z.number().int(),
  diningSessionId: z.uuid(),
  idempotencyKey: z.uuid(),
  status: z.enum(orderStatuses),
  source: z.enum(['GUEST', 'STAFF']),
  cancellationReason: z.string().nullable(),
  acceptedAt: z.iso.datetime().nullable(),
  preparingAt: z.iso.datetime().nullable(),
  readyAt: z.iso.datetime().nullable(),
  servedAt: z.iso.datetime().nullable(),
  cancelledAt: z.iso.datetime().nullable(),
  totalAmount: z.number().int(),
  note,
  createdAt: z.iso.datetime(),
  items: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      basePrice: z.number().int(),
      unitPrice: z.number().int(),
      quantity: z.number().int(),
      totalAmount: z.number().int(),
      note,
      modifiers: z.array(
        z.object({ groupName: z.string(), name: z.string(), priceDelta: z.number().int() }),
      ),
    }),
  ),
});
export type CustomerOrder = z.infer<typeof orderSchema>;
export const orderStatusInputSchema = z
  .object({
    from: z.enum(orderStatuses),
    to: z.enum(orderStatuses),
    reason: z.string().trim().max(500).nullable(),
  })
  .strict()
  .superRefine((input, ctx) => {
    if (input.to === 'CANCELLED' ? !input.reason || input.reason.length < 3 : input.reason !== null)
      ctx.addIssue({
        code: 'custom',
        path: ['reason'],
        message:
          input.to === 'CANCELLED'
            ? 'Nhập lý do hủy tối thiểu 3 ký tự'
            : 'Chỉ nhập lý do khi hủy đơn',
      });
  });
export type OrderStatusInput = z.infer<typeof orderStatusInputSchema>;
export const orderListQuerySchema = z
  .object({
    status: z.enum(orderStatuses).default('PENDING_CONFIRMATION'),
    tableId: z.uuid().optional(),
    page: z.coerce.number().int().min(1).max(10000).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(12),
  })
  .strict();
export const kitchenListQuerySchema = orderListQuerySchema.extend({
  status: z.enum(['ACCEPTED', 'PREPARING', 'READY']).default('ACCEPTED'),
});
export type OrderListQuery = z.infer<typeof orderListQuerySchema>;
export const staffOrderSchema = orderSchema.extend({
  table: z.object({ id: z.uuid(), name: z.string() }),
});
export type StaffOrder = z.infer<typeof staffOrderSchema>;
export const orderPageSchema = z.object({
  orders: z.array(staffOrderSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
});
export const operationsSchema = z.object({
  counts: z.object({
    PENDING_CONFIRMATION: z.number().int(),
    ACCEPTED: z.number().int(),
    PREPARING: z.number().int(),
    READY: z.number().int(),
    SERVED: z.number().int(),
    CANCELLED: z.number().int(),
  }),
  occupiedTables: z.number().int(),
  needsCleaningTables: z.number().int(),
});
export const sessionTableSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  capacity: z.number().int(),
  publicCode: z.string(),
  status: z.enum(['AVAILABLE', 'OCCUPIED', 'NEEDS_CLEANING', 'OUT_OF_SERVICE']),
  session: z
    .object({
      id: z.uuid(),
      status: z.enum(['OPEN', 'PAYMENT_REQUESTED']),
      openedAt: z.iso.datetime(),
      orderCount: z.number().int(),
      totalAmount: z.number().int(),
    })
    .nullable(),
});
export type SessionTable = z.infer<typeof sessionTableSchema>;
