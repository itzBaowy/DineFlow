import { test } from 'node:test';
import assert from 'node:assert/strict';
import { envSchema } from '../src/config/env';
import { hashPassword, verifyPassword } from '../src/auth/password';
import { ZodPipe } from '../src/common/zod.pipe';
import { loginSchema } from '@dineflow/shared';
import { seal, unseal, totp, totpCounter } from '../src/security/crypto';

test('password hash uses random salt and verifies without plaintext storage', async () => {
  const first = await hashPassword('My-Test-Password-123');
  const second = await hashPassword('My-Test-Password-123');
  assert.notEqual(first, second);
  assert.equal(await verifyPassword('My-Test-Password-123', first), true);
  assert.equal(await verifyPassword('wrong', first), false);
  assert.equal(await verifyPassword('anything', 'malformed'), false);
});
test('env validation fails closed for weak secrets and insecure production', () => {
  const base = {
    APP_ORIGIN: 'http://localhost:3000',
    DATABASE_URL: 'postgresql://user:pass@localhost/db',
    JWT_ACCESS_SECRET: 'x'.repeat(48),
    COOKIE_SECURE: 'false',
    ACCOUNT_SECURITY_KEY: 'a'.repeat(64),
    SMTP_USER: 'user',
    SMTP_PASSWORD: 'password',
    EMAIL_FROM: 'test@example.com',
  };
  assert.equal(envSchema.safeParse(base).success, true);
  assert.equal(envSchema.safeParse({ ...base, JWT_ACCESS_SECRET: 'short' }).success, false);
  assert.equal(envSchema.safeParse({ ...base, NODE_ENV: 'production' }).success, false);
  assert.equal(
    envSchema.safeParse({
      ...base,
      NODE_ENV: 'production',
      APP_ORIGIN: 'https://dineflow.example',
      COOKIE_SECURE: 'true',
    }).success,
    true,
  );
  assert.equal(
    envSchema.safeParse({ ...base, APP_ORIGIN: 'http://localhost:3000/path' }).success,
    false,
  );
});
test('TOTP matches RFC 6238 vectors and rejects replay', () => {
  const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
  assert.equal(totp(secret, 1n, 8), '94287082');
  assert.equal(totp(secret, 37037036n, 8), '07081804');
  const code = totp(secret, 1n);
  assert.equal(totpCounter(secret, code, null, 59000), 1n);
  assert.equal(totpCounter(secret, code, 1n, 59000), null);
});
test('encrypted payloads authenticate key and context', () => {
  const key = 'a'.repeat(64),
    encrypted = seal('private-link', key, 'mfa:user');
  assert.equal(unseal(encrypted, key, 'mfa:user'), 'private-link');
  assert.throws(() => unseal(encrypted, key, 'email:user'));
  assert.throws(() => unseal(encrypted, 'b'.repeat(64), 'mfa:user'));
});
test('API validation rejects client role overrides', () => {
  const pipe = new ZodPipe(loginSchema);
  assert.throws(() =>
    pipe.transform({ email: 'owner@dineflow.local', password: 'test', role: 'OWNER' }),
  );
});
