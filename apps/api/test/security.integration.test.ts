import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { createApp } from '../src/bootstrap';
import { CONFIG, type AppConfig } from '../src/config/env';
import { PrismaService } from '../src/database/prisma.service';
import { EmailService } from '../src/security/email.service';
import { AccountService } from '../src/security/account.service';
import { PlatformService } from '../src/platform/platform.service';
import { hashPassword } from '../src/auth/password';
import { totp, tokenHash, seal } from '../src/security/crypto';
import { testDatabaseUrl } from './test-env';
import { platformPrincipalSchema, staffPrincipalSchema } from '@dineflow/shared';

test('Account verification recovery global revocation and mandatory admin MFA', async (t) => {
  process.env.DATABASE_URL = testDatabaseUrl();
  process.env.NODE_ENV = 'test';
  process.env.EMAIL_PROVIDER = 'smtp';
  const app = await createApp(false),
    db = app.get(PrismaService),
    config = app.get<AppConfig>(CONFIG),
    emails = app.get(EmailService),
    accounts = app.get(AccountService),
    platform = app.get(PlatformService);
  await app.listen(0, '127.0.0.1');
  const base = `${await app.getUrl()}/api/v1`,
    suffix = randomUUID(),
    password = `Test!${randomBytes(20).toString('base64url')}`,
    email = `security.${suffix}@dineflow.test`;
  const settings = await db.platformSettings.findUniqueOrThrow({ where: { id: 'global' } });
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
  const cookies = (response: Response) =>
    response.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ');
  let userId = '',
    ownerCookie = '',
    resetToken = '',
    platformCookie = '';
  const admin = await db.user.create({
    data: {
      email: `admin.${suffix}@dineflow.test`,
      name: 'Private security admin',
      passwordHash: await hashPassword(password),
      isPlatformAdmin: true,
    },
  });
  async function deliveredToken(recipient: string, kind: string) {
    await emails.flush();
    const search = await fetch(
      `http://localhost:8025/api/v1/search?query=${encodeURIComponent(`to:${recipient}`)}`,
    );
    assert.equal(search.status, 200);
    const data = (await search.json()) as { messages: { ID: string; Subject: string }[] };
    const item = data.messages.find((row) => row.Subject.includes(kind));
    assert.ok(item, 'Expected delivered mail in Mailpit');
    const mail = (await (
      await fetch(`http://localhost:8025/api/v1/message/${item.ID}`)
    ).json()) as { Text: string };
    const token = mail.Text.match(/#token=([A-Za-z0-9_-]{43})/);
    assert.ok(token);
    return token[1]!;
  }
  try {
    await db.platformSettings.update({
      where: { id: 'global' },
      data: { registrationsEnabled: true },
    });
    await t.test(
      'signup queues encrypted email; new owner cannot login before actual mail verification',
      async () => {
        const registered = await post('/auth/register', {
          name: 'Security Owner',
          email,
          password,
          restaurantName: 'Security Tenant',
          slug: `security-${suffix}`,
        });
        assert.equal(registered.status, 201);
        const user = await db.user.findUniqueOrThrow({
          where: { email },
          include: { memberships: true },
        });
        userId = user.id;
        assert.equal(user.requiresEmailVerification, true);
        assert.equal(user.emailVerifiedAt, null);
        assert.equal((await post('/auth/login', { email, password })).status, 403);
        const token = await deliveredToken(email, 'Xác minh');
        const stored = await db.accountToken.findFirstOrThrow({
          where: { userId, kind: 'VERIFY_EMAIL' },
        });
        assert.notEqual(stored.tokenHash, token);
        assert.equal((await post('/auth/reset-password', { token, password })).status, 400);
        const responses = await Promise.all([
          post('/auth/verify-email', { token }),
          post('/auth/verify-email', { token }),
        ]);
        assert.deepEqual(responses.map((row) => row.status).sort(), [200, 400]);
        const login = await post('/auth/login', { email, password });
        assert.equal(login.status, 200);
        ownerCookie = cookies(login);
        staffPrincipalSchema.parse(await login.json());
      },
    );
    await t.test(
      'unknown and known emails have generic responses; resend has cooldown; CSRF/strict DTOs rejected',
      async () => {
        const unknown = await post('/auth/forgot-password', {
          email: `missing.${suffix}@dineflow.test`,
        });
        assert.equal(unknown.status, 201);
        assert.deepEqual(await unknown.json(), { accepted: true });
        const known = await post('/auth/forgot-password', { email });
        assert.equal(known.status, 201);
        assert.deepEqual(await known.json(), { accepted: true });
        await post('/auth/forgot-password', { email });
        assert.equal(
          await db.accountToken.count({ where: { userId, kind: 'RESET_PASSWORD' } }),
          1,
        );
        assert.equal(
          (await post('/auth/request-verification', { email, role: 'OWNER' })).status,
          400,
        );
        const csrf = await fetch(`${base}/auth/forgot-password`, {
          method: 'POST',
          headers: { ...headers, Origin: 'https://bad.example' },
          body: JSON.stringify({ email }),
        });
        assert.equal(csrf.status, 403);
        resetToken = await deliveredToken(email, 'Đặt lại');
      },
    );
    await t.test(
      'expired links fail and global password change invalidates all tenant sessions and pending tokens',
      async () => {
        const b = await db.restaurant.create({
          data: {
            name: 'Second Security Tenant',
            slug: `security-b-${suffix}`,
            memberships: { create: { userId, role: 'OWNER' } },
          },
        });
        const second = await post('/auth/login', { email, password, restaurantId: b.id });
        assert.equal(second.status, 200);
        const secondCookie = cookies(second);
        assert.equal(
          (
            await post(
              '/auth/change-password',
              { currentPassword: 'wrong', password: 'Changed!LongEnough-123' },
              ownerCookie,
            )
          ).status,
          401,
        );
        const expired = await db.accountToken.findFirstOrThrow({
          where: { userId, kind: 'RESET_PASSWORD', consumedAt: null },
        });
        await db.accountToken.update({
          where: { id: expired.id },
          data: {
            createdAt: new Date(Date.now() - 120000),
            expiresAt: new Date(Date.now() - 60000),
          },
        });
        assert.equal(
          (
            await post('/auth/reset-password', {
              token: resetToken,
              password: 'Changed!LongEnough-123',
            })
          ).status,
          400,
        );
        const changed = await post(
          '/auth/change-password',
          { currentPassword: password, password: 'Changed!LongEnough-123' },
          ownerCookie,
        );
        assert.equal(changed.status, 200);
        assert.equal((await get('/auth/me', ownerCookie)).status, 401);
        assert.equal((await get('/auth/me', secondCookie)).status, 401);
        assert.equal((await post('/auth/refresh', {}, secondCookie)).status, 401);
        assert.equal(
          (await post('/auth/reset-password', { token: resetToken, password })).status,
          400,
        );
        assert.equal(await db.authSession.count({ where: { userId, revokedAt: null } }), 0);
      },
    );
    await t.test(
      'reset token is consumed atomically; races cannot replace password twice',
      async () => {
        await db.accountToken.updateMany({
          where: { userId, kind: 'RESET_PASSWORD' },
          data: { createdAt: new Date(Date.now() - 120000) },
        });
        await accounts.request(email, 'RESET_PASSWORD');
        const token = await deliveredToken(email, 'Đặt lại');
        const responses = await Promise.all([
          post('/auth/reset-password', { token, password: 'Final!Password-123456' }),
          post('/auth/reset-password', { token, password: 'Other!Password-123456' }),
        ]);
        assert.deepEqual(responses.map((row) => row.status).sort(), [200, 400]);
        assert.equal((await post('/auth/reset-password', { token, password })).status, 400);
        assert.equal(
          await db.securityEvent.count({ where: { userId, action: 'account.password_reset' } }),
          1,
        );
      },
    );
    await t.test(
      'password-only admin gets limited challenge; setup QR has no platform permissions',
      async () => {
        const response = await post('/platform/auth/login', { email: admin.email, password });
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), { mfaRequired: true, setupRequired: true });
        const challengeCookie = cookies(response);
        assert.equal((await get('/platform/overview', challengeCookie)).status, 401);
        const setup = (await (
          await get('/platform/auth/mfa/setup', challengeCookie)
        ).json()) as { secret: string; qr: string };
        assert.match(setup.secret, /^[A-Z2-7]{32}$/);
        assert.ok(setup.qr.startsWith('data:image/png;base64,'));
        const code = totp(setup.secret, BigInt(Math.floor(Date.now() / 30000)));
        const results = await Promise.all([
          post('/platform/auth/mfa/verify', { code }, challengeCookie),
          post('/platform/auth/mfa/verify', { code }, challengeCookie),
        ]);
        assert.deepEqual(results.map((row) => row.status).sort(), [200, 401]);
        const success = results.find((row) => row.status === 200)!;
        platformCookie = cookies(success);
        platformPrincipalSchema.parse(await success.json());
        assert.equal((await get('/platform/overview', platformCookie)).status, 200);
        const stored = await db.user.findUniqueOrThrow({ where: { id: admin.id } });
        assert.notEqual(stored.mfaSecret, setup.secret);
        assert.equal(
          await db.securityEvent.count({
            where: { userId: admin.id, action: 'platform.mfa_enabled' },
          }),
          1,
        );
        const next = await platform.login({ email: admin.email, password });
        assert.equal(next.setupRequired, false);
        await assert.rejects(platform.finishMfa(next.challengeToken, code));
      },
    );
    await t.test(
      'five invalid MFA attempts persist and lock challenge; expiry and role changes deny access',
      async () => {
        const login = await platform.login({ email: admin.email, password });
        for (let index = 0; index < 5; index++)
          await assert.rejects(platform.finishMfa(login.challengeToken, 'xxxxxx'));
        const challenge = await db.mfaChallenge.findUniqueOrThrow({
          where: { tokenHash: tokenHash(login.challengeToken) },
        });
        assert.equal(challenge.attempts, 5);
        await assert.rejects(platform.setup(login.challengeToken));
        const expired = await platform.login({ email: admin.email, password });
        await db.mfaChallenge.updateMany({
          where: { userId: admin.id, consumedAt: null },
          data: { expiresAt: new Date(Date.now() - 1000) },
        });
        await assert.rejects(platform.finishMfa(expired.challengeToken, '000000'));
        await db.user.update({ where: { id: admin.id }, data: { isPlatformAdmin: false } });
        assert.equal((await get('/platform/overview', platformCookie)).status, 401);
        await db.user.update({ where: { id: admin.id }, data: { isPlatformAdmin: true } });
      },
    );
    await t.test(
      'admin password change revokes platform session and challenges while retaining MFA',
      async () => {
        const changed = await post(
          '/platform/change-password',
          { currentPassword: password, password: 'Admin!NewPassword-123' },
          platformCookie,
        );
        assert.equal(changed.status, 200);
        assert.equal((await get('/platform/overview', platformCookie)).status, 401);
        assert.ok((await db.user.findUniqueOrThrow({ where: { id: admin.id } })).mfaSecret);
        assert.equal(
          await db.platformSession.count({ where: { userId: admin.id, revokedAt: null } }),
          0,
        );
        assert.equal(
          await db.mfaChallenge.count({ where: { userId: admin.id, consumedAt: null } }),
          0,
        );
        const event = await db.securityEvent.findFirstOrThrow({
          where: { userId: admin.id, action: 'account.password_changed' },
        });
        assert.deepEqual(
          Object.keys(event).sort(),
          ['action', 'createdAt', 'id', 'userId'].sort(),
        );
      },
    );
    await t.test(
      'operator MFA recovery requires current admin password and records its reason',
      async () => {
        await assert.rejects(
          accounts.recoverMfa(admin.email, 'wrong', 'Lost private test authenticator'),
        );
        assert.ok((await db.user.findUniqueOrThrow({ where: { id: admin.id } })).mfaSecret);
        const prior = await platform.login({
          email: admin.email,
          password: 'Admin!NewPassword-123',
        });
        await accounts.recoverMfa(
          admin.email,
          'Admin!NewPassword-123',
          'Lost private test authenticator',
        );
        assert.equal(
          (await db.user.findUniqueOrThrow({ where: { id: admin.id } })).mfaSecret,
          null,
        );
        await assert.rejects(platform.setup(prior.challengeToken));
        assert.equal(
          (await platform.login({ email: admin.email, password: 'Admin!NewPassword-123' }))
            .setupRequired,
          true,
        );
        assert.equal(
          (
            await db.platformAudit.findFirstOrThrow({
              where: { actorUserId: admin.id, action: 'platform.mfa_recovered' },
            })
          ).reason,
          'Lost private test authenticator',
        );
      },
    );
    await t.test(
      'Resend retries use the same idempotency key and clear delivered private payloads',
      async () => {
        const job = await db.emailOutbox.create({
          data: {
            userId: admin.id,
            expiresAt: new Date(Date.now() + 60000),
            payload: seal(
              JSON.stringify({
                to: admin.email,
                subject: 'Private Resend test',
                text: 'Private fixture message',
              }),
              config.ACCOUNT_SECURITY_KEY,
              `email:${admin.id}`,
            ),
          },
        });
        const originalFetch = globalThis.fetch,
          ids: string[] = [];
        globalThis.fetch = async (input, init) => {
          assert.equal(input, 'https://api.resend.com/emails');
          const headers = new Headers(init?.headers);
          assert.equal(headers.get('Authorization'), 'Bearer re_private_test_key');
          ids.push(headers.get('Idempotency-Key')!);
          assert.deepEqual(JSON.parse(init?.body as string), {
            from: 'no-reply@example.com',
            to: [admin.email],
            subject: 'Private Resend test',
            text: 'Private fixture message',
          });
          return new Response('{}', { status: ids.length === 1 ? 503 : 200 });
        };
        try {
          const resend = new EmailService(db, {
            ...config,
            EMAIL_PROVIDER: 'resend',
            RESEND_API_KEY: 're_private_test_key',
            EMAIL_FROM: 'no-reply@example.com',
          });
          await resend.flush();
          const deferred = await db.emailOutbox.findUniqueOrThrow({ where: { id: job.id } });
          assert.equal(deferred.sentAt, null);
          assert.equal(deferred.attempts, 1);
          assert.ok(deferred.payload);
          await db.emailOutbox.update({
            where: { id: job.id },
            data: { nextAttemptAt: new Date(Date.now() - 1000) },
          });
          await resend.flush();
          assert.deepEqual(ids, [job.id, job.id]);
          const sent = await db.emailOutbox.findUniqueOrThrow({ where: { id: job.id } });
          assert.ok(sent.sentAt);
          assert.equal(sent.payload, '');
        } finally {
          globalThis.fetch = originalFetch;
        }
      },
    );
    await t.test('email requests are IP-limited even when attacker varies email', async () => {
      const responses = [];
      for (let i = 0; i < 4; i++)
        responses.push(
          (await post('/auth/forgot-password', { email: `vary-${i}.${suffix}@dineflow.test` }))
            .status,
        );
      assert.deepEqual(responses, [201, 201, 429, 429]);
    });
  } finally {
    await db.platformSettings.update({
      where: { id: 'global' },
      data: { registrationsEnabled: settings.registrationsEnabled },
    });
    const ids = (
        await db.restaurant.findMany({
          where: { slug: { startsWith: 'security-', endsWith: suffix } },
          select: { id: true },
        })
      ).map((row) => row.id),
      users = [userId, admin.id].filter(Boolean);
    await db.activityLog.deleteMany({ where: { restaurantId: { in: ids } } });
    await db.platformAudit.deleteMany({ where: { actorUserId: { in: users } } });
    await db.securityEvent.deleteMany({ where: { userId: { in: users } } });
    await db.refreshToken.deleteMany({ where: { authSession: { userId: { in: users } } } });
    await db.authSession.deleteMany({ where: { userId: { in: users } } });
    await db.platformSession.deleteMany({ where: { userId: { in: users } } });
    await db.staffMembership.deleteMany({ where: { restaurantId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: users } } });
    await db.restaurant.deleteMany({ where: { id: { in: ids } } });
    await app.close();
  }
});
