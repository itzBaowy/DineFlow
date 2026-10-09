import { loginStaff } from './login-staff';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { io, type Socket } from 'socket.io-client';
import {
  realtimePath,
  type Bill,
  type Receipt,
  type PaymentInput,
  type RealtimeEvent,
} from '@dineflow/shared';
import { createApp } from '../src/bootstrap';
import { PrismaService } from '../src/database/prisma.service';
import { AuthService } from '../src/auth/auth.service';
import { RealtimeService } from '../src/realtime/realtime.service';
import { CONFIG, type AppConfig } from '../src/config/env';
import { hashPassword } from '../src/auth/password';
import { testDatabaseUrl } from './test-env';

test('Phase 6 real billing, full payment, immutable receipts and atomic session close', async (t) => {
  process.env.DATABASE_URL = testDatabaseUrl();
  process.env.NODE_ENV = 'test';
  const app = await createApp(false),
    db = app.get(PrismaService),
    auth = app.get(AuthService),
    realtime = app.get(RealtimeService),
    config = app.get<AppConfig>(CONFIG);
  await app.listen(0, '127.0.0.1');
  const url = await app.getUrl(),
    suffix = randomUUID(),
    restaurantIds = [randomUUID(), randomUUID()],
    userIds = Array.from({ length: 6 }, () => randomUUID()),
    sockets: Socket[] = [];
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
  const path = (id: string) => `/billing/sessions/${id}`;
  async function socket(cookie: string, code?: string) {
    const { ticket } = await json<{ ticket: string }>(
      await request(
        code ? `/public/tables/${code}/realtime-ticket` : '/realtime/ticket',
        'POST',
        {},
        cookie,
      ),
      201,
    );
    const client = io(url, {
        path: realtimePath,
        addTrailingSlash: false,
        transports: ['websocket'],
        auth: { ticket },
        extraHeaders: { Origin: config.APP_ORIGIN },
        autoConnect: false,
        reconnection: false,
        timeout: 2000,
      }),
      events: RealtimeEvent[] = [];
    sockets.push(client);
    client.on('dineflow.event', (event: RealtimeEvent) => events.push(event));
    await new Promise<void>((resolve, reject) => {
      client.once('realtime.ready', resolve);
      client.once('connect_error', reject);
      client.connect();
    });
    return { client, events };
  }
  async function eventually(check: () => boolean) {
    for (let i = 0; i < 100; i++) {
      if (check()) return;
      await delay(20);
    }
    assert.ok(check(), 'Expected real socket event');
  }
  try {
    await Promise.all(
      restaurantIds.map((id, index) =>
        db.restaurant.create({
          data: {
            id,
            slug: `billing-${index}-${suffix}`,
            name: `Billing ${index}`,
            address: 'Địa chỉ ban đầu',
            serviceChargeBps: 500,
            taxBps: 800,
            cashierMaxDiscountBps: 1000,
          },
        }),
      ),
    );
    const password = randomBytes(24).toString('hex'),
      passwordHash = await hashPassword(password),
      roles = ['OWNER', 'MANAGER', 'CASHIER', 'WAITER', 'KITCHEN', 'CASHIER'] as const;
    const users = await Promise.all(
      roles.map((role, index) =>
        db.user.create({
          data: {
            id: userIds[index]!,
            email: `${index}.${suffix}@billing.test`,
            name: role,
            passwordHash,
            memberships: {
              create: { restaurantId: restaurantIds[index === 5 ? 1 : 0]!, role },
            },
          },
        }),
      ),
    );
    const logins = await Promise.all(
        users.map((user) => loginStaff(auth, { email: user.email, password })),
      ),
      cookies = logins.map((login) => `df_access=${login.accessToken}`);
    const [owner, manager, cashier, waiter, kitchen, foreign] = cookies as [
      string,
      string,
      string,
      string,
      string,
      string,
    ];
    const category = await db.menuCategory.create({
      data: { restaurantId: restaurantIds[0]!, name: 'Drinks' },
    });
    const group = await db.modifierGroup.create({
      data: {
        restaurantId: restaurantIds[0]!,
        name: 'Size',
        minSelections: 1,
        maxSelections: 1,
        options: { create: { name: 'L', priceDelta: 1000 } },
      },
      include: { options: true },
    });
    const item = await db.menuItem.create({
      data: {
        restaurantId: restaurantIds[0]!,
        categoryId: category.id,
        name: 'Trà nguyên bản',
        basePrice: 35001,
        modifierGroups: { create: { modifierGroupId: group.id } },
      },
    });
    async function context() {
      const table = await db.diningTable.create({
        data: {
          restaurantId: restaurantIds[0]!,
          name: `Bàn ${randomUUID()}`,
          publicCode: randomBytes(24).toString('base64url'),
          status: 'OCCUPIED',
        },
      });
      const session = await db.diningSession.create({
        data: { restaurantId: restaurantIds[0]!, tableId: table.id },
      });
      const response = await request(`/public/tables/${table.publicCode}/guest`, 'POST', {
        diningSessionId: session.id,
      });
      await json(response, 201);
      const cookie = response.headers
        .getSetCookie()
        .find((v) => v.startsWith('df_guest='))!
        .split(';')[0]!;
      return { table, session, cookie };
    }
    type Context = Awaited<ReturnType<typeof context>>;
    async function order(ctx: Context, quantity = 1) {
      return json<{ id: string }>(
        await request(
          `/public/tables/${ctx.table.publicCode}/orders`,
          'POST',
          {
            diningSessionId: ctx.session.id,
            idempotencyKey: randomUUID(),
            expectedTotal: quantity * 36001,
            note: null,
            items: [
              {
                menuItemId: item.id,
                quantity,
                modifierOptionIds: [group.options[0]!.id],
                note: 'Snapshot note',
              },
            ],
          },
          ctx.cookie,
        ),
        201,
      );
    }
    async function serve(id: string) {
      for (const [from, to] of [
        ['PENDING_CONFIRMATION', 'ACCEPTED'],
        ['ACCEPTED', 'PREPARING'],
        ['PREPARING', 'READY'],
        ['READY', 'SERVED'],
      ])
        await json(
          await request(`/orders/${id}/status`, 'PATCH', { from, to, reason: null }, owner),
        );
    }
    async function cancel(id: string) {
      await json(
        await request(
          `/orders/${id}/status`,
          'PATCH',
          { from: 'PENDING_CONFIRMATION', to: 'CANCELLED', reason: 'Khách đổi món' },
          waiter,
        ),
      );
    }
    const main = await context(),
      other = await context();
    async function requestResponse() {
      return request(`${path(main.session.id)}/bill`, 'GET', {}, cashier);
    }
    // Bill reads are requests, not substitutes for database or payment logic.
    async function current() {
      return json<Bill>(await requestResponse());
    }
    const payment = (quote: Bill, method: PaymentInput['method'] = 'CASH'): PaymentInput => ({
      idempotencyKey: randomUUID(),
      revision: quote.revision,
      method,
      paidAmount: quote.totals.total,
      reference: method === 'CASH' ? null : 'Đã kiểm tra giao dịch 123',
      receivedConfirmed: true,
    });
    let first!: { id: string },
      second!: { id: string },
      cancelled!: { id: string },
      paid!: Receipt;
    await t.test(
      'bill, receipt and mutations enforce role, tenant, guest and strict request scope',
      async () => {
        assert.equal((await request(`${path(main.session.id)}/bill`)).status, 401);
        assert.equal(
          (await request(`${path(main.session.id)}/bill`, 'GET', {}, kitchen)).status,
          403,
        );
        assert.equal(
          (await request(`${path(main.session.id)}/bill`, 'GET', {}, waiter)).status,
          200,
        );
        assert.equal(
          (await request(`${path(main.session.id)}/bill`, 'GET', {}, foreign)).status,
          404,
        );
        assert.equal(
          (await request('/billing/sessions/not-uuid/bill', 'GET', {}, cashier)).status,
          400,
        );
        assert.equal(
          (
            await request(
              `/public/tables/${main.table.publicCode}/bill`,
              'GET',
              {},
              other.cookie,
            )
          ).status,
          401,
        );
        const guest = await json<Record<string, unknown>>(
          await request(`/public/tables/${main.table.publicCode}/bill`, 'GET', {}, main.cookie),
        );
        assert.ok(!('orders' in guest));
        assert.ok(!('discountReason' in (guest.totals as Record<string, unknown>)));
        const quote = await current();
        assert.equal(
          (await request(`${path(main.session.id)}/payments`, 'POST', payment(quote), waiter))
            .status,
          403,
        );
        assert.equal(
          (
            await request(
              `${path(main.session.id)}/discount`,
              'PATCH',
              { amount: 0, reason: null, revision: quote.revision },
              waiter,
            )
          ).status,
          403,
        );
        assert.equal(
          (
            await request(
              `${path(main.session.id)}/status`,
              'POST',
              {
                from: 'OPEN',
                to: 'PAYMENT_REQUESTED',
                reason: null,
                restaurantId: restaurantIds[1],
              },
              cashier,
            )
          ).status,
          400,
        );
        assert.equal(
          (await request(`${path(main.session.id)}/receipt`, 'GET', {}, cashier)).status,
          404,
        );
      },
    );
    await t.test(
      'all session orders aggregate immutable prices; cancellation is excluded and unserved blocks payment',
      async () => {
        first = await order(main);
        second = await order(main, 2);
        cancelled = await order(main);
        await cancel(cancelled.id);
        const quote = await current();
        assert.equal(quote.totals.subtotal, 108003);
        assert.equal(quote.totals.serviceCharge, 5400);
        assert.equal(quote.totals.tax, 9072);
        assert.equal(quote.totals.total, 122475);
        assert.equal(quote.orders.length, 3);
        assert.equal(quote.validOrderCount, 2);
        assert.equal(quote.blockingOrderCount, 2);
        assert.equal(quote.canPay, false);
        assert.equal(
          (await request(`${path(main.session.id)}/payments`, 'POST', payment(quote), cashier))
            .status,
          409,
        );
        assert.equal(
          (
            await request(
              `${path(main.session.id)}/discount`,
              'PATCH',
              { amount: 1000, reason: 'Ưu đãi', revision: quote.revision },
              cashier,
            )
          ).status,
          409,
        );
        assert.equal(
          await db.payment.count({ where: { diningSessionId: main.session.id } }),
          0,
        );
      },
    );
    await t.test(
      'discounts require served orders, a reason and the live cashier permission limit',
      async () => {
        await serve(first.id);
        await serve(second.id);
        const quote = await current();
        assert.equal(quote.canPay, true);
        assert.equal(
          (
            await request(
              `${path(main.session.id)}/discount`,
              'PATCH',
              { amount: 10801, reason: 'Ưu đãi', revision: quote.revision },
              cashier,
            )
          ).status,
          403,
        );
        assert.equal(
          (
            await request(
              `${path(main.session.id)}/discount`,
              'PATCH',
              { amount: 10800, reason: null, revision: quote.revision },
              cashier,
            )
          ).status,
          400,
        );
        assert.equal(
          (
            await request(
              `${path(main.session.id)}/discount`,
              'PATCH',
              { amount: 108004, reason: 'Ưu đãi', revision: quote.revision },
              owner,
            )
          ).status,
          409,
        );
        const changed = await json<Bill>(
          await request(
            `${path(main.session.id)}/discount`,
            'PATCH',
            { amount: 10800, reason: 'Ưu đãi được duyệt', revision: quote.revision },
            cashier,
          ),
        );
        assert.equal(changed.totals.total, 110228);
        assert.equal(changed.totals.serviceCharge, 4860);
        assert.equal(changed.totals.tax, 8165);
        assert.equal(
          await db.activityLog.count({
            where: { entityId: main.session.id, action: 'billing.discount_updated' },
          }),
          1,
        );
      },
    );
    await t.test(
      'stale quote, wrong collected amount and missing bank verification cannot charge',
      async () => {
        const quote = await current(),
          settings = await db.restaurant.findUniqueOrThrow({
            where: { id: restaurantIds[0]! },
          });
        await json(
          await request(
            '/restaurant/settings',
            'PATCH',
            {
              name: settings.name,
              address: settings.address,
              phone: settings.phone,
              logoUrl: settings.logoUrl,
              timezone: settings.timezone,
              serviceChargeBps: settings.serviceChargeBps,
              taxBps: 1000,
              cashierMaxDiscountBps: settings.cashierMaxDiscountBps,
            },
            owner,
          ),
        );
        assert.equal(
          (await request(`${path(main.session.id)}/payments`, 'POST', payment(quote), cashier))
            .status,
          409,
        );
        assert.equal(
          (
            await request(
              `${path(main.session.id)}/discount`,
              'PATCH',
              { amount: 5000, reason: 'Ưu đãi', revision: quote.revision },
              manager,
            )
          ).status,
          409,
        );
        const fresh = await current();
        for (const amount of [fresh.totals.total - 1, fresh.totals.total + 1])
          assert.equal(
            (
              await request(
                `${path(main.session.id)}/payments`,
                'POST',
                { ...payment(fresh), paidAmount: amount },
                cashier,
              )
            ).status,
            409,
          );
        for (const invalid of [
          { ...payment(fresh, 'BANK_TRANSFER'), reference: null },
          { ...payment(fresh), receivedConfirmed: false },
          { ...payment(fresh), role: 'OWNER' },
        ])
          assert.equal(
            (await request(`${path(main.session.id)}/payments`, 'POST', invalid, cashier))
              .status,
            400,
          );
        assert.equal(
          await db.payment.count({ where: { diningSessionId: main.session.id } }),
          0,
        );
      },
    );
    await t.test(
      'request payment and reopen enforce stage/reason; reopen clears pending request and permits more orders',
      async () => {
        await json(
          await request(
            `/public/tables/${main.table.publicCode}/service-requests`,
            'POST',
            { diningSessionId: main.session.id, type: 'REQUEST_PAYMENT' },
            main.cookie,
          ),
          201,
        );
        assert.equal(
          (
            await request(
              `${path(main.session.id)}/status`,
              'POST',
              { from: 'PAYMENT_REQUESTED', to: 'OPEN', reason: null },
              cashier,
            )
          ).status,
          400,
        );
        await json(
          await request(
            `${path(main.session.id)}/status`,
            'POST',
            { from: 'PAYMENT_REQUESTED', to: 'OPEN', reason: 'Khách muốn gọi thêm món' },
            waiter,
          ),
          201,
        );
        assert.equal(
          await db.serviceRequest.count({
            where: {
              diningSessionId: main.session.id,
              status: { in: ['PENDING', 'ACKNOWLEDGED'] },
            },
          }),
          0,
        );
        const added = await order(main);
        await cancel(added.id);
        await json(
          await request(
            `${path(main.session.id)}/status`,
            'POST',
            { from: 'OPEN', to: 'PAYMENT_REQUESTED', reason: null },
            cashier,
          ),
          201,
        );
        assert.equal(
          (
            await request(
              `${path(main.session.id)}/status`,
              'POST',
              { from: 'OPEN', to: 'PAYMENT_REQUESTED', reason: null },
              cashier,
            )
          ).status,
          409,
        );
        assert.equal(
          (
            await request(
              `/public/tables/${main.table.publicCode}/orders`,
              'POST',
              {
                diningSessionId: main.session.id,
                idempotencyKey: randomUUID(),
                expectedTotal: 0,
                items: [],
                note: null,
              },
              main.cookie,
            )
          ).status,
          400,
        );
      },
    );
    await t.test(
      'concurrent identical cash requests commit one payment/close/audit and publish only after commit',
      async () => {
        const staffSocket = await socket(cashier),
          guestSocket = await socket(main.cookie, main.table.publicCode),
          kitchenSocket = await socket(kitchen),
          publish = realtime.publish.bind(realtime);
        const observed = t.mock.method(
          realtime,
          'publish',
          async (...args: Parameters<RealtimeService['publish']>) => {
            if (args[0] === 'payment.completed') {
              assert.equal(
                (await db.diningSession.findUniqueOrThrow({ where: { id: main.session.id } }))
                  .status,
                'CLOSED',
              );
              assert.equal(
                (await db.diningTable.findUniqueOrThrow({ where: { id: main.table.id } }))
                  .status,
                'NEEDS_CLEANING',
              );
              assert.equal(
                await db.payment.count({
                  where: { diningSessionId: main.session.id, status: 'COMPLETED' },
                }),
                1,
              );
            }
            return publish(...args);
          },
        );
        const input = payment(await current());
        try {
          const responses = await Promise.all([
            request(`${path(main.session.id)}/payments`, 'POST', input, cashier),
            request(`${path(main.session.id)}/payments`, 'POST', input, cashier),
          ]);
          const values = await Promise.all(
            responses.map((response) => json<Receipt>(response, 201)),
          );
          paid = values[0]!;
          assert.deepEqual(values[0], values[1]);
        } finally {
          observed.mock.restore();
        }
        assert.equal(
          await db.payment.count({ where: { diningSessionId: main.session.id } }),
          1,
        );
        assert.equal(
          await db.activityLog.count({
            where: { entityId: paid.id, action: 'payment.completed' },
          }),
          1,
        );
        assert.equal(
          await db.activityLog.count({
            where: { entityId: main.session.id, action: 'dining_session.closed_paid' },
          }),
          1,
        );
        await eventually(
          () =>
            staffSocket.events.some((event) => event.kind === 'payment.completed') &&
            guestSocket.events.some((event) => event.kind === 'dining_session.closed'),
        );
        assert.equal(
          staffSocket.events.filter((event) => event.kind === 'payment.completed').length,
          1,
        );
        assert.equal(
          kitchenSocket.events.filter((event) => event.kind === 'payment.completed').length,
          0,
        );
        assert.ok(
          !('total' in staffSocket.events.find((event) => event.kind === 'payment.completed')!),
        );
        assert.equal(
          (
            await request(
              `${path(main.session.id)}/payments`,
              'POST',
              { ...input, idempotencyKey: randomUUID() },
              cashier,
            )
          ).status,
          409,
        );
        assert.equal(
          (await request(`${path(main.session.id)}/payments`, 'POST', input, manager)).status,
          409,
        );
        assert.equal(
          (
            await request(
              `/public/tables/${main.table.publicCode}/bill`,
              'GET',
              {},
              main.cookie,
            )
          ).status,
          401,
        );
        assert.equal(
          (
            await request(
              `${path(main.session.id)}/status`,
              'POST',
              { from: 'PAYMENT_REQUESTED', to: 'OPEN', reason: 'Muốn gọi thêm' },
              cashier,
            )
          ).status,
          409,
        );
        assert.equal(
          (
            await json<Receipt>(
              await request(`${path(main.session.id)}/receipt`, 'GET', {}, waiter),
            )
          ).id,
          paid.id,
        );
      },
    );
    await t.test(
      'receipts survive menu/table/restaurant edits; recorded payment cannot be updated or read across tenant',
      async () => {
        const stored = await json<Receipt>(
          await request(`/billing/receipts/${paid.id}`, 'GET', {}, cashier),
        );
        await db.menuItem.update({
          where: { id: item.id },
          data: { name: 'Tên món sau sửa', basePrice: 90000 },
        });
        await db.diningTable.update({
          where: { id: main.table.id },
          data: { name: 'Tên bàn sau sửa' },
        });
        await db.restaurant.update({
          where: { id: restaurantIds[0]! },
          data: {
            name: 'Nhà hàng sau sửa',
            address: 'Địa chỉ sau sửa',
            taxBps: 0,
            serviceChargeBps: 0,
          },
        });
        assert.deepEqual(
          await json<Receipt>(await request(`/billing/receipts/${paid.id}`, 'GET', {}, waiter)),
          stored,
        );
        assert.equal(stored.bill.orders[0]!.items[0]!.name, 'Trà nguyên bản');
        assert.equal(stored.bill.orders[0]!.items[0]!.modifiers[0]!.name, 'L');
        await assert.rejects(
          db.payment.update({ where: { id: paid.id }, data: { reference: 'Sửa giao dịch' } }),
        );
        assert.equal(
          (await request(`/billing/receipts/${paid.id}`, 'GET', {}, foreign)).status,
          404,
        );
        assert.equal(
          (await request(`/billing/receipts/${paid.id}`, 'GET', {}, kitchen)).status,
          403,
        );
        assert.equal(
          (await json<unknown[]>(await request('/billing/receipts', 'GET', {}, cashier)))
            .length,
          1,
        );
        await db.menuItem.update({
          where: { id: item.id },
          data: { name: 'Trà nguyên bản', basePrice: 35001 },
        });
      },
    );
    await t.test(
      'manual bank transfer and zero-total full discount create immutable completed receipts',
      async () => {
        for (const zero of [false, true]) {
          const ctx = await context(),
            placed = await order(ctx);
          await serve(placed.id);
          let quote = await json<Bill>(
            await request(`${path(ctx.session.id)}/bill`, 'GET', {}, manager),
          );
          if (zero)
            quote = await json<Bill>(
              await request(
                `${path(ctx.session.id)}/discount`,
                'PATCH',
                {
                  amount: quote.totals.subtotal,
                  reason: 'Quản lý miễn toàn bộ',
                  revision: quote.revision,
                },
                manager,
              ),
            );
          const result = await json<Receipt>(
            await request(
              `${path(ctx.session.id)}/payments`,
              'POST',
              payment(quote, 'BANK_TRANSFER'),
              manager,
            ),
            201,
          );
          assert.equal(result.method, 'BANK_TRANSFER');
          assert.equal(result.paidAmount, zero ? 0 : 36001);
          assert.equal(result.reference, 'Đã kiểm tra giao dịch 123');
          assert.equal(result.bill.status, 'CLOSED');
        }
      },
    );
    await t.test(
      'all-cancelled session can close without payment and new receipt fields reject partial data',
      async () => {
        const ctx = await context(),
          placed = await order(ctx);
        await cancel(placed.id);
        await json(
          await request(
            `${path(ctx.session.id)}/status`,
            'POST',
            { from: 'OPEN', to: 'PAYMENT_REQUESTED', reason: null },
            cashier,
          ),
          201,
        );
        await json(
          await request(
            `/dining-sessions/tables/${ctx.table.id}/close-empty`,
            'POST',
            { reason: 'Khách hủy tất cả món' },
            cashier,
          ),
          201,
        );
        assert.equal(
          (await db.diningSession.findUniqueOrThrow({ where: { id: ctx.session.id } })).status,
          'CLOSED',
        );
        assert.equal(await db.payment.count({ where: { diningSessionId: ctx.session.id } }), 0);
        assert.equal(
          await db.order.count({
            where: { diningSessionId: ctx.session.id, status: 'CANCELLED' },
          }),
          1,
        );
        await assert.rejects(
          db.payment.create({
            data: {
              restaurantId: restaurantIds[0]!,
              diningSessionId: other.session.id,
              method: 'CASH',
              subtotal: 0,
              total: 0,
              paidAmount: 0,
              idempotencyKey: randomUUID(),
              receiptSnapshot: {},
            },
          }),
        );
      },
    );
    await t.test(
      'pay versus new order or reopen has one legal outcome without losing orders',
      async () => {
        const ctx = await context(),
          placed = await order(ctx);
        await serve(placed.id);
        const quote = await json<Bill>(
          await request(`${path(ctx.session.id)}/bill`, 'GET', {}, cashier),
        );
        const orderInput = {
          diningSessionId: ctx.session.id,
          idempotencyKey: randomUUID(),
          expectedTotal: 36001,
          note: null,
          items: [
            {
              menuItemId: item.id,
              quantity: 1,
              modifierOptionIds: [group.options[0]!.id],
              note: null,
            },
          ],
        };
        const results = await Promise.all([
          request(`${path(ctx.session.id)}/payments`, 'POST', payment(quote), cashier),
          request(
            `/public/tables/${ctx.table.publicCode}/orders`,
            'POST',
            orderInput,
            ctx.cookie,
          ),
        ]);
        assert.ok(
          (results[0]!.status === 201 && results[1]!.status === 401) ||
            (results[0]!.status === 409 && results[1]!.status === 201),
        );
        const payments = await db.payment.count({ where: { diningSessionId: ctx.session.id } });
        assert.equal(payments, results[0]!.status === 201 ? 1 : 0);
        assert.equal(
          await db.order.count({ where: { diningSessionId: ctx.session.id } }),
          results[1]!.status === 201 ? 2 : 1,
        );
        const next = await context(),
          dish = await order(next);
        await serve(dish.id);
        await json(
          await request(
            `${path(next.session.id)}/status`,
            'POST',
            { from: 'OPEN', to: 'PAYMENT_REQUESTED', reason: null },
            cashier,
          ),
          201,
        );
        const nextBill = await json<Bill>(
          await request(`${path(next.session.id)}/bill`, 'GET', {}, cashier),
        );
        const race = await Promise.all([
          request(`${path(next.session.id)}/payments`, 'POST', payment(nextBill), cashier),
          request(
            `${path(next.session.id)}/status`,
            'POST',
            { from: 'PAYMENT_REQUESTED', to: 'OPEN', reason: 'Khách gọi thêm' },
            waiter,
          ),
        ]);
        assert.ok(
          (race[0]!.status === 201 && race[1]!.status === 409) ||
            (race[0]!.status === 409 && race[1]!.status === 201),
        );
      },
    );
  } finally {
    for (const client of sockets) client.disconnect();
    const scope = { restaurantId: { in: restaurantIds } };
    await db.payment.deleteMany({ where: scope });
    await db.orderItemModifier.deleteMany({ where: scope });
    await db.orderItem.deleteMany({ where: scope });
    await db.order.deleteMany({ where: scope });
    await db.serviceRequest.deleteMany({ where: scope });
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
