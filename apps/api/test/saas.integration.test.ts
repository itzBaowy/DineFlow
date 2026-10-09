import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import { createApp } from '../src/bootstrap';
import { PrismaService } from '../src/database/prisma.service';
import { CONFIG, type AppConfig } from '../src/config/env';
import { hashPassword } from '../src/auth/password';
import { SetupMutationService } from '../src/common/setup-mutation.service';
import { testDatabaseUrl } from './test-env';
import {
  registerSchema,
  platformPrincipalSchema,
  platformTenantListSchema,
  platformOverviewSchema,
} from '@dineflow/shared';

test('SaaS registration, platform separation and tenant lifecycle with real PostgreSQL', async (t) => {
  process.env.DATABASE_URL = testDatabaseUrl();
  process.env.NODE_ENV = 'test';
  const app = await createApp(false),
    db = app.get(PrismaService),
    config = app.get<AppConfig>(CONFIG);
  await app.listen(0, '127.0.0.1');
  const base = `${await app.getUrl()}/api/v1`,
    suffix = randomUUID(),
    password = `Test!${randomBytes(16).toString('base64url')}`;
  const initialSettings = await db.platformSettings.findUniqueOrThrow({
    where: { id: 'global' },
  });
  const admin = await db.user.create({
    data: {
      email: `admin.${suffix}@dineflow.test`,
      name: 'Platform Test',
      passwordHash: await hashPassword(password),
      isPlatformAdmin: true,
    },
  });
  const headers = {
    'Content-Type': 'application/json',
    'X-DineFlow-Client': 'web',
    Origin: config.APP_ORIGIN,
  };
  const cookies = (response: Response) =>
    response.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ');
  const send = (path: string, body: unknown, cookie = '', method = 'POST') =>
    fetch(`${base}${path}`, {
      method,
      headers: { ...headers, Cookie: cookie },
      body: JSON.stringify(body),
    });
  const get = (path: string, cookie = '') =>
    fetch(`${base}${path}`, { headers: { Cookie: cookie } });
  const input = (prefix: string) => ({
    name: prefix,
    email: `${prefix}.${suffix}@dineflow.test`,
    password,
    restaurantName: `Quán ${prefix}`,
    slug: `saas-${prefix}-${suffix}`,
    timezone: 'Asia/Ho_Chi_Minh',
  });
  let ownerCookie = '',
    otherCookie = '',
    platformCookie = '',
    managerCookie = '',
    guestCookie = '';
  let tenantId = '',
    otherId = '',
    managerId = '',
    code = '',
    sessionId = '';
  try {
    await db.platformSettings.update({
      where: { id: 'global' },
      data: { registrationsEnabled: true },
    });
    await t.test(
      'public registration creates empty tenant and OWNER atomically; role escalation and CSRF fail',
      async () => {
        assert.equal(
          registerSchema.safeParse({ ...input('bad'), isPlatformAdmin: true }).success,
          false,
        );
        assert.equal(
          (await send('/auth/register', { ...input('bad'), role: 'OWNER' })).status,
          400,
        );
        assert.equal(
          (
            await fetch(`${base}/auth/register`, {
              method: 'POST',
              headers: { ...headers, Origin: 'https://bad.example' },
              body: JSON.stringify(input('bad')),
            })
          ).status,
          403,
        );
        const response = await send('/auth/register', input('owner'));
        assert.equal(response.status, 201);
        assert.deepEqual(await response.json(), { registered: true });
        assert.equal(response.headers.getSetCookie().length, 0);
        const user = await db.user.findUniqueOrThrow({
          where: { email: input('owner').email },
          include: { memberships: true },
        });
        assert.equal(user.isPlatformAdmin, false);
        assert.equal(user.memberships.length, 1);
        assert.equal(user.memberships[0]!.role, 'OWNER');
        tenantId = user.memberships[0]!.restaurantId;
        assert.equal(await db.menuItem.count({ where: { restaurantId: tenantId } }), 0);
        assert.equal(await db.diningTable.count({ where: { restaurantId: tenantId } }), 0);
        const login = await send('/auth/login', { email: user.email, password });
        assert.equal(login.status, 200);
        ownerCookie = cookies(login);
        assert.equal(((await login.json()) as { restaurantId: string }).restaurantId, tenantId);
      },
    );
    await t.test(
      'duplicate signup and racing requests leave no orphan restaurant or privilege flag',
      async () => {
        assert.equal(
          (await send('/auth/register', { ...input('duplicate'), email: input('owner').email }))
            .status,
          409,
        );
        assert.equal(
          await db.restaurant.count({ where: { slug: input('duplicate').slug } }),
          0,
        );
        const race = input('race'),
          responses = await Promise.all([
            send('/auth/register', race),
            send('/auth/register', race),
          ]);
        assert.deepEqual(responses.map((r) => r.status).sort(), [201, 409]);
        assert.equal(await db.restaurant.count({ where: { slug: race.slug } }), 1);
        assert.equal(await db.user.count({ where: { email: race.email } }), 1);
      },
    );
    await t.test(
      'independent tenants isolate owner-created manager and deny foreign staff IDs',
      async () => {
        assert.equal((await send('/auth/register', input('other'))).status, 201);
        const otherUser = await db.user.findUniqueOrThrow({
          where: { email: input('other').email },
          include: { memberships: true },
        });
        otherId = otherUser.memberships[0]!.restaurantId;
        const login = await send('/auth/login', { email: otherUser.email, password });
        otherCookie = cookies(login);
        const created = await send(
          '/staff',
          {
            name: 'Quản lý mới',
            email: `manager.${suffix}@dineflow.test`,
            password,
            role: 'MANAGER',
          },
          ownerCookie,
        );
        assert.equal(created.status, 201);
        const member = (await created.json()) as {
          id: string;
          userId: string;
          updatedAt: string;
        };
        managerId = member.id;
        const memberLogin = await send('/auth/login', {
          email: `manager.${suffix}@dineflow.test`,
          password,
        });
        assert.equal(memberLogin.status, 200);
        managerCookie = cookies(memberLogin);
        assert.equal(
          ((await memberLogin.json()) as { restaurantId: string }).restaurantId,
          tenantId,
        );
        const others = (await (await get('/staff', otherCookie)).json()) as {
          members: { id: string }[];
        };
        assert.equal(
          others.members.some((row) => row.id === managerId),
          false,
        );
        assert.equal(
          (
            await send(
              `/staff/${managerId}`,
              {
                name: 'Foreign',
                role: 'MANAGER',
                isActive: false,
                expectedUpdatedAt: member.updatedAt,
              },
              otherCookie,
              'PATCH',
            )
          ).status,
          404,
        );
        const owner = await db.staffMembership.findFirstOrThrow({
          where: { restaurantId: tenantId, role: 'OWNER' },
        });
        assert.equal(
          (
            await send(
              `/staff/${owner.id}`,
              {
                name: 'Owner',
                role: 'OWNER',
                isActive: false,
                expectedUpdatedAt: owner.updatedAt.toISOString(),
              },
              managerCookie,
              'PATCH',
            )
          ).status,
          403,
        );
      },
    );
    await t.test(
      'platform login has separate opaque HttpOnly session; tenant roles cannot use platform APIs',
      async () => {
        assert.equal((await get('/platform/overview', ownerCookie)).status, 401);
        assert.equal((await get('/platform/overview', managerCookie)).status, 401);
        assert.equal(
          (await send('/platform/auth/login', { email: input('owner').email, password }))
            .status,
          401,
        );
        const login = await send('/platform/auth/login', { email: admin.email, password });
        assert.equal(login.status, 200);
        const principal = platformPrincipalSchema.parse(await login.json());
        assert.equal(principal.role, 'PLATFORM_ADMIN');
        platformCookie = cookies(login);
        assert.ok(login.headers.getSetCookie()[0]!.includes('HttpOnly'));
        assert.ok(login.headers.getSetCookie()[0]!.includes('SameSite=Strict'));
        assert.ok(login.headers.getSetCookie()[0]!.includes('Path=/api/v1/platform'));
        assert.equal((await get('/auth/me', platformCookie)).status, 401);
        assert.equal((await send('/auth/login', { email: admin.email, password })).status, 401);
        const list = platformTenantListSchema.parse(
          await (
            await get(`/platform/tenants?search=${input('owner').slug}`, platformCookie)
          ).json(),
        );
        assert.equal(list.total, 1);
        assert.equal(list.tenants[0]!.id, tenantId);
        assert.equal(
          (await get('/platform/tenants?restaurantId=arbitrary', platformCookie)).status,
          400,
        );
        assert.equal(
          (await get('/platform/tenants?status=INVALID', platformCookie)).status,
          400,
        );
        platformOverviewSchema.parse(
          await (await get('/platform/overview', platformCookie)).json(),
        );
      },
    );
    await t.test(
      'suspension revokes staff/guests and public QR access without changing dining state or other tenant',
      async () => {
        const table = await send(
          '/tables',
          { name: 'Bàn SaaS', capacity: 4, position: 0, status: 'AVAILABLE' },
          ownerCookie,
        );
        assert.equal(table.status, 201);
        const tableData = (await table.json()) as { id: string; publicCode: string };
        code = tableData.publicCode;
        const opened = await send(
          `/dining-sessions/tables/${tableData.id}/open`,
          {},
          ownerCookie,
        );
        assert.equal(opened.status, 201);
        sessionId = ((await opened.json()) as { id: string }).id;
        const admitted = await send(`/public/tables/${code}/guest`, {
          diningSessionId: sessionId,
        });
        assert.equal(admitted.status, 201);
        guestCookie = cookies(admitted);
        const tenant = await db.restaurant.findUniqueOrThrow({ where: { id: tenantId } });
        const changed = await send(
          `/platform/tenants/${tenantId}/status`,
          {
            status: 'SUSPENDED',
            reason: 'Kiểm tra tạm ngừng tenant',
            expectedUpdatedAt: tenant.updatedAt.toISOString(),
          },
          platformCookie,
          'PATCH',
        );
        assert.equal(changed.status, 200);
        assert.equal((await get('/auth/me', ownerCookie)).status, 401);
        assert.equal((await get('/staff', managerCookie)).status, 401);
        assert.equal((await send('/auth/refresh', {}, ownerCookie)).status, 401);
        assert.equal(
          (await send('/auth/login', { email: input('owner').email, password })).status,
          401,
        );
        assert.equal((await get(`/public/tables/${code}/menu`, guestCookie)).status, 404);
        assert.equal((await get(`/public/tables/${code}`)).status, 404);
        assert.equal(
          (await send(`/public/tables/${code}/realtime-ticket`, {}, guestCookie)).status,
          404,
        );
        assert.equal((await get('/auth/me', otherCookie)).status, 200);
        assert.equal(
          (await db.diningSession.findUniqueOrThrow({ where: { id: sessionId } })).status,
          'OPEN',
        );
        assert.equal(
          await db.authSession.count({
            where: { membership: { restaurantId: tenantId }, revokedAt: null },
          }),
          0,
        );
        assert.equal(
          await db.guestSession.count({
            where: { diningSessionId: sessionId, revokedAt: null },
          }),
          0,
        );
      },
    );
    await t.test(
      'stale platform change fails; resumption never restores revoked credentials',
      async () => {
        const tenant = await db.restaurant.findUniqueOrThrow({ where: { id: tenantId } });
        assert.equal(
          (
            await send(
              `/platform/tenants/${tenantId}/status`,
              {
                status: 'ACTIVE',
                reason: 'Stale',
                expectedUpdatedAt: '2020-01-01T00:00:00.000Z',
              },
              platformCookie,
              'PATCH',
            )
          ).status,
          409,
        );
        assert.equal(
          (
            await send(
              `/platform/tenants/${tenantId}/status`,
              {
                status: 'ACTIVE',
                reason: 'Mở lại nhà hàng',
                expectedUpdatedAt: tenant.updatedAt.toISOString(),
              },
              platformCookie,
              'PATCH',
            )
          ).status,
          200,
        );
        assert.equal((await get('/auth/me', ownerCookie)).status, 401);
        assert.equal((await get(`/public/tables/${code}/orders`, guestCookie)).status, 401);
        const login = await send('/auth/login', { email: input('owner').email, password });
        assert.equal(login.status, 200);
        ownerCookie = cookies(login);
        assert.equal((await get(`/public/tables/${code}/menu`)).status, 200);
        assert.equal(
          (await db.restaurant.findUniqueOrThrow({ where: { id: tenantId } })).suspensionReason,
          null,
        );
      },
    );
    await t.test(
      'paused registrations reject atomic creation while existing owners keep working; admin audit excludes secrets',
      async () => {
        const settings = await db.platformSettings.findUniqueOrThrow({
          where: { id: 'global' },
        });
        assert.equal(
          (
            await send(
              '/platform/settings',
              {
                registrationsEnabled: false,
                reason: 'Tạm dừng đăng ký',
                expectedUpdatedAt: settings.updatedAt.toISOString(),
              },
              platformCookie,
              'PATCH',
            )
          ).status,
          200,
        );
        assert.equal((await send('/auth/register', input('paused'))).status, 503);
        assert.equal(await db.restaurant.count({ where: { slug: input('paused').slug } }), 0);
        assert.deepEqual(await (await get('/auth/registration-settings')).json(), {
          registrationsEnabled: false,
        });
        assert.equal((await get('/auth/me', ownerCookie)).status, 200);
        const audit = await (await get('/platform/audit', platformCookie)).text();
        assert.ok(audit.includes('tenant.suspended'));
        assert.ok(audit.includes('registration.disabled'));
        assert.equal(audit.includes(password), false);
        assert.equal(audit.includes('tokenHash'), false);
        assert.equal(audit.includes('passwordHash'), false);
        assert.equal(
          (
            await send(
              '/platform/settings',
              {
                registrationsEnabled: true,
                reason: 'Stale',
                expectedUpdatedAt: settings.updatedAt.toISOString(),
              },
              platformCookie,
              'PATCH',
            )
          ).status,
          409,
        );
      },
    );
    await t.test(
      'transaction waiting on tenant lock rechecks suspension before setup write',
      async () => {
        const credentials = await (await get('/auth/me', ownerCookie)).json();
        let release!: () => void, locked!: () => void;
        const barrier = new Promise<void>((resolve) => {
            release = resolve;
          }),
          acquired = new Promise<void>((resolve) => {
            locked = resolve;
          });
        const holder = db.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT id FROM "Restaurant" WHERE id = ${tenantId}::uuid FOR UPDATE`;
          locked();
          await barrier;
          await tx.restaurant.update({
            where: { id: tenantId },
            data: { status: 'SUSPENDED', suspensionReason: 'Race test' },
          });
        });
        await acquired;
        const pending = app
          .get(SetupMutationService)
          .run(credentials, 'test.created', 'MenuCategory', (tx) =>
            tx.menuCategory.create({
              data: { restaurantId: tenantId, name: 'Must not exist' },
            }),
          );
        const assertion = assert.rejects(pending, /tạm ngừng/);
        release();
        await holder;
        await assertion;
        assert.equal(
          await db.menuCategory.count({
            where: { restaurantId: tenantId, name: 'Must not exist' },
          }),
          0,
        );
      },
    );
    await t.test(
      'platform logout and expiry invalidate opaque sessions independently of tenant credentials',
      async () => {
        assert.equal((await send('/platform/auth/logout', {}, platformCookie)).status, 204);
        assert.equal((await get('/platform/overview', platformCookie)).status, 401);
        const login = await send('/platform/auth/login', { email: admin.email, password });
        const cookie = cookies(login),
          token = cookie.split('=')[1]!;
        await db.platformSession.update({
          where: { tokenHash: createHash('sha256').update(token).digest('hex') },
          data: { expiresAt: new Date(Date.now() - 1000) },
        });
        assert.equal((await get('/platform/auth/me', cookie)).status, 401);
        assert.equal((await get('/auth/me', otherCookie)).status, 200);
      },
    );
    await t.test('signup is rate limited by IP even when emails change', async () => {
      const statuses = [];
      for (let index = 0; index < 4; index++) {
        statuses.push(
          (await send('/auth/register', { ...input(`limit-${index}`), role: 'OWNER' })).status,
        );
      }
      assert.deepEqual(statuses, [400, 400, 400, 429]);
    });
    void otherId;
  } finally {
    await db.platformSettings.update({
      where: { id: 'global' },
      data: { registrationsEnabled: initialSettings.registrationsEnabled },
    });
    const ids = (
      await db.restaurant.findMany({
        where: { slug: { startsWith: 'saas-', endsWith: suffix } },
        select: { id: true },
      })
    ).map((row) => row.id);
    const userIds = (
      await db.user.findMany({
        where: { email: { endsWith: `.${suffix}@dineflow.test` } },
        select: { id: true },
      })
    ).map((row) => row.id);
    await db.guestSession.deleteMany({
      where: { diningSession: { restaurantId: { in: ids } } },
    });
    await db.diningSession.deleteMany({ where: { restaurantId: { in: ids } } });
    await db.diningTable.deleteMany({ where: { restaurantId: { in: ids } } });
    await db.menuCategory.deleteMany({ where: { restaurantId: { in: ids } } });
    await db.activityLog.deleteMany({ where: { restaurantId: { in: ids } } });
    await db.refreshToken.deleteMany({ where: { authSession: { userId: { in: userIds } } } });
    await db.authSession.deleteMany({ where: { userId: { in: userIds } } });
    await db.staffMembership.deleteMany({ where: { restaurantId: { in: ids } } });
    await db.platformSession.deleteMany({ where: { userId: { in: userIds } } });
    await db.platformAudit.deleteMany({ where: { actorUserId: { in: userIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await db.restaurant.deleteMany({ where: { id: { in: ids } } });
    await app.close();
  }
});
