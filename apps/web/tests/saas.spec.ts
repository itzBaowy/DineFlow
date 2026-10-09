import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import { randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import type { PrismaClient } from '../../api/src/generated/prisma/client';
import { mailToken, privateAdmin, platformSignIn } from './security-helpers';

const apiRequire = createRequire(resolve(__dirname, '../../api/package.json'));
const { PrismaService } = apiRequire('./dist/src/database/prisma.service.js') as {
  PrismaService: new (config: { DATABASE_URL: string }) => PrismaClient;
};
const qaDir = resolve(__dirname, '../../../.local/qa');
mkdirSync(qaDir, { recursive: true });

test('free owner signup creates empty tenant; platform console lists, suspends and resumes it on desktop/mobile', async ({
  page,
  context,
}) => {
  test.setTimeout(90000);
  const db = new PrismaService({ DATABASE_URL: process.env.DATABASE_URL! }),
    suffix = randomUUID(),
    slug = `e2e-saas-${suffix}`,
    email = `${slug}@dineflow.test`,
    password = `Test!${randomBytes(20).toString('base64url')}`,
    name = `Quán SaaS ${suffix.slice(0, 8)}`;
  let restaurantId = '';
  const admin = await privateAdmin(db);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.goto('/register');
    await expect(
      page.getByRole('button', { name: 'Tạo nhà hàng miễn phí', exact: true }),
    ).toBeVisible();
    await page.screenshot({ path: resolve(qaDir, 'signup-desktop.png'), fullPage: true });
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      ).toBeTruthy();
    }
    await page.screenshot({ path: resolve(qaDir, 'signup-mobile.png'), fullPage: true });
    await page.getByLabel('Tên chủ nhà hàng', { exact: true }).fill('Chủ quán SaaS');
    await page.getByLabel('Email đăng nhập', { exact: true }).fill(email);
    await page.getByLabel('Mật khẩu', { exact: true }).fill('short');
    await page.getByLabel('Tên nhà hàng', { exact: true }).fill(name);
    await page.getByLabel('Mã nhà hàng', { exact: true }).fill(slug);
    await page.getByRole('button', { name: 'Tạo nhà hàng miễn phí', exact: true }).click();
    await expect(
      page.getByRole('alert').filter({ hasText: 'Mật khẩu tối thiểu 12 ký tự' }),
    ).toBeVisible();
    await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Tạo nhà hàng miễn phí', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Nhà hàng của bạn đã sẵn sàng.' }),
    ).toBeVisible();
    const tenant = await db.restaurant.findUniqueOrThrow({ where: { slug } });
    restaurantId = tenant.id;
    expect(await db.menuItem.count({ where: { restaurantId } })).toBe(0);
    expect(await db.diningTable.count({ where: { restaurantId } })).toBe(0);
    const token = await mailToken(email, 'Xác minh');
    await page.goto(`/verify-email#token=${token}`);
    await page.getByRole('button', { name: 'Xác nhận email', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Email đã được xác minh');
    await page.getByRole('link', { name: 'Đăng nhập nhà hàng', exact: true }).click();
    await page.getByLabel('Email nhân viên').fill(email);
    await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    await expect(page).toHaveURL(/staff\/dashboard$/);
    const me = await context.request.get('/api/v1/auth/me');
    expect(me.ok()).toBeTruthy();
    expect((await me.json()).restaurantId).toBe(restaurantId);
    expect((await context.request.get('/api/v1/platform/overview')).status()).toBe(401);
    await platformSignIn(page, admin.user.email, admin.password);
    await expect(
      page.getByRole('heading', { name: 'Một nền tảng, nhiều nhịp quán.' }),
    ).toBeVisible();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByLabel('Tìm tên hoặc mã nhà hàng').fill(slug);
    await page.getByRole('button', { name: 'Lọc nhà hàng', exact: true }).click();
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
    await page.screenshot({ path: resolve(qaDir, 'platform-desktop.png'), fullPage: true });
    await page.getByRole('button', { name: `Tạm ngừng ${name}`, exact: true }).click();
    await page.getByLabel('Lý do quản trị').fill('Tạm ngừng kiểm thử SaaS');
    await page.getByRole('button', { name: 'Xác nhận thay đổi', exact: true }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(
      page.getByRole('button', { name: `Mở lại ${name}`, exact: true }),
    ).toBeVisible();
    expect((await context.request.get('/api/v1/auth/me')).status()).toBe(401);
    await page.getByRole('button', { name: `Mở lại ${name}`, exact: true }).click();
    await page.getByLabel('Lý do quản trị').fill('Mở lại kiểm thử SaaS');
    await page.getByRole('button', { name: 'Xác nhận thay đổi', exact: true }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(
      page.getByRole('button', { name: `Tạm ngừng ${name}`, exact: true }),
    ).toBeVisible();
    expect((await context.request.get('/api/v1/auth/me')).status()).toBe(401);
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      ).toBeTruthy();
    }
    await page.screenshot({ path: resolve(qaDir, 'platform-mobile.png'), fullPage: true });
    await expect(page.getByText('tenant.suspended', { exact: true }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Đăng xuất quản trị' }).click();
    await expect(page).toHaveURL(/platform\/login$/);
    expect((await context.request.get('/api/v1/platform/overview')).status()).toBe(401);
    expect(errors).toEqual([]);
  } finally {
    // Only the uniquely named signup fixture is removed; never seeded tenants.
    const tenant = await db.restaurant.findUnique({ where: { slug } });
    if (tenant) {
      if (!slug.startsWith('e2e-saas-') || (restaurantId && tenant.id !== restaurantId))
        throw new Error('Unsafe SaaS cleanup scope');
      const users = (
        await db.staffMembership.findMany({
          where: { restaurantId: tenant.id },
          select: { userId: true },
        })
      ).map((member) => member.userId);
      await db.platformAudit.deleteMany({ where: { targetId: tenant.id } });
      await db.activityLog.deleteMany({ where: { restaurantId: tenant.id } });
      await db.refreshToken.deleteMany({ where: { authSession: { userId: { in: users } } } });
      await db.authSession.deleteMany({ where: { userId: { in: users } } });
      await db.staffMembership.deleteMany({ where: { restaurantId: tenant.id } });
      await db.securityEvent.deleteMany({ where: { userId: { in: users } } });
      await db.user.deleteMany({ where: { id: { in: users } } });
      await db.restaurant.delete({ where: { id: tenant.id } });
    }
    await context.request
      .post('/api/v1/platform/auth/logout', {
        headers: { 'X-DineFlow-Client': 'web', Origin: 'http://localhost:3000' },
        data: {},
      })
      .catch(() => null);
    await admin.cleanup();
    await db.$disconnect();
  }
});
