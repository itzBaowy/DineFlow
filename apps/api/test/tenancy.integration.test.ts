import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { createApp } from '../src/bootstrap';
import { PrismaService } from '../src/database/prisma.service';
import { AuthService } from '../src/auth/auth.service';
import { CONFIG, type AppConfig } from '../src/config/env';
import { hashPassword } from '../src/auth/password';
import { testDatabaseUrl } from './test-env';
import { loginStaff } from './login-staff';
import {
  restaurantChoiceSchema,
  restaurantChoicesSchema,
  staffLoginResultSchema,
  staffPrincipalSchema,
} from '@dineflow/shared';

test('Multi-restaurant creation, selection and session switching with real PostgreSQL', async (t) => {
  process.env.DATABASE_URL = testDatabaseUrl();
  process.env.NODE_ENV = 'test';
  const app = await createApp(false),
    db = app.get(PrismaService),
    auth = app.get(AuthService),
    config = app.get<AppConfig>(CONFIG);
  await app.listen(0, '127.0.0.1');
  const base = `${await app.getUrl()}/api/v1`,
    suffix = randomUUID(),
    password = `Test!${randomBytes(20).toString('base64url')}`;
  const settings = await db.platformSettings.findUniqueOrThrow({ where: { id: 'global' } });
  const restaurants = await Promise.all(
    ['a', 'foreign'].map((label) =>
      db.restaurant.create({
        data: { name: `Tenant ${label}`, slug: `tenancy-${label}-${suffix}` },
      }),
    ),
  );
  const a = restaurants[0]!,
    foreign = restaurants[1]!,
    passwordHash = await hashPassword(password);
  const owner = await db.user.create({
    data: {
      email: `owner.${suffix}@tenancy.test`,
      name: 'Owner',
      passwordHash,
      memberships: { create: { restaurantId: a.id, role: 'OWNER' } },
    },
  });
  const manager = await db.user.create({
    data: {
      email: `manager.${suffix}@tenancy.test`,
      name: 'Manager',
      passwordHash,
      memberships: { create: { restaurantId: a.id, role: 'MANAGER' } },
    },
  });
  const old = await loginStaff(auth, { email: owner.email, password });
  const managerLogin = await loginStaff(auth, { email: manager.email, password });
  const cookieFor = (credentials: Awaited<ReturnType<typeof loginStaff>>) =>
    `df_access=${credentials.accessToken}; df_refresh=${credentials.refreshToken}`;
  const cookies = (response: Response) =>
    response.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ');
  const headers = {
    'Content-Type': 'application/json',
    'X-DineFlow-Client': 'web',
    Origin: config.APP_ORIGIN,
  };
  const post = (path: string, body: unknown, cookie = '') =>
    fetch(`${base}${path}`, {
      method: 'POST',
      headers: { ...headers, Cookie: cookie },
      body: JSON.stringify(body),
    });
  const get = (path: string, cookie = '') =>
    fetch(`${base}${path}`, { headers: { Cookie: cookie } });
  const input = {
    restaurantName: 'Nhà hàng B',
    slug: `tenancy-b-${suffix}`,
    timezone: 'Asia/Bangkok',
  };
  let b = '',
    current = cookieFor(old);
  try {
    await db.platformSettings.update({
      where: { id: 'global' },
      data: { registrationsEnabled: true },
    });
    await t.test(
      'OWNER creates empty tenant with the same user; scope stays on current tenant',
      async () => {
        const response = await post('/auth/restaurants', input, current);
        assert.equal(response.status, 201);
        const choice = restaurantChoiceSchema.parse(await response.json());
        b = choice.restaurantId;
        assert.equal(choice.role, 'OWNER');
        assert.equal(choice.timezone, 'Asia/Bangkok');
        assert.equal(response.headers.getSetCookie().length, 0);
        assert.equal(await db.user.count({ where: { id: owner.id } }), 1);
        assert.equal(await db.staffMembership.count({ where: { userId: owner.id } }), 2);
        assert.equal(await db.menuItem.count({ where: { restaurantId: b } }), 0);
        assert.equal(await db.diningTable.count({ where: { restaurantId: b } }), 0);
        assert.equal(
          staffPrincipalSchema.parse(await (await get('/auth/me', current)).json())
            .restaurantId,
          a.id,
        );
      },
    );
    await t.test(
      'role injection, manager creation, CSRF and duplicate slug are denied atomically',
      async () => {
        assert.equal(
          (await post('/auth/restaurants', { ...input, role: 'OWNER' }, current)).status,
          400,
        );
        assert.equal(
          (
            await post(
              '/auth/restaurants',
              { ...input, slug: `tenancy-denied-${suffix}` },
              cookieFor(managerLogin),
            )
          ).status,
          403,
        );
        assert.equal((await post('/auth/restaurants', input, current)).status, 409);
        const csrf = await fetch(`${base}/auth/restaurants`, {
          method: 'POST',
          headers: { ...headers, Origin: 'https://bad.example', Cookie: current },
          body: JSON.stringify(input),
        });
        assert.equal(csrf.status, 403);
        assert.equal(
          await db.restaurant.count({
            where: { slug: { startsWith: 'tenancy-', endsWith: suffix } },
          }),
          3,
        );
      },
    );
    await t.test(
      'platform registration pause blocks additional tenants without blocking existing staff',
      async () => {
        await db.platformSettings.update({
          where: { id: 'global' },
          data: { registrationsEnabled: false },
        });
        const slug = `tenancy-paused-${suffix}`;
        assert.equal(
          (await post('/auth/restaurants', { ...input, slug }, current)).status,
          503,
        );
        assert.equal(await db.restaurant.count({ where: { slug } }), 0);
        assert.equal((await get('/auth/me', current)).status, 200);
        await db.platformSettings.update({
          where: { id: 'global' },
          data: { registrationsEnabled: true },
        });
      },
    );
    await t.test(
      'password verification precedes membership choices; no session or secrets are returned',
      async () => {
        assert.equal(
          (await post('/auth/login', { email: owner.email, password: 'wrong' })).status,
          401,
        );
        const before = await db.authSession.count({ where: { userId: owner.id } });
        const response = await post('/auth/login', { email: owner.email, password });
        assert.equal(response.status, 200);
        assert.equal(response.headers.getSetCookie().length, 0);
        const result = staffLoginResultSchema.parse(await response.json());
        assert.ok('selectionRequired' in result);
        assert.equal(result.restaurants.length, 2);
        assert.equal(await db.authSession.count({ where: { userId: owner.id } }), before);
        assert.equal(
          (
            await post('/auth/login', {
              email: owner.email,
              password,
              restaurantId: foreign.id,
            })
          ).status,
          401,
        );
      },
    );
    await t.test(
      'choice lists only own active memberships and includes suspended statuses',
      async () => {
        const list = restaurantChoicesSchema.parse(
          await (await get('/auth/restaurants', current)).json(),
        );
        assert.deepEqual(
          list.restaurants.map((row) => row.restaurantId).sort(),
          [a.id, b].sort(),
        );
        assert.equal(
          (await post('/auth/switch-restaurant', { restaurantId: foreign.id }, current)).status,
          404,
        );
        assert.equal(
          (await post('/auth/switch-restaurant', { restaurantId: b, role: 'OWNER' }, current))
            .status,
          400,
        );
        await db.restaurant.update({
          where: { id: b },
          data: { status: 'SUSPENDED', suspensionReason: 'Integration test' },
        });
        assert.equal(
          (await post('/auth/switch-restaurant', { restaurantId: b }, current)).status,
          404,
        );
        const suspended = restaurantChoicesSchema.parse(
          await (await get('/auth/restaurants', current)).json(),
        );
        assert.equal(
          suspended.restaurants.find((row) => row.restaurantId === b)!.status,
          'SUSPENDED',
        );
        await db.restaurant.update({
          where: { id: b },
          data: { status: 'ACTIVE', suspensionReason: null },
        });
      },
    );
    await t.test(
      'switch rotates scope, revokes old access and refresh, preserves absolute expiry and isolates data',
      async () => {
        await db.menuCategory.create({ data: { restaurantId: a.id, name: 'Only A' } });
        const response = await post('/auth/switch-restaurant', { restaurantId: b }, current);
        assert.equal(response.status, 200);
        current = cookies(response);
        const principal = staffPrincipalSchema.parse(await response.json());
        assert.equal(principal.restaurantId, b);
        assert.equal(principal.role, 'OWNER');
        assert.notEqual(principal.authSessionId, old.staff.authSessionId);
        const next = await db.authSession.findUniqueOrThrow({
          where: { id: principal.authSessionId },
        });
        assert.equal(next.expiresAt.getTime(), old.expiresAt.getTime());
        assert.equal((await get('/auth/me', cookieFor(old))).status, 401);
        assert.equal((await post('/auth/refresh', {}, cookieFor(old))).status, 401);
        assert.equal((await get('/auth/me', current)).status, 200);
        const staleTab = await fetch(`${base}/restaurant/overview`, {
          headers: { Cookie: current, 'X-DineFlow-Restaurant': a.id },
        });
        assert.equal(staleTab.status, 409);
        assert.equal(staleTab.headers.get('X-DineFlow-Scope-Mismatch'), '1');
        const staleWrite = await fetch(`${base}/auth/switch-restaurant`, {
          method: 'POST',
          headers: { ...headers, Cookie: current, 'X-DineFlow-Restaurant': a.id },
          body: JSON.stringify({ restaurantId: a.id }),
        });
        assert.equal(staleWrite.status, 409);
        assert.equal((await get('/platform/overview', current)).status, 401);
        const categories = (await (await get('/menu/categories', current)).json()) as {
          name: string;
        }[];
        assert.equal(
          categories.some((row) => row.name === 'Only A'),
          false,
        );
        assert.equal(
          await db.activityLog.count({
            where: {
              actorUserId: owner.id,
              action: { in: ['auth.tenant_left', 'auth.tenant_entered'] },
            },
          }),
          2,
        );
      },
    );
    await t.test(
      'concurrent switches consume a session only once and cannot create two live successors',
      async () => {
        const responses = await Promise.all([
          post('/auth/switch-restaurant', { restaurantId: a.id }, current),
          post('/auth/switch-restaurant', { restaurantId: a.id }, current),
        ]);
        assert.deepEqual(responses.map((row) => row.status).sort(), [200, 401]);
        current = cookies(responses.find((row) => row.status === 200)!);
      },
    );
    await t.test(
      'switch applies the target membership role instead of carrying OWNER authority',
      async () => {
        await db.staffMembership.update({
          where: { userId_restaurantId: { userId: owner.id, restaurantId: b } },
          data: { role: 'WAITER' },
        });
        const response = await post('/auth/switch-restaurant', { restaurantId: b }, current);
        assert.equal(response.status, 200);
        current = cookies(response);
        assert.equal(staffPrincipalSchema.parse(await response.json()).role, 'WAITER');
        assert.equal((await get('/restaurant/settings', current)).status, 403);
        assert.equal(
          (
            await post(
              '/auth/restaurants',
              { ...input, slug: `tenancy-waiter-${suffix}` },
              current,
            )
          ).status,
          403,
        );
        const login = await post('/auth/login', {
          email: owner.email,
          password,
          restaurantId: b,
        });
        assert.equal(login.status, 200);
        assert.equal(staffPrincipalSchema.parse(await login.json()).role, 'WAITER');
      },
    );
    await t.test(
      'inactive target membership and expired source sessions cannot switch',
      async () => {
        await db.staffMembership.update({
          where: { userId_restaurantId: { userId: owner.id, restaurantId: a.id } },
          data: { isActive: false },
        });
        assert.equal(
          (await post('/auth/switch-restaurant', { restaurantId: a.id }, current)).status,
          404,
        );
        const list = restaurantChoicesSchema.parse(
          await (await get('/auth/restaurants', current)).json(),
        );
        assert.equal(list.restaurants.length, 1);
        const principal = staffPrincipalSchema.parse(
          await (await get('/auth/me', current)).json(),
        );
        await db.authSession.update({
          where: { id: principal.authSessionId },
          data: {
            createdAt: new Date(Date.now() - 200000),
            expiresAt: new Date(Date.now() - 100000),
          },
        });
        assert.equal(
          (await post('/auth/switch-restaurant', { restaurantId: a.id }, current)).status,
          401,
        );
      },
    );
  } finally {
    await db.platformSettings.update({
      where: { id: 'global' },
      data: { registrationsEnabled: settings.registrationsEnabled },
    });
    const ids = (
      await db.restaurant.findMany({
        where: { slug: { startsWith: 'tenancy-', endsWith: suffix } },
        select: { id: true },
      })
    ).map((row) => row.id);
    await db.menuCategory.deleteMany({ where: { restaurantId: { in: ids } } });
    await db.activityLog.deleteMany({ where: { restaurantId: { in: ids } } });
    await db.refreshToken.deleteMany({
      where: { authSession: { userId: { in: [owner.id, manager.id] } } },
    });
    await db.authSession.deleteMany({ where: { userId: { in: [owner.id, manager.id] } } });
    await db.staffMembership.deleteMany({ where: { restaurantId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: [owner.id, manager.id] } } });
    await db.restaurant.deleteMany({ where: { id: { in: ids } } });
    await app.close();
  }
});
