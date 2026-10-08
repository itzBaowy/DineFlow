import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { createApp } from '../src/bootstrap';
import { PrismaService } from '../src/database/prisma.service';
import { AuthService } from '../src/auth/auth.service';
import { CONFIG, type AppConfig } from '../src/config/env';
import { hashPassword } from '../src/auth/password';
import { testDatabaseUrl } from './test-env';
import { roles } from '@dineflow/shared';

test('Phase 1 integration with real PostgreSQL and HTTP', async t => {
  process.env.DATABASE_URL = testDatabaseUrl();
  process.env.NODE_ENV = 'test';
  const app = await createApp(false);
  const db = app.get(PrismaService);
  const auth = app.get(AuthService);
  const config = app.get<AppConfig>(CONFIG);
  await app.listen(0, '127.0.0.1');
  const base = `${await app.getUrl()}/api/v1`;
  const suffix = randomUUID();
  const password = `Test!${randomBytes(16).toString('base64url')}`;
  const passwordHash = await hashPassword(password);
  const restaurant = await db.restaurant.create({ data: { slug: `test-${suffix}`, name: 'Integration Restaurant' } });
  const other = await db.restaurant.create({ data: { slug: `other-${suffix}`, name: 'Other Restaurant' } });
  const fixtures = await Promise.all(roles.map(role => db.user.create({ data: { email: `${role.toLowerCase()}.${suffix}@dineflow.test`, name: role, passwordHash, memberships: { create: { restaurantId: restaurant.id, role } } }, include: { memberships: true } })));
  const owner = fixtures.find(user => user.name === 'OWNER')!;
  const waiter = fixtures.find(user => user.name === 'WAITER')!;
  const table = await db.diningTable.create({ data: { restaurantId: restaurant.id, name: 'Bàn test', publicCode: randomBytes(24).toString('base64url') } });
  await db.diningTable.create({ data: { restaurantId: other.id, name: 'Other table', publicCode: randomBytes(24).toString('base64url') } });

  const headers = { 'Content-Type': 'application/json', 'X-DineFlow-Client': 'web', Origin: config.APP_ORIGIN };
  async function get(path: string, cookie = '') { return fetch(`${base}${path}`, { headers: { Cookie: cookie } }); }
  async function post(path: string, body: unknown = {}, cookie = '', customHeaders: Record<string, string> = {}) {
    return fetch(`${base}${path}`, { method: 'POST', headers: { ...headers, Cookie: cookie, ...customHeaders }, body: JSON.stringify(body) });
  }
  function cookieFor(credentials: Awaited<ReturnType<AuthService['login']>>) { return `df_access=${credentials.accessToken}; df_refresh=${credentials.refreshToken}`; }
  function responseCookies(response: Response) { return response.headers.getSetCookie().map(cookie => cookie.split(';')[0]).join('; '); }
  try {
    await t.test('health readiness reaches PostgreSQL and unauthorized access fails', async () => {
      const ready = await get('/health/ready');
      assert.equal(ready.status, 200);
      assert.deepEqual(await ready.json(), { status: 'ok', database: 'up' });
      assert.equal((await get('/auth/me')).status, 401);
      assert.equal((await get('/restaurant/settings')).status, 401);
    });
    await t.test('login validation, CSRF and invalid password are rejected', async () => {
      assert.equal((await post('/auth/login', { email: owner.email, password, role: 'OWNER' })).status, 400);
      assert.equal((await post('/auth/login', { email: owner.email, password }, '', { Origin: 'https://attacker.example' })).status, 403);
      assert.equal((await post('/auth/login', { email: owner.email, password }, '', { 'X-DineFlow-Client': '' })).status, 403);
      assert.equal((await post('/auth/login', { email: owner.email, password: 'wrong' })).status, 401);
    });
    await t.test('HTTP login uses HttpOnly cookies and real restaurant-scoped data', async () => {
      const response = await post('/auth/login', { email: owner.email, password });
      assert.equal(response.status, 200);
      const body = await response.json() as Record<string, unknown>;
      assert.equal(body.role, 'OWNER');
      assert.equal(body.restaurantId, restaurant.id);
      assert.equal('accessToken' in body, false);
      const cookies = response.headers.getSetCookie();
      assert.equal(cookies.length, 2);
      assert.ok(cookies.every(cookie => cookie.includes('HttpOnly') && cookie.includes('SameSite=Lax')));
      assert.ok(cookies.find(cookie => cookie.startsWith('df_refresh='))?.includes('Path=/api/v1/auth'));
      const overview = await get('/restaurant/overview', responseCookies(response));
      assert.equal(overview.status, 200);
      const data = await overview.json() as { counts: { tables: number; staff: number } };
      assert.equal(data.counts.tables, 1); // Other restaurant's table is excluded.
      assert.equal(data.counts.staff, 5);
    });
    await t.test('RBAC checks all five roles on the backend', async () => {
      for (const user of fixtures) {
        const credentials = await auth.login({ email: user.email, password });
        const settings = await get('/restaurant/settings', cookieFor(credentials));
        assert.equal(settings.status, user.name === 'OWNER' || user.name === 'MANAGER' ? 200 : 403, user.name);
      }
    });
    await t.test('rotation invalidates reuse and revocation is committed', async () => {
      const initial = await auth.login({ email: waiter.email, password });
      const fresh = await post('/auth/refresh', {}, cookieFor(initial));
      assert.equal(fresh.status, 200);
      const freshCookies = responseCookies(fresh);
      assert.notEqual(freshCookies.split('df_refresh=')[1], initial.refreshToken);
      assert.equal((await get('/auth/me', freshCookies)).status, 200);
      assert.equal((await post('/auth/refresh', {}, cookieFor(initial))).status, 401);
      assert.equal((await get('/auth/me', freshCookies)).status, 401);
      assert.ok((await db.authSession.findUniqueOrThrow({ where: { id: initial.staff.authSessionId } })).revokedAt);
    });
    await t.test('concurrent refresh cannot consume a token twice', async () => {
      const initial = await auth.login({ email: waiter.email, password });
      const responses = await Promise.all([post('/auth/refresh', {}, cookieFor(initial)), post('/auth/refresh', {}, cookieFor(initial))]);
      assert.deepEqual(responses.map(response => response.status).sort(), [200, 401]);
      assert.equal(await db.refreshToken.count({ where: { authSessionId: initial.staff.authSessionId } }), 2);
      const winner = responses.find(response => response.status === 200)!;
      assert.equal((await get('/auth/me', responseCookies(winner))).status, 401); // Strict replay family revocation.
    });
    await t.test('logout clears cookies and immediately invalidates access JWT', async () => {
      const initial = await auth.login({ email: waiter.email, password });
      const response = await post('/auth/logout', {}, cookieFor(initial));
      assert.equal(response.status, 204);
      assert.ok(response.headers.getSetCookie().every(cookie => cookie.includes('Expires=Thu, 01 Jan 1970')));
      assert.equal((await get('/auth/me', cookieFor(initial))).status, 401);
      assert.equal((await post('/auth/logout', {}, cookieFor(initial))).status, 204);
    });
    await t.test('expiry, membership changes and disabled users are enforced immediately', async () => {
      const initial = await auth.login({ email: waiter.email, password });
      const membership = waiter.memberships[0]!;
      await db.staffMembership.update({ where: { id: membership.id }, data: { role: 'MANAGER' } });
      assert.equal((await get('/restaurant/settings', cookieFor(initial))).status, 200);
      await db.staffMembership.update({ where: { id: membership.id }, data: { isActive: false } });
      assert.equal((await get('/auth/me', cookieFor(initial))).status, 401);
      await db.staffMembership.update({ where: { id: membership.id }, data: { isActive: true, role: 'WAITER' } });
      await db.user.update({ where: { id: waiter.id }, data: { isActive: false } });
      assert.equal((await get('/auth/me', cookieFor(initial))).status, 401);
      await db.user.update({ where: { id: waiter.id }, data: { isActive: true } });
      await db.authSession.update({ where: { id: initial.staff.authSessionId }, data: { createdAt: new Date(Date.now() - 200000), expiresAt: new Date(Date.now() - 100000) } });
      assert.equal((await post('/auth/refresh', {}, cookieFor(initial))).status, 401);
    });
    await t.test('login rate limit prevents repeated password guesses', async () => {
      const email = `missing.${suffix}@dineflow.test`;
      const statuses: number[] = [];
      for (let n = 0; n < 6; n++) statuses.push((await post('/auth/login', { email, password: 'wrong' })).status);
      assert.deepEqual(statuses, [401, 401, 401, 401, 401, 429]);
    });
    await t.test('DB constraints reject invalid prices and cross-restaurant references', async () => {
      const category = await db.menuCategory.create({ data: { restaurantId: restaurant.id, name: 'Test category' } });
      await assert.rejects(db.menuItem.create({ data: { restaurantId: restaurant.id, categoryId: category.id, name: 'Invalid', basePrice: -1 } }));
      await assert.rejects(db.menuItem.create({ data: { restaurantId: other.id, categoryId: category.id, name: 'Cross-scope', basePrice: 50000 } }));
      await assert.rejects(db.modifierGroup.create({ data: { restaurantId: restaurant.id, name: 'Invalid range', minSelections: 2, maxSelections: 1 } }));
    });
    await t.test('DB prevents concurrent active sessions and duplicate full payment', async () => {
      const attempts = await Promise.allSettled([db.diningSession.create({ data: { restaurantId: restaurant.id, tableId: table.id } }), db.diningSession.create({ data: { restaurantId: restaurant.id, tableId: table.id } })]);
      assert.equal(attempts.filter(result => result.status === 'fulfilled').length, 1);
      const session = await db.diningSession.findFirstOrThrow({ where: { tableId: table.id, status: 'OPEN' } });
      const payment = { restaurantId: restaurant.id, diningSessionId: session.id, method: 'CASH' as const, subtotal: 50000, total: 50000, paidAmount: 50000 };
      const payments = await Promise.allSettled([db.payment.create({ data: payment }), db.payment.create({ data: payment })]);
      assert.equal(payments.filter(result => result.status === 'fulfilled').length, 1);
      await assert.rejects(db.diningSession.update({ where: { id: session.id }, data: { status: 'CLOSED' } }));
      await db.diningSession.update({ where: { id: session.id }, data: { status: 'CLOSED', closedAt: new Date() } });
      assert.ok(await db.diningSession.create({ data: { restaurantId: restaurant.id, tableId: table.id } }));
    });
  } finally {
    // Remove only this run's isolated fixtures, never development data.
    const restaurantIds = [restaurant.id, other.id];
    const userIds = fixtures.map(user => user.id);
    await db.$transaction(async tx => {
      await tx.refreshToken.deleteMany({ where: { authSession: { userId: { in: userIds } } } });
      await tx.authSession.deleteMany({ where: { userId: { in: userIds } } });
      await tx.activityLog.deleteMany({ where: { restaurantId: { in: restaurantIds } } });
      await tx.payment.deleteMany({ where: { restaurantId: { in: restaurantIds } } });
      await tx.diningSession.deleteMany({ where: { restaurantId: { in: restaurantIds } } });
      await tx.diningTable.deleteMany({ where: { restaurantId: { in: restaurantIds } } });
      await tx.menuCategory.deleteMany({ where: { restaurantId: { in: restaurantIds } } });
      await tx.staffMembership.deleteMany({ where: { userId: { in: userIds } } });
      await tx.user.deleteMany({ where: { id: { in: userIds } } });
      await tx.restaurant.deleteMany({ where: { id: { in: restaurantIds } } });
    });
    await app.close();
  }
});
