import { loginStaff } from './login-staff';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import {
  calculateBill,
  reportSchema,
  historyPageSchema,
  historyDetailSchema,
  activityPageSchema,
  staffPageSchema,
  staffMemberSchema,
  type RevenueReport,
  type StaffMember,
} from '@dineflow/shared';
import { createApp } from '../src/bootstrap';
import { PrismaService } from '../src/database/prisma.service';
import { AuthService } from '../src/auth/auth.service';
import { CONFIG, type AppConfig } from '../src/config/env';
import { hashPassword, verifyPassword } from '../src/auth/password';
import { AccountService } from '../src/security/account.service';
import { testDatabaseUrl } from './test-env';

test('Phase 7 real scoped revenue, local dates, history, audit and staff administration', async (t) => {
  process.env.DATABASE_URL = testDatabaseUrl();
  process.env.NODE_ENV = 'test';
  const app = await createApp(false),
    db = app.get(PrismaService),
    auth = app.get(AuthService),
    config = app.get<AppConfig>(CONFIG);
  await app.listen(0, '127.0.0.1');
  const base = `${await app.getUrl()}/api/v1`,
    suffix = randomUUID(),
    ids = [randomUUID(), randomUUID()];
  const password = randomBytes(24).toString('hex'),
    passwordHash = await hashPassword(password);
  const userIds: string[] = [];
  async function request(path: string, cookie = '', method = 'GET', body: unknown = {}) {
    return fetch(`${base}${path}`, {
      method,
      headers: {
        Cookie: cookie,
        'Content-Type': 'application/json',
        'X-DineFlow-Client': 'web',
        Origin: config.APP_ORIGIN,
      },
      ...(method !== 'GET' ? { body: JSON.stringify(body) } : {}),
    });
  }
  async function json<T>(response: Response, status = 200): Promise<T> {
    assert.equal(response.status, status, await response.clone().text());
    return response.json() as Promise<T>;
  }
  async function account(
    role: 'OWNER' | 'MANAGER' | 'WAITER' | 'CASHIER' | 'KITCHEN',
    restaurantId = ids[0]!,
  ) {
    const user = await db.user.create({
      data: {
        email: `${randomUUID()}@admin.test`,
        name: role,
        passwordHash,
        memberships: { create: { restaurantId, role } },
      },
      include: { memberships: true },
    });
    userIds.push(user.id);
    const login = await loginStaff(auth, { email: user.email, password });
    return {
      user,
      member: user.memberships[0]!,
      cookie: `df_access=${login.accessToken}; df_refresh=${login.refreshToken}`,
    };
  }
  try {
    for (const [index, id] of ids.entries())
      await db.restaurant.create({
        data: {
          id,
          slug: `admin-${index}-${suffix}`,
          name: `Admin ${index}`,
          timezone: 'Asia/Ho_Chi_Minh',
        },
      });
    const owner = await account('OWNER'),
      manager = await account('MANAGER'),
      waiter = await account('WAITER'),
      cashier = await account('CASHIER'),
      kitchen = await account('KITCHEN'),
      foreign = await account('OWNER', ids[1]!);
    const category = await db.menuCategory.create({
      data: { restaurantId: ids[0]!, name: 'Drinks' },
    });
    const item = await db.menuItem.create({
      data: {
        restaurantId: ids[0]!,
        categoryId: category.id,
        name: 'Trà xưa',
        basePrice: 10000,
      },
    });
    async function context(time: string, restaurantId = ids[0]!, closed = true) {
      const table = await db.diningTable.create({
        data: {
          restaurantId,
          name: `Table ${randomUUID()}`,
          publicCode: randomBytes(24).toString('base64url'),
          status: closed ? 'NEEDS_CLEANING' : 'OCCUPIED',
        },
      });
      const at = new Date(time);
      const session = await db.diningSession.create({
        data: {
          restaurantId,
          tableId: table.id,
          status: closed ? 'CLOSED' : 'OPEN',
          openedAt: new Date(at.getTime() - 3600000),
          closedAt: closed ? at : null,
        },
      });
      return { table, session };
    }
    async function payment(
      time: string,
      quantity = 1,
      method: 'CASH' | 'BANK_TRANSFER' = 'CASH',
      discount = 0,
    ) {
      const ctx = await context(time),
        at = new Date(time);
      const order = await db.order.create({
        data: {
          restaurantId: ids[0]!,
          diningSessionId: ctx.session.id,
          source: 'STAFF',
          status: 'SERVED',
          idempotencyKey: randomUUID(),
          requestHash: 'a'.repeat(64),
          totalAmount: quantity * 10000,
          note: 'Historical note',
          createdAt: at,
          servedAt: at,
          items: {
            create: {
              menuItemId: item.id,
              nameSnapshot: 'Trà xưa',
              basePriceSnapshot: 10000,
              unitPrice: 10000,
              quantity,
              totalAmount: quantity * 10000,
              note: 'Ít đá',
            },
          },
        },
      });
      const amounts = calculateBill({
        subtotal: quantity * 10000,
        discount,
        serviceChargeBps: 500,
        taxBps: 800,
      });
      const paid = await db.payment.create({
        data: {
          restaurantId: ids[0]!,
          diningSessionId: ctx.session.id,
          method,
          ...amounts,
          paidAmount: amounts.total,
          completedAt: at,
        },
      });
      return { ...ctx, order, paid };
    }
    const before = await payment('2026-09-30T16:59:59.999Z');
    const start = await payment('2026-09-30T17:00:00Z', 2, 'CASH', 1000);
    const next = await payment('2026-10-01T17:00:00Z', 1, 'BANK_TRANSFER');
    const zero = await payment('2026-10-02T12:00:00Z', 1, 'CASH', 10000);
    await payment('2026-10-02T17:00:00Z');
    const foreignContext = await context('2026-10-01T12:00:00Z', ids[1]!);
    await db.payment.create({
      data: {
        restaurantId: ids[1]!,
        diningSessionId: foreignContext.session.id,
        method: 'CASH',
        subtotal: 90000,
        total: 90000,
        paidAmount: 90000,
        completedAt: new Date('2026-10-01T12:00:00Z'),
      },
    });
    const unpaid = await context('2026-10-01T12:00:00Z', ids[0]!, false);
    await db.order.create({
      data: {
        restaurantId: ids[0]!,
        diningSessionId: unpaid.session.id,
        source: 'STAFF',
        status: 'SERVED',
        idempotencyKey: randomUUID(),
        requestHash: 'b'.repeat(64),
        totalAmount: 70000,
        createdAt: new Date('2026-10-01T12:00:00Z'),
        items: {
          create: {
            menuItemId: item.id,
            nameSnapshot: 'Trà xưa',
            basePriceSnapshot: 10000,
            unitPrice: 10000,
            quantity: 7,
            totalAmount: 70000,
          },
        },
      },
    });
    const cancelled = await db.order.create({
      data: {
        restaurantId: ids[0]!,
        diningSessionId: start.session.id,
        source: 'STAFF',
        status: 'CANCELLED',
        idempotencyKey: randomUUID(),
        requestHash: 'c'.repeat(64),
        totalAmount: 990000,
        createdAt: new Date('2026-10-01T10:00:00Z'),
        cancelledAt: new Date('2026-10-01T11:00:00Z'),
        cancellationReason: 'Khách hủy',
        items: {
          create: {
            menuItemId: item.id,
            nameSnapshot: 'Trà xưa',
            basePriceSnapshot: 10000,
            unitPrice: 10000,
            quantity: 99,
            totalAmount: 990000,
          },
        },
      },
    });
    const query = 'from=2026-10-01&to=2026-10-02';

    await t.test('reports and staff are backend admin-only and tenant scoped', async () => {
      for (const path of [
        `/reports/revenue?${query}`,
        `/reports/orders?${query}`,
        `/reports/activity?${query}`,
        '/staff',
      ]) {
        assert.equal((await request(path)).status, 401);
        for (const actor of [waiter, cashier, kitchen])
          assert.equal((await request(path, actor.cookie)).status, 403);
        assert.equal((await request(path, manager.cookie)).status, 200);
      }
      assert.equal(
        (await request(`/reports/orders/${start.order.id}`, foreign.cookie)).status,
        404,
      );
      const staff = staffPageSchema.parse(await json(await request('/staff', foreign.cookie)));
      assert.equal(staff.total, 1);
      assert.equal(staff.members[0]!.userId, foreign.user.id);
    });
    await t.test(
      'strict dates filters pagination and SQL-like strings cannot bypass validation or scope',
      async () => {
        for (const extra of [
          'from=2023-02-29&to=2023-03-01',
          'from=2026-10-02&to=2026-10-01',
          'from=2025-01-01&to=2026-01-02',
          `${query}&restaurantId=${ids[1]}`,
          `${query}&method=CARD`,
          `${query}&groupBy=year`,
          `${query}&from=2026-10-03`,
        ])
          assert.equal((await request(`/reports/revenue?${extra}`, owner.cookie)).status, 400);
        assert.equal(
          (await request(`/reports/orders?${query}&pageSize=51`, owner.cookie)).status,
          400,
        );
        assert.equal(
          (await request(`/reports/activity?${query}&actorUserId=bad`, owner.cookie)).status,
          400,
        );
      },
    );
    await t.test(
      'completedAt local day inclusive boundaries, zero payments, unpaid/cancelled exclusion and methods',
      async () => {
        const data = reportSchema.parse(
          await json<RevenueReport>(await request(`/reports/revenue?${query}`, owner.cookie)),
        );
        assert.equal(data.timezone, 'Asia/Ho_Chi_Minh');
        assert.equal(data.totals.paymentCount, 3);
        assert.equal(data.totals.collected, start.paid.paidAmount + next.paid.paidAmount);
        assert.equal(data.totals.subtotal, 40000);
        assert.equal(data.totals.discount, 11000);
        assert.equal(
          data.totals.serviceCharge,
          start.paid.serviceCharge + next.paid.serviceCharge,
        );
        assert.equal(data.totals.tax, start.paid.tax + next.paid.tax);
        assert.deepEqual(
          data.buckets.map((b) => [b.period, b.paymentCount]),
          [
            ['2026-10-01', 1],
            ['2026-10-02', 2],
          ],
        );
        assert.equal(data.bestSellers[0]!.quantity, 4);
        assert.equal(data.bestSellers[0]!.lineAmount, 40000);
        assert.equal(data.bestSellers[0]!.orderCount, 3);
        const bank = reportSchema.parse(
          await json(
            await request(`/reports/revenue?${query}&method=BANK_TRANSFER`, manager.cookie),
          ),
        );
        assert.equal(bank.totals.paymentCount, 1);
        assert.equal(bank.totals.collected, next.paid.paidAmount);
        assert.equal(bank.methods[0]!.collected, 0);
        assert.equal(bank.bestSellers[0]!.quantity, 1);
      },
    );
    await t.test(
      'monthly partial ranges, empty buckets and totals larger than Int32 remain exact',
      async () => {
        const data = reportSchema.parse(
          await json(
            await request(
              `/reports/revenue?from=2026-08-15&to=2026-10-02&groupBy=month`,
              owner.cookie,
            ),
          ),
        );
        assert.deepEqual(
          data.buckets.map((b) => b.period),
          ['2026-08-01', '2026-09-01', '2026-10-01'],
        );
        assert.equal(data.buckets[0]!.collected, 0);
        assert.equal(data.buckets[1]!.collected, before.paid.paidAmount);
        for (let i = 0; i < 2; i++) {
          const ctx = await context('2026-01-05T12:00:00Z');
          await db.payment.create({
            data: {
              restaurantId: ids[0]!,
              diningSessionId: ctx.session.id,
              method: 'CASH',
              subtotal: 2000000000,
              total: 2000000000,
              paidAmount: 2000000000,
              completedAt: new Date('2026-01-05T12:00:00Z'),
            },
          });
        }
        const large = reportSchema.parse(
          await json(
            await request('/reports/revenue?from=2026-01-05&to=2026-01-05', owner.cookie),
          ),
        );
        assert.equal(large.totals.collected, 4000000000);
        assert.equal(large.totals.averagePayment, 2000000000);
        const empty = reportSchema.parse(
          await json(
            await request('/reports/revenue?from=2026-07-01&to=2026-07-02', owner.cookie),
          ),
        );
        assert.equal(empty.buckets.length, 2);
        assert.equal(empty.totals.averagePayment, 0);
        assert.equal(empty.bestSellers.length, 0);
      },
    );
    await t.test(
      'timezone conversion handles a 23-hour DST day without assuming a fixed UTC offset',
      async () => {
        await db.restaurant.update({
          where: { id: ids[0]! },
          data: { timezone: 'America/New_York' },
        });
        try {
          await payment('2026-03-08T04:59:59.999Z');
          await payment('2026-03-08T05:00:00Z');
          await payment('2026-03-09T03:59:59.999Z');
          await payment('2026-03-09T04:00:00Z');
          const data = reportSchema.parse(
            await json(
              await request('/reports/revenue?from=2026-03-08&to=2026-03-08', owner.cookie),
            ),
          );
          assert.equal(data.totals.paymentCount, 2);
          assert.equal(data.buckets[0]!.period, '2026-03-08');
        } finally {
          await db.restaurant.update({
            where: { id: ids[0]! },
            data: { timezone: 'Asia/Ho_Chi_Minh' },
          });
        }
      },
    );
    await t.test(
      'history includes closed and active sessions, preserves snapshots after archive, filters and paginates safely',
      async () => {
        await db.menuItem.update({
          where: { id: item.id },
          data: { name: 'Trà hôm nay', basePrice: 99000, archivedAt: new Date() },
        });
        const data = historyPageSchema.parse(
          await json(await request(`/reports/orders?${query}&pageSize=2`, owner.cookie)),
        );
        assert.equal(data.total, 5);
        assert.equal(data.orders.length, 2);
        const nextPage = historyPageSchema.parse(
          await json(await request(`/reports/orders?${query}&pageSize=2&page=2`, owner.cookie)),
        );
        assert.ok(nextPage.orders.every((o) => !data.orders.some((row) => row.id === o.id)));
        const cancelledOnly = historyPageSchema.parse(
          await json(
            await request(
              `/reports/orders?${query}&status=CANCELLED&sessionStatus=CLOSED`,
              owner.cookie,
            ),
          ),
        );
        assert.equal(cancelledOnly.total, 1);
        assert.equal(cancelledOnly.orders[0]!.id, cancelled.id);
        const detail = historyDetailSchema.parse(
          await json(await request(`/reports/orders/${start.order.id}`, owner.cookie)),
        );
        assert.equal(detail.order.items[0]!.name, 'Trà xưa');
        assert.equal(detail.order.items[0]!.unitPrice, 10000);
        assert.equal(detail.paymentId, start.paid.id);
        assert.equal('idempotencyKey' in detail.order, false);
        assert.equal('requestHash' in detail.order, false);
        assert.equal(
          (await request(`/reports/orders/${foreignContext.session.id}`, owner.cookie)).status,
          404,
        );
        const report = reportSchema.parse(
          await json(await request(`/reports/revenue?${query}`, owner.cookie)),
        );
        assert.equal(report.bestSellers[0]!.name, 'Trà xưa');
      },
    );
    await t.test(
      'audit filters and pagination preserve disabled actor history and exclude arbitrary metadata/secrets',
      async () => {
        const entry = await db.activityLog.create({
          data: {
            restaurantId: ids[0]!,
            actorUserId: waiter.user.id,
            action: 'test.audit',
            entityType: 'Order',
            entityId: start.order.id,
            createdAt: new Date('2026-10-01T12:00:00Z'),
            metadata: {
              reason: 'Lý do an toàn',
              from: 'PENDING',
              to: 'SERVED',
              password: 'never-return',
              token: 'never-return',
              guestSessionId: randomUUID(),
              nested: { secret: true },
            },
          },
        });
        await db.activityLog.create({
          data: {
            restaurantId: ids[0]!,
            action: 'test.audit',
            entityType: 'System',
            createdAt: new Date('2026-10-01T13:00:00Z'),
          },
        });
        await db.activityLog.create({
          data: {
            restaurantId: ids[1]!,
            actorUserId: foreign.user.id,
            action: 'test.audit',
            entityType: 'System',
            createdAt: new Date('2026-10-01T14:00:00Z'),
          },
        });
        const page = activityPageSchema.parse(
          await json(
            await request(
              `/reports/activity?${query}&action=test.audit&pageSize=1`,
              owner.cookie,
            ),
          ),
        );
        assert.equal(page.total, 2);
        assert.equal(page.entries[0]!.actor, null);
        const filter = activityPageSchema.parse(
          await json(
            await request(
              `/reports/activity?${query}&actorUserId=${waiter.user.id}`,
              owner.cookie,
            ),
          ),
        );
        assert.equal(filter.entries[0]!.id, entry.id);
        assert.equal(filter.entries[0]!.actor!.name, 'WAITER');
        assert.deepEqual(filter.entries[0]!.details, {
          reason: 'Lý do an toàn',
          from: 'PENDING',
          to: 'SERVED',
        });
      },
    );
    let created: StaffMember;
    const createdEmail = `new.${suffix}@admin.test`;
    await t.test(
      'staff create rejects OWNER delegation, cross-tenant emails and private fields in DTO/audit',
      async () => {
        const input = {
          email: createdEmail.toUpperCase(),
          name: 'New staff',
          password,
          role: 'WAITER',
        };
        created = staffMemberSchema.parse(
          await json(await request('/staff', manager.cookie, 'POST', input), 201),
        );
        userIds.push(created.userId);
        assert.equal(created.email, createdEmail);
        assert.equal('passwordHash' in created, false);
        assert.equal(
          (
            await request('/staff', manager.cookie, 'POST', {
              ...input,
              email: `owner.${suffix}@admin.test`,
              role: 'OWNER',
            })
          ).status,
          403,
        );
        assert.equal(
          (
            await request('/staff', owner.cookie, 'POST', {
              ...input,
              email: foreign.user.email,
            })
          ).status,
          409,
        );
        assert.equal(
          (
            await request('/staff', owner.cookie, 'POST', {
              ...input,
              email: `bad.${suffix}@admin.test`,
              restaurantId: ids[1],
            })
          ).status,
          400,
        );
        const stored = await db.user.findUniqueOrThrow({ where: { id: created.userId } });
        assert.ok(await verifyPassword(password, stored.passwordHash));
        const audit = await db.activityLog.findFirstOrThrow({
          where: { entityId: created.id, action: 'staff.created' },
        });
        assert.ok(!JSON.stringify(audit).includes(password));
      },
    );
    await t.test(
      'role/status changes revoke old sessions; stale updates and self/OWNER/foreign changes are rejected',
      async () => {
        const credentials = await loginStaff(auth, { email: created.email, password });
        const input = {
          name: created.name,
          role: 'CASHIER',
          isActive: true,
          expectedUpdatedAt: created.updatedAt,
        };
        created = staffMemberSchema.parse(
          await json(await request(`/staff/${created.id}`, manager.cookie, 'PATCH', input)),
        );
        assert.equal(
          (await request('/auth/me', `df_access=${credentials.accessToken}`)).status,
          401,
        );
        assert.equal(
          (await request(`/staff/${created.id}`, manager.cookie, 'PATCH', input)).status,
          409,
        );
        assert.equal(
          (
            await request(`/staff/${owner.member.id}`, manager.cookie, 'PATCH', {
              name: 'Owner',
              role: 'WAITER',
              isActive: true,
              expectedUpdatedAt: owner.member.updatedAt.toISOString(),
            })
          ).status,
          403,
        );
        assert.equal(
          (
            await request(`/staff/${owner.member.id}`, owner.cookie, 'PATCH', {
              name: 'Owner',
              role: 'OWNER',
              isActive: false,
              expectedUpdatedAt: owner.member.updatedAt.toISOString(),
            })
          ).status,
          409,
        );
        assert.equal(
          (
            await request(`/staff/${foreign.member.id}`, owner.cookie, 'PATCH', {
              ...input,
              expectedUpdatedAt: foreign.member.updatedAt.toISOString(),
            })
          ).status,
          404,
        );
        const disabled = staffMemberSchema.parse(
          await json(
            await request(`/staff/${created.id}`, manager.cookie, 'PATCH', {
              name: created.name,
              role: created.role,
              isActive: false,
              expectedUpdatedAt: created.updatedAt,
            }),
          ),
        );
        await assert.rejects(loginStaff(auth, { email: created.email, password }));
        created = staffMemberSchema.parse(
          await json(
            await request(`/staff/${created.id}`, owner.cookie, 'PATCH', {
              name: disabled.name,
              role: disabled.role,
              isActive: true,
              expectedUpdatedAt: disabled.updatedAt,
            }),
          ),
        );
        assert.equal(
          (await request('/auth/me', `df_access=${credentials.accessToken}`)).status,
          401,
        );
      },
    );
    await t.test(
      'password reset requires a reason, replaces hash, revokes refresh/access and never logs password',
      async () => {
        const credentials = await loginStaff(auth, { email: created.email, password });
        const changedPassword = `New!${randomBytes(24).toString('base64url')}`;
        const accounts = app.get(AccountService);
        await accounts.request(created.email, 'RESET_PASSWORD');
        const pendingToken = await db.accountToken.findFirstOrThrow({
          where: { userId: created.userId, consumedAt: null },
        });
        const version = (await db.user.findUniqueOrThrow({ where: { id: created.userId } }))
          .credentialVersion;
        assert.equal(
          (
            await request(`/staff/${created.id}/password`, manager.cookie, 'POST', {
              password: changedPassword,
              reason: '',
              expectedUpdatedAt: created.updatedAt,
            })
          ).status,
          400,
        );
        created = staffMemberSchema.parse(
          await json(
            await request(`/staff/${created.id}/password`, manager.cookie, 'POST', {
              password: changedPassword,
              reason: 'Nhân viên quên mật khẩu',
              expectedUpdatedAt: created.updatedAt,
            }),
            201,
          ),
        );
        assert.equal(
          (await request('/auth/me', `df_access=${credentials.accessToken}`)).status,
          401,
        );
        assert.equal(
          (await request('/auth/refresh', `df_refresh=${credentials.refreshToken}`, 'POST'))
            .status,
          401,
        );
        await assert.rejects(loginStaff(auth, { email: created.email, password }));
        assert.equal(
          (await db.accountToken.findUniqueOrThrow({ where: { id: pendingToken.id } }))
            .consumedAt !== null,
          true,
        );
        assert.equal(
          (await db.user.findUniqueOrThrow({ where: { id: created.userId } }))
            .credentialVersion,
          version + 1,
        );
        assert.ok(await loginStaff(auth, { email: created.email, password: changedPassword }));
        const audit = await db.activityLog.findFirstOrThrow({
          where: { entityId: created.id, action: 'staff.password_reset' },
        });
        assert.deepEqual(audit.metadata, { reason: 'Nhân viên quên mật khẩu' });
        assert.ok(!JSON.stringify(audit).includes(changedPassword));
      },
    );
    await t.test(
      'concurrent OWNER demotions preserve an active owner and recheck admin permission inside lock',
      async () => {
        const second = await account('OWNER');
        const responses = await Promise.all([
          request(`/staff/${second.member.id}`, owner.cookie, 'PATCH', {
            name: 'Second',
            role: 'WAITER',
            isActive: true,
            expectedUpdatedAt: second.member.updatedAt.toISOString(),
          }),
          request(`/staff/${owner.member.id}`, second.cookie, 'PATCH', {
            name: 'First',
            role: 'WAITER',
            isActive: true,
            expectedUpdatedAt: owner.member.updatedAt.toISOString(),
          }),
        ]);
        assert.equal(responses.filter((r) => r.status === 200).length, 1);
        assert.ok(responses.some((r) => r.status === 401 || r.status === 403));
        assert.equal(
          await db.staffMembership.count({
            where: {
              restaurantId: ids[0]!,
              role: 'OWNER',
              isActive: true,
              user: { isActive: true },
            },
          }),
          1,
        );
      },
    );
    void zero;
  } finally {
    await db.orderItemModifier.deleteMany({ where: { restaurantId: { in: ids } } });
    await db.orderItem.deleteMany({ where: { restaurantId: { in: ids } } });
    await db.order.deleteMany({ where: { restaurantId: { in: ids } } });
    await db.payment.deleteMany({ where: { restaurantId: { in: ids } } });
    await db.serviceRequest.deleteMany({ where: { restaurantId: { in: ids } } });
    await db.guestSession.deleteMany({
      where: { diningSession: { restaurantId: { in: ids } } },
    });
    await db.diningSession.deleteMany({ where: { restaurantId: { in: ids } } });
    await db.diningTable.deleteMany({ where: { restaurantId: { in: ids } } });
    await db.menuItem.deleteMany({ where: { restaurantId: { in: ids } } });
    await db.menuCategory.deleteMany({ where: { restaurantId: { in: ids } } });
    await db.activityLog.deleteMany({ where: { restaurantId: { in: ids } } });
    await db.refreshToken.deleteMany({ where: { authSession: { userId: { in: userIds } } } });
    await db.authSession.deleteMany({ where: { userId: { in: userIds } } });
    await db.staffMembership.deleteMany({ where: { restaurantId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await db.restaurant.deleteMany({ where: { id: { in: ids } } });
    await app.close();
  }
});
