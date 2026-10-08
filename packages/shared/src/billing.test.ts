import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { calculateBill, paymentInputSchema, discountInputSchema } from './billing';

test('billing aggregates integer VND, discount, service charge and tax in the agreed order', () => {
  assert.deepEqual(
    calculateBill({ subtotal: 70101, discount: 1001, serviceChargeBps: 500, taxBps: 800 }),
    {
      subtotal: 70101,
      discount: 1001,
      serviceChargeBps: 500,
      serviceCharge: 3455,
      taxBps: 800,
      tax: 5804,
      total: 78359,
    },
  );
});
test('billing rounds each charge half-up and handles zero/full discounts', () => {
  assert.equal(
    calculateBill({ subtotal: 1, discount: 0, serviceChargeBps: 5000, taxBps: 0 }).total,
    2,
  );
  assert.equal(
    calculateBill({ subtotal: 3, discount: 0, serviceChargeBps: 3333, taxBps: 5000 }).total,
    6,
  );
  assert.equal(
    calculateBill({ subtotal: 35000, discount: 35000, serviceChargeBps: 10000, taxBps: 10000 })
      .total,
    0,
  );
});
test('billing rejects excess discount, unsafe rates, fractions and Int overflow', () => {
  const base = { subtotal: 100, discount: 0, serviceChargeBps: 0, taxBps: 0 };
  for (const input of [
    { ...base, discount: 101 },
    { ...base, serviceChargeBps: 10001 },
    { ...base, discount: 0.5 },
    { ...base, subtotal: -1 },
    { ...base, subtotal: 2147483647, serviceChargeBps: 10000, taxBps: 10000 },
  ])
    assert.throws(() => calculateBill(input));
});
test('payment requires manual confirmation, correct reference rules and strict payload', () => {
  const input = {
    idempotencyKey: randomUUID(),
    revision: 'a'.repeat(64),
    method: 'CASH',
    paidAmount: 35000,
    reference: null,
    receivedConfirmed: true,
  };
  assert.equal(paymentInputSchema.safeParse(input).success, true);
  for (const bad of [
    { ...input, receivedConfirmed: false },
    { ...input, method: 'BANK_TRANSFER' },
    { ...input, reference: 'extra' },
    { ...input, restaurantId: randomUUID() },
    { ...input, paidAmount: 35000.5 },
  ])
    assert.equal(paymentInputSchema.safeParse(bad).success, false);
  assert.equal(
    paymentInputSchema.safeParse({
      ...input,
      method: 'BANK_TRANSFER',
      reference: 'bank-confirmed-123',
    }).success,
    true,
  );
});
test('discount requires a reason only when a positive amount is applied', () => {
  const input = { amount: 1000, reason: 'Ưu đãi được duyệt', revision: 'a'.repeat(64) };
  assert.equal(discountInputSchema.safeParse(input).success, true);
  assert.equal(discountInputSchema.safeParse({ ...input, reason: null }).success, false);
  assert.equal(
    discountInputSchema.safeParse({ ...input, amount: 0, reason: null }).success,
    true,
  );
});
