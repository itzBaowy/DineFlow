import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canTransitionDiningSession, canTransitionOrder, loginSchema } from './index';

test('order policy rejects skipped, reversed and unauthorized transitions', () => {
  assert.equal(canTransitionOrder('PENDING_CONFIRMATION', 'ACCEPTED', 'WAITER'), true);
  assert.equal(canTransitionOrder('ACCEPTED', 'PREPARING', 'KITCHEN'), true);
  assert.equal(canTransitionOrder('PREPARING', 'READY', 'KITCHEN'), true);
  assert.equal(canTransitionOrder('READY', 'SERVED', 'WAITER'), true);
  assert.equal(canTransitionOrder('PENDING_CONFIRMATION', 'READY', 'OWNER'), false);
  assert.equal(canTransitionOrder('PREPARING', 'CANCELLED', 'OWNER'), false);
  assert.equal(canTransitionOrder('ACCEPTED', 'CANCELLED', 'WAITER'), false);
  assert.equal(canTransitionOrder('READY', 'SERVED', 'KITCHEN'), false);
  assert.equal(canTransitionOrder('CANCELLED', 'ACCEPTED', 'OWNER'), false);
});
test('closed dining sessions cannot reopen', () => {
  assert.equal(canTransitionDiningSession('PAYMENT_REQUESTED', 'OPEN'), true);
  assert.equal(canTransitionDiningSession('CLOSED', 'OPEN'), false);
  assert.equal(canTransitionDiningSession('OPEN', 'OPEN'), false);
});
test('login schema rejects injected role and normalizes email', () => {
  assert.equal(loginSchema.parse({ email: 'Owner@Dineflow.local', password: 'pass' }).email, 'owner@dineflow.local');
  assert.equal(loginSchema.safeParse({ email: 'owner@dineflow.local', password: 'pass', role: 'OWNER' }).success, false);
});
