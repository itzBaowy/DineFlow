import { expect, type Page } from '@playwright/test';
import { createRequire } from 'node:module';
import { randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import type { PrismaClient } from '../../api/src/generated/prisma/client';

const apiRequire = createRequire(resolve(__dirname, '../../api/package.json'));
const { hashPassword } = apiRequire('./dist/src/auth/password.js') as {
  hashPassword: (password: string) => Promise<string>;
};
const { totp } = apiRequire('./dist/src/security/crypto.js') as {
  totp: (secret: string, counter: bigint) => string;
};
export async function privateAdmin(db: PrismaClient) {
  const password = `Test!${randomBytes(20).toString('base64url')}`;
  const user = await db.user.create({
    data: {
      email: `e2e-security-admin-${randomUUID()}@dineflow.test`,
      name: 'Private E2E platform admin',
      passwordHash: await hashPassword(password),
      isPlatformAdmin: true,
    },
  });
  return {
    user,
    password,
    async cleanup() {
      if (
        !user.email.startsWith('e2e-security-admin-') ||
        !user.email.endsWith('@dineflow.test')
      )
        throw new Error('Unsafe admin fixture cleanup');
      await db.platformAudit.deleteMany({ where: { actorUserId: user.id } });
      await db.securityEvent.deleteMany({ where: { userId: user.id } });
      await db.platformSession.deleteMany({ where: { userId: user.id } });
      await db.user.delete({ where: { id: user.id } });
    },
  };
}
export async function mailToken(email: string, subject: string) {
  let token = '';
  await expect
    .poll(
      async () => {
        const search = (await (
          await fetch(
            `http://localhost:8025/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`,
          )
        ).json()) as { messages: { ID: string; Subject: string }[] };
        const item = search.messages.find((row) => row.Subject.includes(subject));
        if (!item) return false;
        const mail = (await (
          await fetch(`http://localhost:8025/api/v1/message/${item.ID}`)
        ).json()) as { Text: string };
        token = mail.Text.match(/#token=([A-Za-z0-9_-]{43})/)?.[1] ?? '';
        return token.length === 43;
      },
      { timeout: 20000, message: 'Expected private fixture email delivered to Mailpit' },
    )
    .toBeTruthy();
  return token;
}
export async function platformSignIn(page: Page, email: string, password: string) {
  await page.goto('/platform/login');
  await page.getByLabel('Email quản trị').fill(email);
  await page.getByLabel('Mật khẩu quản trị').fill(password);
  await page.getByRole('button', { name: 'Vào quản trị nền tảng' }).click();
  await expect(
    page.getByRole('heading', { name: 'Thiết lập xác thực hai bước', exact: true }),
  ).toBeVisible();
  expect((await page.request.get('/api/v1/platform/overview')).status()).toBe(401);
  const secret = (await page.locator('[data-mfa-secret]').textContent())!.trim();
  await page
    .getByLabel('Mã xác thực')
    .fill(totp(secret, BigInt(Math.floor(Date.now() / 30000))));
  await page.getByRole('button', { name: 'Xác nhận mã', exact: true }).click();
  await expect(page).toHaveURL(/\/platform$/);
}
