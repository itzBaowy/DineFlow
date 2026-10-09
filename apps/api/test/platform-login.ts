import { setTimeout } from 'node:timers/promises';
import { totp, unseal } from '../src/security/crypto';
import type { PrismaService } from '../src/database/prisma.service';
import type { AppConfig } from '../src/config/env';

export async function platformLogin(
  base: string,
  db: PrismaService,
  config: AppConfig,
  email: string,
  password: string,
) {
  if (!email.endsWith('@dineflow.test'))
    throw new Error('Only private test admins are supported');
  const headers = {
    'Content-Type': 'application/json',
    'X-DineFlow-Client': 'web',
    Origin: config.APP_ORIGIN,
  };
  const login = await fetch(`${base}/platform/auth/login`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ email, password }),
  });
  if (!login.ok) return login;
  const result = (await login.json()) as { setupRequired: boolean };
  const cookie = login.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
  const user = await db.user.findUniqueOrThrow({ where: { email } });
  const secret = result.setupRequired
    ? (
        (await (
          await fetch(`${base}/platform/auth/mfa/setup`, { headers: { Cookie: cookie } })
        ).json()) as { secret: string }
      ).secret
    : unseal(user.mfaSecret!, config.ACCOUNT_SECURITY_KEY, `mfa:${user.id}`);
  let counter = BigInt(Math.floor(Date.now() / 30000));
  if (user.mfaLastCounter !== null && counter <= user.mfaLastCounter)
    counter = user.mfaLastCounter + 1n;
  while (counter > BigInt(Math.floor(Date.now() / 30000)) + 1n) await setTimeout(250);
  return fetch(`${base}/platform/auth/mfa/verify`, {
    method: 'POST',
    headers: { ...headers, Cookie: cookie },
    body: JSON.stringify({ code: totp(secret, counter) }),
  });
}
