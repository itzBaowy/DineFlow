import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { io, type Socket } from 'socket.io-client';
import {
  realtimePath,
  type RealtimeEvent,
  type ServiceRequest,
  type CustomerOrder,
} from '@dineflow/shared';
import { createApp } from '../src/bootstrap';
import { PrismaService } from '../src/database/prisma.service';
import { AuthService } from '../src/auth/auth.service';
import { RealtimeService } from '../src/realtime/realtime.service';
import { CONFIG, type AppConfig } from '../src/config/env';
import { hashPassword } from '../src/auth/password';
import { testDatabaseUrl } from './test-env';

test('Phase 5 real Socket.IO authorization, isolation, post-commit events and service requests', async (t) => {
  process.env.DATABASE_URL = testDatabaseUrl();
  process.env.NODE_ENV = 'test';
  const app = await createApp(false),
    db = app.get(PrismaService),
    auth = app.get(AuthService),
    realtime = app.get(RealtimeService),
    config = app.get<AppConfig>(CONFIG);
  const publish = realtime.publish.bind(realtime);
  // Observe the real publisher from a separate DB connection before socket delivery.
  // A publication inside an uncommitted transaction cannot pass this check.
  t.mock.method(
    realtime,
    'publish',
    async (...args: Parameters<RealtimeService['publish']>) => {
      const [kind, scope, orderId] = args;
      if (kind === 'order.created' && orderId) {
        const committed = await db.order.findUniqueOrThrow({ where: { id: orderId } });
        assert.equal(committed.restaurantId, scope.restaurantId);
        assert.equal(committed.diningSessionId, scope.diningSessionId);
        assert.ok(
          await db.activityLog.findFirst({
            where: { entityId: orderId, action: 'order.created' },
          }),
        );
      }
      if (kind === 'order.accepted' && orderId) {
        assert.ok((await db.order.findUniqueOrThrow({ where: { id: orderId } })).acceptedAt);
      }
      return publish(...args);
    },
  );
  await app.listen(0, '127.0.0.1');
  const url = await app.getUrl(),
    suffix = randomUUID(),
    restaurantIds = [randomUUID(), randomUUID()],
    userIds = Array.from({ length: 6 }, () => randomUUID());
  const sockets: Socket[] = [];
  async function request(path: string, method = 'GET', body: unknown = {}, cookie = '') {
    return fetch(`${url}/api/v1${path}`, {
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
  async function ticket(cookie: string, code?: string) {
    return json<{ ticket: string; expiresAt: string }>(
      await request(
        code ? `/public/tables/${code}/realtime-ticket` : '/realtime/ticket',
        'POST',
        {},
        cookie,
      ),
      201,
    );
  }
  function socket(ticketValue: string, origin = config.APP_ORIGIN) {
    const result = io(url, {
      path: realtimePath,
      addTrailingSlash: false,
      transports: ['websocket'],
      auth: { ticket: ticketValue },
      extraHeaders: { Origin: origin },
      autoConnect: false,
      reconnection: false,
      timeout: 2000,
    });
    sockets.push(result);
    return result;
  }
  async function connected(value: string) {
    const client = socket(value),
      events: RealtimeEvent[] = [];
    client.on('dineflow.event', (event: RealtimeEvent) => events.push(event));
    await new Promise<void>((resolve, reject) => {
      client.once('realtime.ready', resolve);
      client.once('connect_error', reject);
      client.connect();
    });
    return { client, events };
  }
  async function refused(value: string, origin?: string) {
    const client = socket(value, origin);
    await new Promise<void>((resolve, reject) => {
      client.once('connect_error', () => resolve());
      client.once('realtime.ready', () => reject(new Error('Unauthorized socket connected')));
      client.connect();
    });
    client.disconnect();
  }
  async function eventually(check: () => boolean) {
    for (let i = 0; i < 100; i++) {
      if (check()) return;
      await delay(20);
    }
    assert.ok(check(), 'Expected committed event');
  }
  try {
    await Promise.all(
      restaurantIds.map((id, index) =>
        db.restaurant.create({
          data: { id, slug: `realtime-${index}-${suffix}`, name: `Realtime ${index}` },
        }),
      ),
    );
    const password = randomBytes(20).toString('hex'),
      passwordHash = await hashPassword(password);
    const roles = ['OWNER', 'MANAGER', 'WAITER', 'CASHIER', 'KITCHEN', 'WAITER'] as const;
    const users = await Promise.all(
      roles.map((role, index) =>
        db.user.create({
          data: {
            id: userIds[index]!,
            name: role,
            email: `${index}.${suffix}@realtime.test`,
            passwordHash,
            memberships: {
              create: { restaurantId: restaurantIds[index === 5 ? 1 : 0]!, role },
            },
          },
        }),
      ),
    );
    const credentials = await Promise.all(
      users.map((user) => auth.login({ email: user.email, password })),
    );
    const cookies = credentials.map((value) => `df_access=${value.accessToken}`);
    const [owner, manager, waiter, cashier, kitchen, foreign] = cookies as [
      string,
      string,
      string,
      string,
      string,
      string,
    ];
    const tables = await Promise.all(
      [0, 0, 1].map((tenant, index) =>
        db.diningTable.create({
          data: {
            restaurantId: restaurantIds[tenant]!,
            name: `Bàn ${index}`,
            status: 'OCCUPIED',
            publicCode: randomBytes(24).toString('base64url'),
          },
        }),
      ),
    );
    const sessions = await Promise.all(
      tables.map((table) =>
        db.diningSession.create({
          data: { restaurantId: table.restaurantId, tableId: table.id },
        }),
      ),
    );
    const table = tables[0]!,
      session = sessions[0]!;
    const category = await db.menuCategory.create({
      data: { restaurantId: restaurantIds[0]!, name: 'Drinks' },
    });
    const item = await db.menuItem.create({
      data: {
        restaurantId: restaurantIds[0]!,
        categoryId: category.id,
        name: 'Tea',
        basePrice: 35000,
      },
    });
    async function guest(code: string, sessionId: string) {
      const response = await request(`/public/tables/${code}/guest`, 'POST', {
        diningSessionId: sessionId,
      });
      await json(response, 201);
      return response.headers
        .getSetCookie()
        .find((value) => value.startsWith('df_guest='))!
        .split(';')[0]!;
    }
    const guestA = await guest(table.publicCode, session.id),
      guestB = await guest(table.publicCode, session.id),
      otherGuest = await guest(tables[1]!.publicCode, sessions[1]!.id);
    const payload = () => ({
      diningSessionId: session.id,
      idempotencyKey: randomUUID(),
      expectedTotal: 35000,
      note: null,
      items: [{ menuItemId: item.id, quantity: 1, modifierOptionIds: [], note: null }],
    });
    await t.test('tickets require scoped credentials and strict CSRF/body checks', async () => {
      assert.equal((await request('/realtime/ticket', 'POST')).status, 401);
      assert.equal(
        (await request('/realtime/ticket', 'POST', { restaurantId: restaurantIds[1] }, owner))
          .status,
        400,
      );
      assert.equal(
        (
          await request(
            `/public/tables/${table.publicCode}/realtime-ticket`,
            'POST',
            {},
            otherGuest,
          )
        ).status,
        401,
      );
      for (const cookie of cookies) {
        const value = await ticket(cookie);
        assert.ok(new Date(value.expiresAt).getTime() > Date.now());
      }
      const response = await fetch(`${url}/api/v1/realtime/ticket`, {
        method: 'POST',
        headers: {
          Cookie: owner,
          Origin: 'https://evil.example',
          'Content-Type': 'application/json',
          'X-DineFlow-Client': 'web',
        },
        body: '{}',
      });
      assert.equal(response.status, 403);
    });
    await t.test(
      'handshakes reject bad origin, invalid/expired tickets and ticket replay',
      async () => {
        await refused('bad');
        await refused((await ticket(owner)).ticket, 'https://evil.example');
        const single = await ticket(owner),
          client = await connected(single.ticket);
        client.client.disconnect();
        await refused(single.ticket);
        const expiring = await ticket(owner),
          originalNow = Date.now;
        const mocked = t.mock.method(Date, 'now', () => originalNow() + 61000);
        try {
          await assert.rejects(realtime.consume(expiring.ticket));
        } finally {
          mocked.mock.restore();
        }
      },
    );
    const staffSocket = await connected((await ticket(waiter)).ticket),
      kitchenSocket = await connected((await ticket(kitchen)).ticket),
      guestSocket = await connected((await ticket(guestA, table.publicCode)).ticket),
      guestBSocket = await connected((await ticket(guestB, table.publicCode)).ticket),
      otherSocket = await connected((await ticket(otherGuest, tables[1]!.publicCode)).ticket),
      foreignSocket = await connected((await ticket(foreign)).ticket);
    let order: CustomerOrder;
    await t.test(
      'no arbitrary room joins; committed guest order reaches only staff and its own guest',
      async () => {
        const ack = await new Promise<{ ok: boolean }>((resolve) =>
          guestSocket.client.emit(
            'join',
            { restaurantId: restaurantIds[1], room: 'staff:foreign:OWNER' },
            resolve,
          ),
        );
        assert.equal(ack.ok, false);
        const body = payload();
        order = await json<CustomerOrder>(
          await request(`/public/tables/${table.publicCode}/orders`, 'POST', body, guestA),
          201,
        );
        await eventually(
          () =>
            guestSocket.events.some((event) => event.orderId === order.id) &&
            staffSocket.events.some((event) => event.orderId === order.id),
        );
        assert.ok(
          await db.order.findUnique({
            where: {
              id: guestSocket.events.find((event) => event.orderId === order.id)!.orderId,
            },
          }),
        );
        await delay(100);
        for (const peer of [guestBSocket, otherSocket, foreignSocket, kitchenSocket])
          assert.equal(peer.events.filter((event) => event.orderId === order.id).length, 0);
        assert.equal(
          (await request(`/public/tables/${table.publicCode}/orders`, 'POST', body, guestA))
            .status,
          201,
        );
        await delay(100);
        assert.equal(
          staffSocket.events.filter(
            (event) => event.kind === 'order.created' && event.orderId === order.id,
          ).length,
          1,
        );
        const invalid = { ...payload(), expectedTotal: 1 };
        const count = staffSocket.events.length;
        assert.equal(
          (await request(`/public/tables/${table.publicCode}/orders`, 'POST', invalid, guestA))
            .status,
          409,
        );
        await delay(100);
        assert.equal(staffSocket.events.length, count);
      },
    );
    await t.test(
      'accepted/kitchen transitions publish after commit without leaking another guest order',
      async () => {
        const changed = await json<CustomerOrder>(
          await request(
            `/orders/${order.id}/status`,
            'PATCH',
            { from: 'PENDING_CONFIRMATION', to: 'ACCEPTED', reason: null },
            waiter,
          ),
        );
        assert.ok(changed.acceptedAt);
        await eventually(() =>
          kitchenSocket.events.some(
            (event) => event.kind === 'order.accepted' && event.orderId === order.id,
          ),
        );
        await json(
          await request(
            `/orders/${order.id}/status`,
            'PATCH',
            { from: 'ACCEPTED', to: 'PREPARING', reason: null },
            kitchen,
          ),
        );
        await eventually(() =>
          guestSocket.events.some(
            (event) => event.kind === 'order.status_changed' && event.orderId === order.id,
          ),
        );
        assert.equal(
          guestBSocket.events.filter((event) => event.orderId === order.id).length,
          0,
        );
        assert.equal(
          (await db.order.findUniqueOrThrow({ where: { id: order.id } })).status,
          'PREPARING',
        );
      },
    );
    let service: ServiceRequest;
    await t.test(
      'concurrent calls deduplicate per session, share safe request data and stay scoped',
      async () => {
        const input = { diningSessionId: session.id, type: 'CALL_STAFF' },
          path = `/public/tables/${table.publicCode}/service-requests`;
        const responses = await Promise.all([
          request(path, 'POST', input, guestA),
          request(path, 'POST', input, guestB),
        ]);
        const values = await Promise.all(
          responses.map((response) => json<ServiceRequest>(response, 201)),
        );
        service = values[0]!;
        assert.equal(service.id, values[1]!.id);
        const stored = await db.serviceRequest.findUniqueOrThrow({ where: { id: service.id } });
        await assert.rejects(
          db.serviceRequest.create({
            data: {
              restaurantId: stored.restaurantId,
              diningSessionId: stored.diningSessionId,
              guestSessionId: stored.guestSessionId,
              type: stored.type,
            },
          }),
          (error: unknown) =>
            !!error && typeof error === 'object' && 'code' in error && error.code === 'P2002',
        );
        await assert.rejects(
          db.serviceRequest.update({
            where: { id: service.id },
            data: { resolvedAt: new Date() },
          }),
        );
        await eventually(() =>
          guestBSocket.events.some((event) => event.kind === 'service_request.created'),
        );
        assert.equal(
          staffSocket.events.filter((event) => event.kind === 'service_request.created').length,
          1,
        );
        assert.equal(
          kitchenSocket.events.filter((event) => event.kind.startsWith('service_request.'))
            .length,
          0,
        );
        assert.equal(otherSocket.events.length, 0);
        assert.equal(foreignSocket.events.length, 0);
        const history = await json<Record<string, unknown>[]>(
          await request(path, 'GET', {}, guestB),
        );
        assert.equal(history.length, 1);
        assert.ok(!('guestSessionId' in history[0]!) && !('actorUserId' in history[0]!));
        assert.equal(
          (await request(path, 'POST', { ...input, diningSessionId: sessions[1]!.id }, guestA))
            .status,
          409,
        );
        assert.equal((await request('/service-requests', 'GET', {}, kitchen)).status, 403);
        assert.equal(
          (
            await json<{ total: number }>(
              await request('/service-requests', 'GET', {}, foreign),
            )
          ).total,
          0,
        );
      },
    );
    await t.test(
      'service transitions enforce role, stages and concurrent acknowledgement; cooldown prevents spam',
      async () => {
        const path = `/service-requests/${service.id}/status`;
        assert.equal(
          (await request(path, 'PATCH', { from: 'PENDING', to: 'ACKNOWLEDGED' }, foreign))
            .status,
          404,
        );
        assert.equal(
          (await request(path, 'PATCH', { from: 'PENDING', to: 'RESOLVED' }, waiter)).status,
          409,
        );
        assert.equal(
          (await request(path, 'PATCH', { from: 'PENDING', to: 'ACKNOWLEDGED' }, cashier))
            .status,
          403,
        );
        const replies = await Promise.all([
          request(path, 'PATCH', { from: 'PENDING', to: 'ACKNOWLEDGED' }, waiter),
          request(path, 'PATCH', { from: 'PENDING', to: 'ACKNOWLEDGED' }, manager),
        ]);
        assert.deepEqual(replies.map((response) => response.status).sort(), [200, 409]);
        const resolved = await json<ServiceRequest>(
          await request(path, 'PATCH', { from: 'ACKNOWLEDGED', to: 'RESOLVED' }, waiter),
        );
        assert.ok(resolved.resolvedAt);
        assert.equal(
          (
            await request(
              `/public/tables/${table.publicCode}/service-requests`,
              'POST',
              { diningSessionId: session.id, type: 'CALL_STAFF' },
              guestA,
            )
          ).status,
          409,
        );
        assert.equal(
          await db.activityLog.count({
            where: { entityId: service.id, action: 'service_request.acknowledged' },
          }),
          1,
        );
      },
    );
    await t.test(
      'payment requests stop new orders but do not create payments or close the session',
      async () => {
        const paymentRequest = await json<ServiceRequest>(
          await request(
            `/public/tables/${table.publicCode}/service-requests`,
            'POST',
            { diningSessionId: session.id, type: 'REQUEST_PAYMENT' },
            guestA,
          ),
          201,
        );
        assert.equal(
          (await db.diningSession.findUniqueOrThrow({ where: { id: session.id } })).status,
          'PAYMENT_REQUESTED',
        );
        assert.equal(await db.payment.count({ where: { diningSessionId: session.id } }), 0);
        assert.equal(
          (
            await request(
              `/public/tables/${table.publicCode}/orders`,
              'POST',
              payload(),
              guestA,
            )
          ).status,
          409,
        );
        await json(
          await request(
            `/service-requests/${paymentRequest.id}/status`,
            'PATCH',
            { from: 'PENDING', to: 'ACKNOWLEDGED' },
            cashier,
          ),
        );
        await json(
          await request(
            `/service-requests/${paymentRequest.id}/status`,
            'PATCH',
            { from: 'ACKNOWLEDGED', to: 'RESOLVED' },
            cashier,
          ),
        );
        assert.equal(
          (await db.diningSession.findUniqueOrThrow({ where: { id: session.id } })).status,
          'PAYMENT_REQUESTED',
        );
        assert.equal(await db.payment.count({ where: { diningSessionId: session.id } }), 0);
        await eventually(() =>
          guestSocket.events.some((event) => event.kind === 'table.status_changed'),
        );
      },
    );
    await t.test(
      'revoked staff, changed role and expired guests receive no subsequent events',
      async () => {
        const revoked = await connected((await ticket(owner)).ticket);
        await auth.logout(credentials[0]!.refreshToken);
        await realtime.revalidate();
        await eventually(() => !revoked.client.connected);
        const changed = await connected((await ticket(manager)).ticket);
        await db.staffMembership.update({
          where: { id: credentials[1]!.staff.membershipId },
          data: { role: 'KITCHEN' },
        });
        await realtime.revalidate();
        await eventually(() => !changed.client.connected);
        await db.staffMembership.update({
          where: { id: credentials[1]!.staff.membershipId },
          data: { role: 'MANAGER' },
        });
        const guest = await db.guestSession.findUniqueOrThrow({
          where: {
            tokenHash: (await import('node:crypto'))
              .createHash('sha256')
              .update(guestA.slice('df_guest='.length))
              .digest('hex'),
          },
        });
        await db.guestSession.update({
          where: { id: guest.id },
          data: {
            createdAt: new Date(Date.now() - 120000),
            expiresAt: new Date(Date.now() - 60000),
          },
        });
        await realtime.revalidate();
        await eventually(() => !guestSocket.client.connected);
        assert.equal(
          (
            await request(
              `/public/tables/${table.publicCode}/realtime-ticket`,
              'POST',
              {},
              guestA,
            )
          ).status,
          401,
        );
      },
    );
    await t.test(
      'empty close publishes a terminal hint, revokes guests and clears pending calls',
      async () => {
        const path = `/public/tables/${tables[1]!.publicCode}/service-requests`;
        await json(
          await request(
            path,
            'POST',
            { diningSessionId: sessions[1]!.id, type: 'CALL_STAFF' },
            otherGuest,
          ),
          201,
        );
        await json(
          await request(
            `/dining-sessions/tables/${tables[1]!.id}/close-empty`,
            'POST',
            { reason: 'Khách chuyển bàn' },
            manager,
          ),
          201,
        );
        await eventually(() =>
          otherSocket.events.some((event) => event.kind === 'dining_session.closed'),
        );
        assert.equal((await request(path, 'GET', {}, otherGuest)).status, 401);
        assert.equal(
          await db.serviceRequest.count({
            where: { diningSessionId: sessions[1]!.id, status: 'PENDING' },
          }),
          0,
        );
        const before = staffSocket.events.length;
        assert.equal(
          (await request(`/dining-sessions/tables/${tables[1]!.id}/clean`, 'POST', {}, waiter))
            .status,
          201,
        );
        await eventually(() =>
          staffSocket.events
            .slice(before)
            .some((event) => event.kind === 'table.status_changed'),
        );
      },
    );
  } finally {
    for (const client of sockets) client.disconnect();
    const scope = { restaurantId: { in: restaurantIds } };
    await db.orderItemModifier.deleteMany({ where: scope });
    await db.orderItem.deleteMany({ where: scope });
    await db.order.deleteMany({ where: scope });
    await db.serviceRequest.deleteMany({ where: scope });
    await db.guestSession.deleteMany({ where: { diningSession: scope } });
    await db.diningSession.deleteMany({ where: scope });
    await db.diningTable.deleteMany({ where: scope });
    await db.menuItemModifierGroup.deleteMany({ where: scope });
    await db.menuItem.deleteMany({ where: scope });
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
