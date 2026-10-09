import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { orderingFixture } from './ordering-fixture';
import { mailToken, privateAdmin, platformSignIn } from './security-helpers';

const apiRequire = createRequire(resolve(__dirname, '../../api/package.json'));
const { PrismaService } = apiRequire('./dist/src/database/prisma.service.js') as {
  PrismaService: new (config: {
    DATABASE_URL: string;
  }) => import('../../api/src/generated/prisma/client').PrismaClient;
};
const qaDir = resolve(__dirname, '../../../.local/qa');
mkdirSync(qaDir, { recursive: true });

test('account security changes password and recovery consumes an actual email link once', async ({
  page,
  context,
}) => {
  test.setTimeout(90000);
  const fixture = await orderingFixture(),
    password = 'Changed!Private-password-123',
    resetPassword = 'Recovered!Private-password-123';
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.goto('/staff/login');
    await page.getByLabel('Email nhân viên').fill(fixture.owner.email);
    await page.getByLabel('Mật khẩu', { exact: true }).fill(fixture.password);
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    await expect(page).toHaveURL(/staff\/dashboard$/);
    await page.goto('/staff/security');
    await expect(
      page.getByRole('heading', { name: 'An tâm trong mỗi phiên làm việc.' }),
    ).toBeVisible();
    await expect(page.getByText(fixture.owner.email, { exact: true })).toBeVisible();
    await page.screenshot({ path: resolve(qaDir, 'security-desktop.png'), fullPage: true });
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      ).toBeTruthy();
    }
    await page.screenshot({ path: resolve(qaDir, 'security-mobile.png'), fullPage: true });
    await page.getByLabel('Mật khẩu hiện tại', { exact: true }).fill(fixture.password);
    await page.getByLabel('Mật khẩu mới', { exact: true }).fill(password);
    await page.getByLabel('Nhập lại mật khẩu mới', { exact: true }).fill('mismatch');
    await page.getByRole('button', { name: 'Đổi mật khẩu', exact: true }).click();
    await expect(
      page.getByRole('alert').filter({ hasText: 'Mật khẩu nhập lại không khớp' }),
    ).toBeVisible();
    await page.getByLabel('Nhập lại mật khẩu mới', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Đổi mật khẩu', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Đã đổi mật khẩu', exact: true }),
    ).toBeVisible();
    expect((await context.request.get('/api/v1/auth/me')).status()).toBe(401);
    await page.getByRole('button', { name: 'Đăng nhập lại', exact: true }).click();
    await expect(page).toHaveURL(/staff\/login$/);
    await page.getByLabel('Email nhân viên').fill(fixture.owner.email);
    await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    await expect(page).toHaveURL(/staff\/dashboard$/);
    await page.goto('/forgot-password');
    await page.getByLabel('Email đăng nhập', { exact: true }).fill(fixture.owner.email);
    await page
      .getByRole('button', { name: 'Gửi liên kết đặt lại mật khẩu', exact: true })
      .click();
    await expect(page.getByRole('status')).toContainText('Nếu tài khoản phù hợp');
    const token = await mailToken(fixture.owner.email, 'Đặt lại');
    await page.goto(`/reset-password#token=${token}`);
    await expect(page).toHaveURL(/reset-password$/);
    await page.getByLabel('Mật khẩu mới', { exact: true }).fill(resetPassword);
    await page.getByLabel('Nhập lại mật khẩu mới', { exact: true }).fill(resetPassword);
    await page.getByRole('button', { name: 'Đặt lại mật khẩu', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Đã đặt lại mật khẩu');
    expect((await context.request.get('/api/v1/auth/me')).status()).toBe(401);
    await page.goto(`/reset-password#token=${token}`);
    await page.getByLabel('Mật khẩu mới', { exact: true }).fill(password);
    await page.getByLabel('Nhập lại mật khẩu mới', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Đặt lại mật khẩu', exact: true }).click();
    await expect(
      page.getByRole('alert').filter({ hasText: 'Liên kết không hợp lệ' }),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Đăng nhập nhà hàng', exact: true }).click();
    await page.getByLabel('Email nhân viên').fill(fixture.owner.email);
    await page.getByLabel('Mật khẩu', { exact: true }).fill(resetPassword);
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    await expect(page).toHaveURL(/staff\/dashboard$/);
    expect(errors).toEqual([]);
  } finally {
    await fixture.cleanup();
  }
});

test('private platform admin enrolls MFA before console access and password change revokes the session', async ({
  page,
  context,
}) => {
  test.setTimeout(90000);
  const db = new PrismaService({ DATABASE_URL: process.env.DATABASE_URL! }),
    admin = await privateAdmin(db);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await platformSignIn(page, admin.user.email, admin.password);
    await page.goto('/platform/security');
    await expect(
      page.getByRole('heading', { name: 'An tâm trong mỗi phiên làm việc.' }),
    ).toBeVisible();
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      ).toBeTruthy();
    }
    await page.getByLabel('Mật khẩu hiện tại', { exact: true }).fill(admin.password);
    await page
      .getByLabel('Mật khẩu mới', { exact: true })
      .fill('New!Private-admin-password-123');
    await page
      .getByLabel('Nhập lại mật khẩu mới', { exact: true })
      .fill('New!Private-admin-password-123');
    await page.getByRole('button', { name: 'Đổi mật khẩu', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Đã đổi mật khẩu', exact: true }),
    ).toBeVisible();
    expect((await context.request.get('/api/v1/platform/overview')).status()).toBe(401);
    await page.getByRole('button', { name: 'Đăng nhập lại', exact: true }).click();
    await expect(page).toHaveURL(/platform\/login$/);
    await page.getByLabel('Email quản trị').fill(admin.user.email);
    await page.getByLabel('Mật khẩu quản trị').fill('New!Private-admin-password-123');
    await page.getByRole('button', { name: 'Vào quản trị nền tảng', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Xác thực hai bước', exact: true }),
    ).toBeVisible();
    await expect(page.locator('[data-mfa-secret]')).toHaveCount(0);
    expect((await context.request.get('/api/v1/platform/overview')).status()).toBe(401);
    await page.getByLabel('Mã xác thực').fill('abc');
    await page.getByRole('button', { name: 'Xác nhận mã', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Nhập mã 6 chữ số' })).toBeVisible();
    await page.screenshot({ path: resolve(qaDir, 'platform-mfa-mobile.png'), fullPage: true });
    expect(errors).toEqual([]);
  } finally {
    await admin.cleanup();
    await db.$disconnect();
  }
});
