import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { orderingFixture } from './ordering-fixture';

test('owner creates and switches restaurants; cache, drafts, other tabs and login choices stay isolated', async ({
  page,
  context,
}) => {
  test.setTimeout(120000);
  const fixture = await orderingFixture(),
    slug = `e2e-tenancy-${randomUUID()}`,
    name = 'Không gian E2E thứ hai';
  const qaDir = resolve(__dirname, '../../../.local/qa');
  mkdirSync(qaDir, { recursive: true });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  let secondId = '';
  const mutationHeaders = { 'Content-Type': 'application/json', 'X-DineFlow-Client': 'web' };
  try {
    await page.goto('/staff/login');
    await page.getByLabel('Email nhân viên').fill(fixture.owner.email);
    await page.getByLabel('Mật khẩu', { exact: true }).fill(fixture.password);
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    await expect(page).toHaveURL('/staff/dashboard');
    const oldCookies = (await context.cookies())
      .filter((cookie) => ['df_access', 'df_refresh'].includes(cookie.name))
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .join('; ');
    await page.goto('/staff/restaurants');
    await expect(
      page.getByRole('heading', { name: 'Mỗi nhà hàng, một không gian riêng.' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Tạo thêm nhà hàng', exact: true }).click();
    const editor = page.getByRole('dialog');
    await editor.getByLabel('Tên nhà hàng', { exact: true }).fill(name);
    await editor.getByLabel('Mã nhà hàng', { exact: true }).fill(slug);
    await editor.getByLabel('Múi giờ', { exact: true }).selectOption('Asia/Bangkok');
    await editor.getByRole('button', { name: 'Tạo nhà hàng', exact: true }).click();
    await expect(editor).not.toBeVisible();
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
    const second = await fixture.db.restaurant.findUniqueOrThrow({ where: { slug } });
    secondId = second.id;
    expect(
      await fixture.db.staffMembership.count({ where: { userId: fixture.owner.id } }),
    ).toBe(2);
    expect(await fixture.db.menuItem.count({ where: { restaurantId: secondId } })).toBe(0);
    expect(await fixture.db.diningTable.count({ where: { restaurantId: secondId } })).toBe(0);
    await page.screenshot({ path: resolve(qaDir, 'restaurants-desktop.png'), fullPage: true });
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      ).toBeTruthy();
    }
    await page.screenshot({ path: resolve(qaDir, 'restaurants-mobile.png'), fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    const otherTab = await context.newPage();
    await otherTab.goto('/admin/menu');
    await expect(otherTab.locator('[data-workspace-header]')).toContainText('Bếp Nhà E2E');
    for (const tab of [page, otherTab])
      await tab.evaluate((userId) => {
        sessionStorage.setItem(
          `dineflow:cart:staff:${userId}:draft-test`,
          JSON.stringify({ items: [] }),
        );
        sessionStorage.setItem('dineflow:cart:guest:keep-test', 'keep');
      }, fixture.owner.id);
    await page
      .locator(`[data-restaurant-card="${secondId}"]`)
      .getByRole('button', { name: 'Chuyển nhà hàng', exact: true })
      .click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Xác nhận chuyển', exact: true })
      .click();
    await expect(page).toHaveURL('/staff/dashboard');
    await expect(page.locator('[data-workspace-header]')).toContainText(name);
    await expect(otherTab).toHaveURL('/staff/dashboard');
    await expect(otherTab.locator('[data-workspace-header]')).toContainText(name);
    for (const tab of [page, otherTab]) {
      expect(
        await tab.evaluate(
          (userId) => sessionStorage.getItem(`dineflow:cart:staff:${userId}:draft-test`),
          fixture.owner.id,
        ),
      ).toBeNull();
      expect(
        await tab.evaluate(() => sessionStorage.getItem('dineflow:cart:guest:keep-test')),
      ).toBe('keep');
    }
    expect(
      (
        await context.request.get('/api/v1/auth/me', { headers: { Cookie: oldCookies } })
      ).status(),
    ).toBe(401);
    expect(
      (
        await context.request.get('/api/v1/restaurant/overview', {
          headers: { 'X-DineFlow-Restaurant': fixture.restaurantId },
        })
      ).status(),
    ).toBe(409);
    expect(await (await context.request.get('/api/v1/menu/categories')).json()).toEqual([]);
    const foreignItem = await context.request.delete(`/api/v1/menu/items/${fixture.item.id}`, {
      headers: mutationHeaders,
      data: {},
    });
    expect(foreignItem.status()).toBe(404);
    await page.goto('/staff/restaurants');
    await page
      .locator(`[data-restaurant-card="${fixture.restaurantId}"]`)
      .getByRole('button', { name: 'Chuyển nhà hàng', exact: true })
      .click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Xác nhận chuyển', exact: true })
      .click();
    await expect(page.locator('[data-workspace-header]')).toContainText('Bếp Nhà E2E');
    const oldMenu = await context.request.get('/api/v1/menu/items');
    expect(
      ((await oldMenu.json()) as { id: string }[]).some((row) => row.id === fixture.item.id),
    ).toBe(true);
    // The API permits choosing only after a fresh password check; no access cookie is created at step one.
    await page.getByRole('button', { name: 'Đăng xuất', exact: true }).click();
    await expect(page).toHaveURL('/staff/login');
    await otherTab.close();
    await page.getByLabel('Email nhân viên').fill(fixture.owner.email);
    await page.getByLabel('Mật khẩu', { exact: true }).fill(fixture.password);
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Chọn nhà hàng', exact: true }),
    ).toBeVisible();
    expect((await context.cookies()).some((cookie) => cookie.name === 'df_access')).toBe(false);
    await page.getByRole('button', { name: new RegExp(name) }).click();
    await expect(page).toHaveURL('/staff/dashboard');
    await expect(page.locator('[data-workspace-header]')).toContainText(name);
    expect(errors).toEqual([]);
  } finally {
    // Second tenant belongs to this exact fixture user and unique slug; remove it before the fixture's user cleanup.
    if (secondId) {
      const second = await fixture.db.restaurant.findUniqueOrThrow({ where: { id: secondId } });
      if (second.slug !== slug) throw Error('Unsafe multi-restaurant cleanup');
      await fixture.db.activityLog.deleteMany({ where: { restaurantId: secondId } });
      await fixture.db.refreshToken.deleteMany({
        where: { authSession: { membership: { restaurantId: secondId } } },
      });
      await fixture.db.authSession.deleteMany({
        where: { membership: { restaurantId: secondId } },
      });
      await fixture.db.staffMembership.deleteMany({
        where: { restaurantId: secondId, userId: fixture.owner.id },
      });
      await fixture.db.restaurant.delete({ where: { id: secondId } });
    }
    await fixture.cleanup();
  }
});
