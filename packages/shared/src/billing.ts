import { z } from 'zod';
import { orderSchema } from './ordering';

const money = z.number().int().min(0).max(2147483647);
const bps = z.number().int().min(0).max(10000);
const reason = z.string().trim().min(3).max(500).nullable();
export const billTotalsSchema = z.object({
  subtotal: money,
  discount: money,
  discountReason: reason,
  serviceChargeBps: bps,
  serviceCharge: money,
  taxBps: bps,
  tax: money,
  total: money,
});
export const billOrderSchema = orderSchema.pick({
  id: true,
  number: true,
  status: true,
  totalAmount: true,
  createdAt: true,
  items: true,
});
export const billSchema = z.object({
  diningSessionId: z.uuid(),
  table: z.object({ id: z.uuid(), name: z.string() }),
  restaurant: z.object({
    name: z.string(),
    address: z.string().nullable(),
    phone: z.string().nullable(),
    currency: z.literal('VND'),
    timezone: z.string(),
  }),
  status: z.enum(['OPEN', 'PAYMENT_REQUESTED', 'CLOSED']),
  openedAt: z.iso.datetime(),
  closedAt: z.iso.datetime().nullable(),
  orders: z.array(billOrderSchema),
  totals: billTotalsSchema,
  validOrderCount: z.number().int().nonnegative(),
  blockingOrderCount: z.number().int().nonnegative(),
  cashierMaxDiscountBps: bps,
  canPay: z.boolean(),
  revision: z.string().regex(/^[a-f0-9]{64}$/),
});
export type Bill = z.infer<typeof billSchema>;
export const receiptBillSchema = billSchema
  .omit({ revision: true, canPay: true, cashierMaxDiscountBps: true, blockingOrderCount: true })
  .extend({ status: z.literal('CLOSED'), closedAt: z.iso.datetime() });
export const paymentMethods = ['CASH', 'BANK_TRANSFER'] as const;
export const receiptSchema = z.object({
  id: z.uuid(),
  diningSessionId: z.uuid(),
  status: z.literal('COMPLETED'),
  method: z.enum(paymentMethods),
  paidAmount: money,
  reference: z.string().nullable(),
  completedAt: z.iso.datetime(),
  bill: receiptBillSchema,
});
export type Receipt = z.infer<typeof receiptSchema>;
export const receiptPreviewSchema = receiptSchema
  .omit({ bill: true, reference: true, status: true })
  .extend({ tableName: z.string() });
export const guestBillSchema = z.object({
  diningSessionId: z.uuid(),
  tableName: z.string(),
  status: z.enum(['OPEN', 'PAYMENT_REQUESTED']),
  totals: billTotalsSchema.omit({ discountReason: true }),
  validOrderCount: z.number().int().nonnegative(),
  blockingOrderCount: z.number().int().nonnegative(),
});
export const discountInputSchema = z
  .object({ amount: money, reason, revision: z.string().regex(/^[a-f0-9]{64}$/) })
  .strict()
  .superRefine((value, ctx) => {
    if (value.amount > 0 ? value.reason === null : value.reason !== null)
      ctx.addIssue({
        code: 'custom',
        path: ['reason'],
        message: value.amount > 0 ? 'Nhập lý do giảm giá' : 'Bỏ lý do khi xóa giảm giá',
      });
  });
export type DiscountInput = z.infer<typeof discountInputSchema>;
export const paymentInputSchema = z
  .object({
    idempotencyKey: z.uuid(),
    revision: z.string().regex(/^[a-f0-9]{64}$/),
    method: z.enum(paymentMethods),
    paidAmount: money,
    reference: z.string().trim().min(3).max(120).nullable(),
    receivedConfirmed: z.literal(true),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.method === 'BANK_TRANSFER' ? value.reference === null : value.reference !== null)
      ctx.addIssue({
        code: 'custom',
        path: ['reference'],
        message:
          value.method === 'BANK_TRANSFER'
            ? 'Nhập mã giao dịch đã kiểm tra'
            : 'Tiền mặt không có mã chuyển khoản',
      });
  });
export type PaymentInput = z.infer<typeof paymentInputSchema>;
export const billingSessionInputSchema = z
  .object({
    from: z.enum(['OPEN', 'PAYMENT_REQUESTED']),
    to: z.enum(['OPEN', 'PAYMENT_REQUESTED']),
    reason,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.from === value.to ||
      (value.to === 'OPEN' ? value.reason === null : value.reason !== null)
    )
      ctx.addIssue({
        code: 'custom',
        path: ['reason'],
        message: 'Mở lại cần lý do; yêu cầu thanh toán chỉ chuyển từ phiên đang mở',
      });
  });
export type BillingSessionInput = z.infer<typeof billingSessionInputSchema>;

/** VND integers. Round each fee half-up; tax base includes the rounded service charge. */
export function calculateBill(input: {
  subtotal: number;
  discount: number;
  serviceChargeBps: number;
  taxBps: number;
}) {
  const { subtotal, discount, serviceChargeBps, taxBps } = z
    .object({ subtotal: money, discount: money, serviceChargeBps: bps, taxBps: bps })
    .parse(input);
  if (discount > subtotal) throw new RangeError('Giảm giá vượt tiền món');
  const net = BigInt(subtotal - discount);
  const charge = (net * BigInt(serviceChargeBps) + 5000n) / 10000n;
  const tax = ((net + charge) * BigInt(taxBps) + 5000n) / 10000n;
  const total = net + charge + tax;
  if (total > 2147483647n) throw new RangeError('Hóa đơn vượt giới hạn số tiền');
  return {
    subtotal,
    discount,
    serviceChargeBps,
    serviceCharge: Number(charge),
    taxBps,
    tax: Number(tax),
    total: Number(total),
  };
}
