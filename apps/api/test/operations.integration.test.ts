import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { createApp } from '../src/bootstrap';
import { PrismaService } from '../src/database/prisma.service';
import { AuthService } from '../src/auth/auth.service';
import { hashPassword } from '../src/auth/password';
import { CONFIG, type AppConfig } from '../src/config/env';
import { testDatabaseUrl } from './test-env';
import type { CreateOrderInput, CustomerOrder, OrderStatus, StaffOrder } from '@dineflow/shared';

test('Phase 4 staff and kitchen operations with real PostgreSQL', async (t) => {
  process.env.DATABASE_URL = testDatabaseUrl();
  process.env.NODE_ENV = 'test';
  const app = await createApp(false),
    db = app.get(PrismaService),
    auth = app.get(AuthService),
    config = app.get<AppConfig>(CONFIG);
  await app.listen(0, '127.0.0.1');
  const base = `${await app.getUrl()}/api/v1`,
    suffix = randomUUID();
  const restaurantIds = [randomUUID(), randomUUID()],
    userIds = Array.from({ length: 5 }, () => randomUUID());
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
  async function json<T>(response: Response, status = 200): Promise<T> {
    assert.equal(response.status, status, await response.clone().text());
    return response.json() as Promise<T>;
  }
  try {
    const [restaurant, other] = await Promise.all(
      restaurantIds.map((id, i) =>
        db.restaurant.create({
          data: { id, slug: `operations-${i}-${suffix}`, name: `Restaurant ${i}` },
        }),
      ),
    );
    const password = randomBytes(20).toString('hex'),
      passwordHash = await hashPassword(password);
    const users = await Promise.all(
      (['OWNER', 'MANAGER', 'WAITER', 'CASHIER', 'KITCHEN'] as const).map((role, i) =>
        db.user.create({
          data: {
            id: userIds[i]!,
            email: `${role.toLowerCase()}.${suffix}@operations.test`,
            name: role,
            passwordHash,
            memberships: { create: { restaurantId: restaurant!.id, role } },
          },
        }),
      ),
    );
    const cookies = await Promise.all(
      users.map(
        async (user) =>
          `df_access=${(await auth.login({ email: user.email, password })).accessToken}`,
      ),
    );
    const [owner, manager, waiter, cashier, kitchen] = cookies as [
      string,
      string,
      string,
      string,
      string,
    ];
    const table = await db.diningTable.create({
      data: {
        restaurantId: restaurant!.id,
        name: 'Bàn 01',
        status: 'OCCUPIED',
        publicCode: randomBytes(24).toString('base64url'),
      },
    });
    const session = await db.diningSession.create({
      data: { restaurantId: restaurant!.id, tableId: table.id },
    });
    const foreignTable = await db.diningTable.create({
      data: {
        restaurantId: other!.id,
        name: 'Other',
        status: 'OCCUPIED',
        publicCode: randomBytes(24).toString('base64url'),
      },
    });
    const foreignSession = await db.diningSession.create({
      data: { restaurantId: other!.id, tableId: foreignTable.id },
    });
    const foreignOrder = await db.order.create({
      data: {
        restaurantId: other!.id,
        diningSessionId: foreignSession.id,
        source: 'STAFF',
        idempotencyKey: randomUUID(),
        requestHash: 'f'.repeat(64),
        totalAmount: 0,
      },
    });
    const category = await db.menuCategory.create({
      data: { restaurantId: restaurant!.id, name: 'Đồ uống' },
    });
    const group = await db.modifierGroup.create({
      data: {
        restaurantId: restaurant!.id,
        name: 'Size',
        minSelections: 1,
        maxSelections: 1,
        options: { create: [{ name: 'L', priceDelta: 5000 }] },
      },
      include: { options: true },
    });
    const item = await db.menuItem.create({
      data: {
        restaurantId: restaurant!.id,
        categoryId: category.id,
        name: 'Trà sữa',
        basePrice: 35000,
        modifierGroups: { create: { modifierGroupId: group.id } },
      },
    });
    function body(overrides: Partial<CreateOrderInput> = {}): CreateOrderInput {
      return {
        idempotencyKey: randomUUID(),
        diningSessionId: session.id,
        expectedTotal: 80000,
        note: 'Mang cùng nhau',
        items: [
          {
            menuItemId: item.id,
            modifierOptionIds: [group.options[0]!.id],
            quantity: 2,
            note: 'Ít đá',
          },
        ],
        ...overrides,
      };
    }
    const manual = async (cookie = waiter, input = body()) =>
      json<CustomerOrder>(
        await request(`/dining-sessions/${session.id}/orders`, 'POST', input, cookie),
        201,
      );
    const transition = (
      id: string,
      from: OrderStatus,
      to: OrderStatus,
      cookie = waiter,
      reason: string | null = null,
    ) => request(`/orders/${id}/status`, 'PATCH', { from, to, reason }, cookie);
    const admission = await request(`/public/tables/${table.publicCode}/guest`, 'POST', {
      diningSessionId: session.id,
    });
    await json(admission, 201);
    const guestCookie = admission.headers.get('set-cookie')!.split(';')[0]!;
    const guestOrder = await json<CustomerOrder>(
      await request(`/public/tables/${table.publicCode}/orders`, 'POST', body(), guestCookie),
      201,
    );

    await t.test('staff/kitchen list scopes and strict paginated queries', async () => {
      assert.equal((await request('/orders')).status, 401);
      assert.equal((await request('/orders', 'GET', {}, guestCookie)).status, 401);
      assert.equal((await request('/kitchen/orders', 'GET', {}, waiter)).status, 403);
      assert.equal((await request('/orders', 'GET', {}, kitchen)).status, 403);
      assert.equal(
        (await request('/orders?restaurantId=' + other!.id, 'GET', {}, owner)).status,
        400,
      );
      assert.equal((await request('/orders?page=0', 'GET', {}, owner)).status, 400);
      assert.equal(
        (await request('/kitchen/orders?status=PENDING_CONFIRMATION', 'GET', {}, kitchen)).status,
        400,
      );
      const list = await json<{ orders: StaffOrder[]; total: number }>(
        await request('/orders', 'GET', {}, cashier),
      );
      assert.equal(list.total, 1);
      assert.equal(list.orders[0]!.id, guestOrder.id);
      assert.equal(list.orders[0]!.table.id, table.id);
      assert.equal(
        (await json<{ total: number }>(await request('/kitchen/orders', 'GET', {}, kitchen))).total,
        0,
      );
      assert.equal(
        (await transition(foreignOrder.id, 'PENDING_CONFIRMATION', 'ACCEPTED', owner)).status,
        404,
      );
      assert.equal(
        (await request(`/dining-sessions/${foreignSession.id}/menu`, 'GET', {}, owner)).status,
        404,
      );
      assert.equal(
        (
          await request(
            `/dining-sessions/${foreignSession.id}/orders`,
            'POST',
            body({ diningSessionId: foreignSession.id }),
            owner,
          )
        ).status,
        404,
      );
    });
    await t.test('unauthorized, skipped and malformed transitions never write', async () => {
      assert.equal(
        (await transition(guestOrder.id, 'PENDING_CONFIRMATION', 'ACCEPTED', cashier)).status,
        403,
      );
      assert.equal(
        (await transition(guestOrder.id, 'PENDING_CONFIRMATION', 'ACCEPTED', kitchen)).status,
        403,
      );
      assert.equal(
        (await transition(guestOrder.id, 'PENDING_CONFIRMATION', 'READY', owner)).status,
        409,
      );
      assert.equal(
        (await transition(guestOrder.id, 'PENDING_CONFIRMATION', 'CANCELLED', waiter)).status,
        400,
      );
      assert.equal(
        (
          await request(
            `/orders/${guestOrder.id}/status`,
            'PATCH',
            { from: 'PENDING_CONFIRMATION', to: 'ACCEPTED', reason: null, restaurantId: other!.id },
            owner,
          )
        ).status,
        400,
      );
      assert.equal(
        (await db.order.findUniqueOrThrow({ where: { id: guestOrder.id } })).status,
        'PENDING_CONFIRMATION',
      );
    });
    await t.test(
      'confirm -> cook -> ready -> serve records timestamps, audit and guest history',
      async () => {
        await json(await transition(guestOrder.id, 'PENDING_CONFIRMATION', 'ACCEPTED', waiter));
        assert.equal(
          (await json<{ total: number }>(await request('/kitchen/orders', 'GET', {}, kitchen)))
            .total,
          1,
        );
        assert.equal(
          (await transition(guestOrder.id, 'ACCEPTED', 'PREPARING', waiter)).status,
          403,
        );
        await db.menuItem.update({
          where: { id: item.id },
          data: { name: 'Tên mới', basePrice: 40000, isAvailable: false },
        });
        const ticket = await json<{ orders: StaffOrder[] }>(
          await request('/kitchen/orders', 'GET', {}, kitchen),
        );
        assert.equal(ticket.orders[0]!.items[0]!.name, 'Trà sữa');
        assert.equal(ticket.orders[0]!.totalAmount, 80000);
        await json(await transition(guestOrder.id, 'ACCEPTED', 'PREPARING', kitchen));
        assert.equal(
          (await transition(guestOrder.id, 'PREPARING', 'CANCELLED', owner, 'Không thể phục vụ'))
            .status,
          409,
        );
        await json(await transition(guestOrder.id, 'PREPARING', 'READY', kitchen));
        assert.equal((await transition(guestOrder.id, 'READY', 'SERVED', kitchen)).status, 403);
        await json(await transition(guestOrder.id, 'READY', 'SERVED', waiter));
        const history = await json<CustomerOrder[]>(
          await request(`/public/tables/${table.publicCode}/orders`, 'GET', {}, guestCookie),
        );
        const served = history[0]!;
        assert.equal(served.status, 'SERVED');
        for (const stamp of [
          served.acceptedAt,
          served.preparingAt,
          served.readyAt,
          served.servedAt,
        ])
          assert.ok(stamp);
        assert.ok(new Date(served.acceptedAt!) <= new Date(served.preparingAt!));
        assert.ok(new Date(served.preparingAt!) <= new Date(served.readyAt!));
        assert.equal(
          await db.activityLog.count({
            where: { entityId: guestOrder.id, actorUserId: { not: null } },
          }),
          4,
        );
        assert.equal((await transition(guestOrder.id, 'SERVED', 'ACCEPTED', owner)).status, 409);
        await db.menuItem.update({
          where: { id: item.id },
          data: { name: 'Trà sữa', basePrice: 35000, isAvailable: true },
        });
      },
    );
    await t.test(
      'manual orders share pricing, modifiers, snapshots and staff-bound idempotency',
      async () => {
        for (const cookie of [cashier, kitchen])
          assert.equal(
            (await request(`/dining-sessions/${session.id}/orders`, 'POST', body(), cookie)).status,
            403,
          );
        assert.equal(
          (
            await request(
              `/dining-sessions/${session.id}/orders`,
              'POST',
              { ...body(), totalAmount: 1 },
              waiter,
            )
          ).status,
          400,
        );
        assert.equal(
          (
            await request(
              `/dining-sessions/${session.id}/orders`,
              'POST',
              body({ expectedTotal: 1 }),
              waiter,
            )
          ).status,
          409,
        );
        const payload = body();
        const replies = await Promise.all([manual(waiter, payload), manual(waiter, payload)]);
        assert.equal(replies[0]!.id, replies[1]!.id);
        assert.equal(replies[0]!.source, 'STAFF');
        assert.equal(replies[0]!.status, 'PENDING_CONFIRMATION');
        assert.equal(
          (await db.order.findUniqueOrThrow({ where: { id: replies[0]!.id } })).guestSessionId,
          null,
        );
        assert.equal(
          (await request(`/dining-sessions/${session.id}/orders`, 'POST', payload, manager)).status,
          409,
        );
        assert.equal(
          (
            await request(
              `/dining-sessions/${session.id}/orders`,
              'POST',
              { ...payload, note: 'Changed' },
              waiter,
            )
          ).status,
          409,
        );
        assert.equal(
          (
            await json<CustomerOrder[]>(
              await request(`/public/tables/${table.publicCode}/orders`, 'GET', {}, guestCookie),
            )
          ).length,
          1,
        );
        await db.menuItem.update({ where: { id: item.id }, data: { isAvailable: false } });
        assert.equal((await manual(waiter, payload)).totalAmount, 80000);
        assert.equal(
          (await request(`/dining-sessions/${session.id}/orders`, 'POST', body(), waiter)).status,
          400,
        );
        await db.menuItem.update({ where: { id: item.id }, data: { isAvailable: true } });
      },
    );
    await t.test('rejection requires a reason; accepted cancellation is manager-only', async () => {
      const pending = await manual();
      const rejected = await json<CustomerOrder>(
        await transition(pending.id, 'PENDING_CONFIRMATION', 'CANCELLED', waiter, 'Khách đổi ý'),
      );
      assert.equal(rejected.cancellationReason, 'Khách đổi ý');
      assert.ok(rejected.cancelledAt);
      assert.equal(rejected.acceptedAt, null);
      const accepted = await manual();
      await json(await transition(accepted.id, 'PENDING_CONFIRMATION', 'ACCEPTED', waiter));
      assert.equal(
        (await transition(accepted.id, 'ACCEPTED', 'CANCELLED', waiter, 'Khách đổi ý')).status,
        403,
      );
      const cancelled = await json<CustomerOrder>(
        await transition(accepted.id, 'ACCEPTED', 'CANCELLED', manager, 'Nhà hàng hết nguyên liệu'),
      );
      assert.equal(cancelled.cancellationReason, 'Nhà hàng hết nguyên liệu');
      assert.ok(cancelled.acceptedAt);
      assert.ok(cancelled.cancelledAt);
    });
    await t.test(
      'concurrent confirmation and rejection commit exactly one transition',
      async () => {
        const order = await manual();
        const replies = await Promise.all([
          transition(order.id, 'PENDING_CONFIRMATION', 'ACCEPTED', waiter),
          transition(order.id, 'PENDING_CONFIRMATION', 'CANCELLED', manager, 'Khách hủy'),
        ]);
        assert.deepEqual(replies.map((reply) => reply.status).sort(), [200, 409]);
        assert.equal(
          await db.activityLog.count({
            where: { entityId: order.id, action: { in: ['order.accepted', 'order.cancelled'] } },
          }),
          1,
        );
      },
    );
    await t.test(
      'concurrent kitchen preparation and manager cancellation cannot both succeed',
      async () => {
        const order = await manual();
        await json(await transition(order.id, 'PENDING_CONFIRMATION', 'ACCEPTED', owner));
        const replies = await Promise.all([
          transition(order.id, 'ACCEPTED', 'PREPARING', kitchen),
          transition(order.id, 'ACCEPTED', 'CANCELLED', manager, 'Khách hủy'),
        ]);
        assert.deepEqual(replies.map((reply) => reply.status).sort(), [200, 409]);
        const stored = await db.order.findUniqueOrThrow({ where: { id: order.id } });
        assert.ok(stored.preparingAt ? !stored.cancelledAt : !!stored.cancelledAt);
      },
    );
    await t.test(
      'pagination and operations counters reflect actual current-session orders',
      async () => {
        await manual();
        await manual();
        const first = await json<{ orders: StaffOrder[]; total: number }>(
          await request('/orders?pageSize=1&page=1', 'GET', {}, waiter),
        );
        const second = await json<{ orders: StaffOrder[] }>(
          await request('/orders?pageSize=1&page=2', 'GET', {}, waiter),
        );
        assert.ok(first.total >= 3);
        assert.notEqual(first.orders[0]!.id, second.orders[0]!.id);
        const overview = await json<{
          counts: Record<OrderStatus, number>;
          occupiedTables: number;
        }>(await request('/orders/overview', 'GET', {}, kitchen));
        assert.equal(overview.counts.PENDING_CONFIRMATION, first.total);
        assert.equal(overview.occupiedTables, 1);
        assert.equal(overview.counts.SERVED, 1);
      },
    );
    await t.test(
      'payment-requested blocks new manual orders; closed sessions cannot mutate',
      async () => {
        const pending = await manual();
        await db.diningSession.update({
          where: { id: session.id },
          data: { status: 'PAYMENT_REQUESTED', paymentRequestedAt: new Date() },
        });
        assert.equal(
          (await request(`/dining-sessions/${session.id}/orders`, 'POST', body(), waiter)).status,
          409,
        );
        await json(await transition(pending.id, 'PENDING_CONFIRMATION', 'ACCEPTED', waiter));
        await db.diningSession.update({
          where: { id: session.id },
          data: { status: 'CLOSED', closedAt: new Date(), closeReason: 'Test fixture' },
        });
        assert.equal((await transition(pending.id, 'ACCEPTED', 'PREPARING', kitchen)).status, 409);
        assert.equal(
          (await json<{ total: number }>(await request('/kitchen/orders', 'GET', {}, kitchen)))
            .total,
          0,
        );
      },
    );
  } finally {
    const scope = { restaurantId: { in: restaurantIds } };
    await db.orderItemModifier.deleteMany({ where: scope });
    await db.orderItem.deleteMany({ where: scope });
    await db.order.deleteMany({ where: scope });
    await db.guestSession.deleteMany({ where: { diningSession: scope } });
    await db.diningSession.deleteMany({ where: scope });
    await db.diningTable.deleteMany({ where: scope });
    await db.menuItemModifierGroup.deleteMany({ where: scope });
    await db.menuItem.deleteMany({ where: scope });
    await db.modifierOption.deleteMany({ where: scope });
    await db.modifierGroup.deleteMany({ where: scope });
    await db.menuCategory.deleteMany({ where: scope });
    await db.activityLog.deleteMany({ where: scope });
    await db.refreshToken.deleteMany({ where: { authSession: { userId: { in: userIds } } } });
    await db.authSession.deleteMany({ where: { userId: { in: userIds } } });
    await db.staffMembership.deleteMany({ where: scope });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await db.restaurant.deleteMany({ where: { id: { in: restaurantIds } } });
    await app.close();
  }
});
