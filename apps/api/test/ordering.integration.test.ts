import { loginStaff } from './login-staff';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { createApp } from '../src/bootstrap';
import { PrismaService } from '../src/database/prisma.service';
import { AuthService } from '../src/auth/auth.service';
import { hashPassword } from '../src/auth/password';
import { CONFIG, type AppConfig } from '../src/config/env';
import { testDatabaseUrl } from './test-env';
import type { CustomerOrder, PublicMenu, CreateOrderInput } from '@dineflow/shared';

test('Phase 3 dining sessions and guest ordering with real PostgreSQL', async (t) => {
  process.env.DATABASE_URL = testDatabaseUrl();
  process.env.NODE_ENV = 'test';
  const app = await createApp(false);
  const db = app.get(PrismaService),
    auth = app.get(AuthService),
    config = app.get<AppConfig>(CONFIG);
  await app.listen(0, '127.0.0.1');
  const base = `${await app.getUrl()}/api/v1`,
    suffix = randomUUID();
  const restaurant = await db.restaurant.create({
    data: { slug: `ordering-${suffix}`, name: 'Bếp thử nghiệm' },
  });
  const other = await db.restaurant.create({
    data: { slug: `ordering-other-${suffix}`, name: 'Other' },
  });
  const password = randomBytes(20).toString('hex'),
    passwordHash = await hashPassword(password);
  const users = await Promise.all(
    (['OWNER', 'MANAGER', 'WAITER', 'CASHIER', 'KITCHEN'] as const).map((role) =>
      db.user.create({
        data: {
          email: `${role}.${suffix}@ordering.test`,
          name: role,
          passwordHash,
          memberships: { create: { restaurantId: restaurant.id, role } },
        },
      }),
    ),
  );
  const cookies = await Promise.all(
    users.map(
      async (user) =>
        `df_access=${(await loginStaff(auth, { email: user.email, password })).accessToken}`,
    ),
  );
  const table = await db.diningTable.create({
    data: {
      restaurantId: restaurant.id,
      name: 'Bàn 01',
      publicCode: randomBytes(24).toString('base64url'),
    },
  });
  const foreign = await db.diningTable.create({
    data: {
      restaurantId: other.id,
      name: 'Other',
      publicCode: randomBytes(24).toString('base64url'),
    },
  });
  const category = await db.menuCategory.create({
    data: { restaurantId: restaurant.id, name: 'Đồ uống' },
  });
  const group = await db.modifierGroup.create({
    data: {
      restaurantId: restaurant.id,
      name: 'Size',
      minSelections: 1,
      maxSelections: 1,
      options: {
        create: [
          { name: 'M', priceDelta: 0 },
          { name: 'L', priceDelta: 5000 },
        ],
      },
    },
    include: { options: true },
  });
  const topping = await db.modifierGroup.create({
    data: {
      restaurantId: restaurant.id,
      name: 'Topping',
      minSelections: 0,
      maxSelections: 1,
      options: {
        create: [
          { name: 'Trân châu', priceDelta: 5000 },
          { name: 'Hết', priceDelta: 2000, isAvailable: false },
        ],
      },
    },
    include: { options: true },
  });
  const item = await db.menuItem.create({
    data: {
      restaurantId: restaurant.id,
      categoryId: category.id,
      name: 'Trà sữa',
      basePrice: 35000,
      modifierGroups: { create: [group, topping].map((g) => ({ modifierGroupId: g.id })) },
    },
  });
  const foreignCategory = await db.menuCategory.create({
    data: { restaurantId: other.id, name: 'Other' },
  });
  const foreignItem = await db.menuItem.create({
    data: { restaurantId: other.id, categoryId: foreignCategory.id, name: 'Other', basePrice: 1 },
  });
  const prefix = `/public/tables/${table.publicCode}`;
  async function request(path: string, method = 'GET', body: unknown = {}, cookie = '') {
    return fetch(`${base}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-DineFlow-Client': 'web',
        Origin: config.APP_ORIGIN,
        Cookie: cookie,
      },
      ...(method !== 'GET' ? { body: JSON.stringify(body) } : {}),
    });
  }
  async function json<T>(response: Response, status = 201): Promise<T> {
    assert.equal(response.status, status, await response.clone().text());
    return response.json() as Promise<T>;
  }
  let sessionId = '',
    guestA = '',
    guestB = '',
    firstOrder: CustomerOrder;
  const large = group.options.find((option) => option.name === 'L')!,
    pearls = topping.options.find((option) => option.name === 'Trân châu')!;
  function payload(overrides: Partial<CreateOrderInput> = {}): CreateOrderInput {
    return {
      idempotencyKey: randomUUID(),
      diningSessionId: sessionId,
      expectedTotal: 90000,
      items: [
        {
          menuItemId: item.id,
          quantity: 2,
          modifierOptionIds: [large.id, pearls.id],
          note: 'Ít đá',
        },
      ],
      note: 'Gọi lần đầu',
      ...overrides,
    };
  }
  try {
    await t.test(
      'public QR cannot open a table; staff RBAC, scope and concurrent opening',
      async () => {
        const menu = await json<PublicMenu>(await request(`${prefix}/menu`), 200);
        assert.equal(menu.orderingEnabled, false);
        assert.equal(menu.diningSessionId, null);
        assert.equal(menu.items.length, 1);
        assert.equal(menu.items[0]!.modifierGroups.length, 2);
        assert.equal(
          (await request(`${prefix}/guest`, 'POST', { diningSessionId: randomUUID() })).status,
          409,
        );
        assert.equal(
          (await request(`/dining-sessions/tables/${table.id}/open`, 'POST')).status,
          401,
        );
        for (const cookie of cookies.slice(3))
          assert.equal(
            (await request(`/dining-sessions/tables/${table.id}/open`, 'POST', {}, cookie)).status,
            403,
          );
        assert.equal(
          (await request(`/dining-sessions/tables/${foreign.id}/open`, 'POST', {}, cookies[0]))
            .status,
          404,
        );
        const replies = await Promise.all(
          [0, 1].map(() =>
            request(`/dining-sessions/tables/${table.id}/open`, 'POST', {}, cookies[2]),
          ),
        );
        assert.deepEqual(replies.map((r) => r.status).sort(), [201, 409]);
        sessionId = ((await replies.find((r) => r.status === 201)!.json()) as { id: string }).id;
        assert.equal(
          await db.diningSession.count({ where: { tableId: table.id, status: 'OPEN' } }),
          1,
        );
        assert.equal(
          (await db.diningTable.findUniqueOrThrow({ where: { id: table.id } })).status,
          'OCCUPIED',
        );
      },
    );
    await t.test(
      'admission uses HttpOnly scoped opaque cookies and preserves a valid visitor',
      async () => {
        const response = await request(`${prefix}/guest`, 'POST', { diningSessionId: sessionId });
        const guest = await json<{ id: string }>(response);
        const cookie = response.headers.get('set-cookie')!;
        assert.match(cookie, /HttpOnly/i);
        assert.match(cookie, /SameSite=Lax/i);
        assert.ok(cookie.includes(`Path=/api/v1${prefix}`));
        guestA = cookie.split(';')[0]!;
        const stored = await db.guestSession.findUniqueOrThrow({ where: { id: guest.id } });
        assert.notEqual(stored.tokenHash, guestA.split('=')[1]);
        assert.equal(stored.tokenHash.length, 64);
        assert.equal(
          (
            await json<{ id: string }>(
              await request(`${prefix}/guest`, 'POST', { diningSessionId: sessionId }, guestA),
            )
          ).id,
          guest.id,
        );
        const second = await request(`${prefix}/guest`, 'POST', { diningSessionId: sessionId });
        await json(second);
        guestB = second.headers.get('set-cookie')!.split(';')[0]!;
        assert.equal(
          (await request(`/public/tables/${foreign.publicCode}/orders`, 'GET', {}, guestA)).status,
          401,
        );
        assert.equal((await request(`${prefix}/orders`)).status, 401);
        assert.equal(
          (await request(`${prefix}/guest`, 'POST', { diningSessionId: randomUUID() }, guestA))
            .status,
          409,
        );
      },
    );
    await t.test(
      'server rejects client prices, quantities, unknown and invalid modifier choices',
      async () => {
        const baseLine = payload().items[0]!;
        for (const body of [
          { ...payload(), totalAmount: 1 },
          payload({ items: [{ ...baseLine, quantity: 0 }] }),
          payload({ items: [{ ...baseLine, menuItemId: foreignItem.id }] }),
          payload({ items: [{ ...baseLine, modifierOptionIds: [] }] }),
          payload({ items: [{ ...baseLine, modifierOptionIds: group.options.map((o) => o.id) }] }),
          payload({ items: [{ ...baseLine, modifierOptionIds: [large.id, large.id] }] }),
          payload({ items: [{ ...baseLine, modifierOptionIds: [large.id, randomUUID()] }] }),
          payload({
            items: [
              {
                ...baseLine,
                modifierOptionIds: [large.id, topping.options.find((o) => !o.isAvailable)!.id],
              },
            ],
          }),
        ])
          assert.equal((await request(`${prefix}/orders`, 'POST', body, guestA)).status, 400);
        assert.equal(await db.order.count({ where: { diningSessionId: sessionId } }), 0);
      },
    );
    await t.test(
      'concurrent retries create one order and snapshot price/name/options',
      async () => {
        const body = payload();
        const responses = await Promise.all(
          [0, 1, 2].map(() => request(`${prefix}/orders`, 'POST', body, guestA)),
        );
        const orders = await Promise.all(responses.map((r) => json<CustomerOrder>(r)));
        firstOrder = orders[0]!;
        assert.ok(orders.every((o) => o.id === firstOrder.id));
        assert.equal(firstOrder.status, 'PENDING_CONFIRMATION');
        assert.equal(firstOrder.totalAmount, 90000);
        assert.equal(firstOrder.items[0]!.unitPrice, 45000);
        assert.equal(firstOrder.items[0]!.name, 'Trà sữa');
        assert.equal(firstOrder.items[0]!.modifiers.length, 2);
        assert.equal(await db.order.count({ where: { diningSessionId: sessionId } }), 1);
        assert.equal(
          (await request(`${prefix}/orders`, 'POST', { ...body, note: 'Changed' }, guestA)).status,
          409,
        );
        assert.equal((await request(`${prefix}/orders`, 'POST', body, guestB)).status, 409);
        await db.menuItem.update({
          where: { id: item.id },
          data: { name: 'Tên mới', basePrice: 40000, isAvailable: false },
        });
        assert.equal(
          (await json<CustomerOrder>(await request(`${prefix}/orders`, 'POST', body, guestA)))
            .totalAmount,
          90000,
        );
        assert.equal((await request(`${prefix}/orders`, 'POST', payload(), guestA)).status, 400);
        await db.menuItem.update({ where: { id: item.id }, data: { isAvailable: true } });
      },
    );
    await t.test(
      'additional orders, changed pricing, inactive categories and private history',
      async () => {
        assert.equal((await request(`${prefix}/orders`, 'POST', payload(), guestA)).status, 409);
        const second = await json<CustomerOrder>(
          await request(`${prefix}/orders`, 'POST', payload({ expectedTotal: 100000 }), guestA),
        );
        assert.notEqual(second.id, firstOrder.id);
        assert.equal(second.diningSessionId, firstOrder.diningSessionId);
        const history = await json<CustomerOrder[]>(
          await request(`${prefix}/orders`, 'GET', {}, guestA),
          200,
        );
        assert.equal(history.length, 2);
        assert.equal(history.find((o) => o.id === firstOrder.id)!.items[0]!.name, 'Trà sữa');
        assert.deepEqual(await json(await request(`${prefix}/orders`, 'GET', {}, guestB), 200), []);
        await db.menuCategory.update({ where: { id: category.id }, data: { isActive: false } });
        assert.equal(
          (await json<PublicMenu>(await request(`${prefix}/menu`), 200)).items.length,
          0,
        );
        assert.equal(
          (await request(`${prefix}/orders`, 'POST', payload({ expectedTotal: 100000 }), guestA))
            .status,
          400,
        );
        await db.menuCategory.update({ where: { id: category.id }, data: { isActive: true } });
        const staffOrders = await json<CustomerOrder[]>(
          await request(`/dining-sessions/${sessionId}/orders`, 'GET', {}, cookies[2]),
          200,
        );
        assert.equal(staffOrders.length, 2);
        assert.equal(
          (
            await request(
              `/dining-sessions/tables/${table.id}/close-empty`,
              'POST',
              { reason: 'Không dùng bàn' },
              cookies[0],
            )
          ).status,
          409,
        );
      },
    );
    await t.test(
      'closed, payment-requested, expired and revoked guest sessions reject orders',
      async () => {
        const guestId = (
          await json<{ id: string }>(await request(`${prefix}/guest`, 'GET', {}, guestA), 200)
        ).id;
        await db.guestSession.update({ where: { id: guestId }, data: { revokedAt: new Date() } });
        assert.equal((await request(`${prefix}/orders`, 'GET', {}, guestA)).status, 401);
        await db.guestSession.update({
          where: { id: guestId },
          data: {
            revokedAt: null,
            createdAt: new Date(Date.now() - 60000),
            expiresAt: new Date(Date.now() - 1000),
          },
        });
        assert.equal((await request(`${prefix}/orders`, 'POST', payload(), guestA)).status, 401);
        await db.diningSession.update({
          where: { id: sessionId },
          data: { status: 'PAYMENT_REQUESTED', paymentRequestedAt: new Date() },
        });
        assert.equal((await request(`${prefix}/orders`, 'POST', payload(), guestB)).status, 409);
        await db.diningSession.update({
          where: { id: sessionId },
          data: { status: 'CLOSED', closedAt: new Date(), closeReason: 'Test fixture close' },
        });
        await db.diningTable.update({ where: { id: table.id }, data: { status: 'AVAILABLE' } });
        assert.equal((await request(`${prefix}/orders`, 'GET', {}, guestB)).status, 401);
      },
    );
    await t.test(
      'empty close revokes guests, cleaning permits a new session without old history',
      async () => {
        const next = await json<{ id: string }>(
          await request(`/dining-sessions/tables/${table.id}/open`, 'POST', {}, cookies[2]),
        );
        const admission = await request(
          `${prefix}/guest`,
          'POST',
          { diningSessionId: next.id },
          guestB,
        );
        await json(admission);
        const newCookie = admission.headers.get('set-cookie')!.split(';')[0]!;
        assert.deepEqual(
          await json(await request(`${prefix}/orders`, 'GET', {}, newCookie), 200),
          [],
        );
        assert.equal((await request(`${prefix}/orders`, 'GET', {}, guestB)).status, 401);
        assert.equal(
          (
            await request(
              `/dining-sessions/tables/${table.id}/close-empty`,
              'POST',
              { reason: 'Khách chuyển bàn' },
              cookies[2],
            )
          ).status,
          403,
        );
        await json(
          await request(
            `/dining-sessions/tables/${table.id}/close-empty`,
            'POST',
            { reason: 'Khách chuyển bàn' },
            cookies[3],
          ),
        );
        assert.equal((await request(`${prefix}/guest`, 'GET', {}, newCookie)).status, 401);
        assert.equal(
          (await db.diningTable.findUniqueOrThrow({ where: { id: table.id } })).status,
          'NEEDS_CLEANING',
        );
        await json(
          await request(`/dining-sessions/tables/${table.id}/clean`, 'POST', {}, cookies[2]),
        );
        assert.equal(
          (await db.diningTable.findUniqueOrThrow({ where: { id: table.id } })).status,
          'AVAILABLE',
        );
        assert.equal(await db.order.count({ where: { diningSessionId: sessionId } }), 2);
      },
    );
    await t.test('concurrent empty close and ordering commit one valid outcome', async () => {
      const next = await json<{ id: string }>(
        await request(`/dining-sessions/tables/${table.id}/open`, 'POST', {}, cookies[2]),
      );
      const admission = await request(`${prefix}/guest`, 'POST', { diningSessionId: next.id });
      await json(admission);
      const newCookie = admission.headers.get('set-cookie')!.split(';')[0]!;
      const replies = await Promise.all([
        request(
          `${prefix}/orders`,
          'POST',
          payload({ diningSessionId: next.id, expectedTotal: 100000 }),
          newCookie,
        ),
        request(
          `/dining-sessions/tables/${table.id}/close-empty`,
          'POST',
          { reason: 'Khách đổi bàn' },
          cookies[0],
        ),
      ]);
      const session = await db.diningSession.findUniqueOrThrow({ where: { id: next.id } });
      if (session.status === 'CLOSED') {
        assert.equal(replies[1]!.status, 201);
        assert.equal(replies[0]!.status, 401);
        assert.equal(await db.order.count({ where: { diningSessionId: next.id } }), 0);
      } else {
        assert.equal(replies[0]!.status, 201);
        assert.equal(replies[1]!.status, 409);
        assert.equal(await db.order.count({ where: { diningSessionId: next.id } }), 1);
      }
    });
    await t.test(
      'public mutations reject cross-origin and malformed/oversized JSON; ordering is rate limited',
      async () => {
        for (const [body, status] of [
          ['{', 400],
          [JSON.stringify({ note: 'x'.repeat(140000) }), 413],
        ] as const) {
          const response = await fetch(`${base}${prefix}/orders`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-DineFlow-Client': 'web',
              Origin: config.APP_ORIGIN,
            },
            body,
          });
          assert.equal(response.status, status, await response.clone().text());
        }
        const denied = await fetch(`${base}${prefix}/guest`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-DineFlow-Client': 'web',
            Origin: 'https://other.example',
          },
          body: JSON.stringify({ diningSessionId: sessionId }),
        });
        assert.equal(denied.status, 403);
        let last: Response | undefined;
        for (let i = 0; i < 31; i++) last = await request(`${prefix}/orders`, 'POST', {});
        assert.equal(last!.status, 429);
      },
    );
  } finally {
    const ids = [restaurant.id, other.id],
      userIds = users.map((user) => user.id);
    await db.orderItemModifier.deleteMany({ where: { restaurantId: { in: ids } } });
    await db.orderItem.deleteMany({ where: { restaurantId: { in: ids } } });
    await db.order.deleteMany({ where: { restaurantId: { in: ids } } });
    await db.guestSession.deleteMany({ where: { diningSession: { restaurantId: { in: ids } } } });
    await db.diningSession.deleteMany({ where: { restaurantId: { in: ids } } });
    await db.diningTable.deleteMany({ where: { restaurantId: { in: ids } } });
    await db.menuItemModifierGroup.deleteMany({ where: { restaurantId: { in: ids } } });
    await db.menuItem.deleteMany({ where: { restaurantId: { in: ids } } });
    await db.modifierOption.deleteMany({ where: { restaurantId: { in: ids } } });
    await db.modifierGroup.deleteMany({ where: { restaurantId: { in: ids } } });
    await db.menuCategory.deleteMany({ where: { restaurantId: { in: ids } } });
    await db.activityLog.deleteMany({ where: { restaurantId: { in: ids } } });
    await db.refreshToken.deleteMany({ where: { authSession: { userId: { in: userIds } } } });
    await db.authSession.deleteMany({ where: { userId: { in: userIds } } });
    await db.staffMembership.deleteMany({ where: { userId: { in: userIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await db.restaurant.deleteMany({ where: { id: { in: ids } } });
    await app.close();
  }
});
