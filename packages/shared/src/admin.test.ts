import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  reportQuerySchema,
  historyQuerySchema,
  staffCreateSchema,
  staffUpdateSchema,
  recentDateRange,
  localDate,
} from './admin';

test('report range validates real calendar dates, ordering, bounded inclusive range and strict query', () => {
  assert.ok(reportQuerySchema.safeParse({ from: '2024-02-29', to: '2024-02-29' }).success);
  for (const input of [
    { from: '2023-02-29', to: '2023-03-01' },
    { from: '2026-10-02', to: '2026-10-01' },
    { from: '2025-01-01', to: '2026-01-02' },
    { from: '2026-01-01', to: '2026-01-01', restaurantId: 'arbitrary' },
  ])
    assert.equal(reportQuerySchema.safeParse(input).success, false);
  assert.equal(
    historyQuerySchema.safeParse({ from: '2026-01-01', to: '2026-01-01', pageSize: '51' })
      .success,
    false,
  );
});
test('local report default spans 30 calendar dates across UTC and year boundaries', () => {
  const now = new Date('2025-12-31T18:00:00Z');
  assert.equal(localDate(now, 'Asia/Ho_Chi_Minh'), '2026-01-01');
  assert.deepEqual(recentDateRange(now, 'Asia/Ho_Chi_Minh'), {
    from: '2025-12-03',
    to: '2026-01-01',
  });
  assert.equal(localDate(now, 'America/New_York'), '2025-12-31');
});
test('staff inputs normalize identity and reject privilege extras or weak passwords', () => {
  const input = {
    name: ' Nhân viên ',
    email: ' STAFF@EXAMPLE.COM ',
    password: 'a-long-password',
    role: 'WAITER',
  };
  assert.equal(staffCreateSchema.parse(input).email, 'staff@example.com');
  assert.equal(staffCreateSchema.safeParse({ ...input, password: 'short' }).success, false);
  assert.equal(staffCreateSchema.safeParse({ ...input, restaurantId: 'fake' }).success, false);
  assert.equal(
    staffUpdateSchema.safeParse({ name: 'Staff', role: 'OWNER', isActive: true }).success,
    false,
  );
});
