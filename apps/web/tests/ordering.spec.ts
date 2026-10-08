import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { orderingFixture } from './ordering-fixture';

const qaDir = resolve(__dirname, '../../../.local/qa');
mkdirSync(qaDir, { recursive: true });
async function login(page: Page, email: string, password: string) {
  await page.goto('/staff/login');
  await page.getByLabel('Email nhân viên').fill(email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page).toHaveURL(/staff\/dashboard$/);
}
async function chooseTea(page: Page, quantity = 1) {
  await page.getByRole('button', { name: 'Chọn Trà sữa', exact: true }).click();
  await page.getByRole('radio', { name: /^L/ }).check();
  await page.getByRole('checkbox', { name: /^Trân châu/ }).check();
  await page.getByLabel('Ghi chú món', { exact: true }).fill('Ít đá');
  for (let i = 1; i < quantity; i++)
    await page.getByRole('button', { name: 'Tăng số lượng', exact: true }).click();
  await page.getByRole('button', { name: /^Thêm vào giỏ/ }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
}

test('mobile QR ordering, scoped guest history, persistent cart, price changes and safe retry after lost response', async ({
  page,
  browser,
}) => {
  test.setTimeout(120000);
  const fixture = await orderingFixture();
  const staffContext = await browser.newContext({ baseURL: 'http://localhost:3000' });
  const otherContext = await browser.newContext({
    baseURL: 'http://localhost:3000',
    viewport: { width: 390, height: 844 },
  });
  const staff = await staffContext.newPage(),
    otherGuest = await otherContext.newPage();
  const errors: string[] = [];
  for (const p of [page, staff, otherGuest])
    p.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/t/${fixture.table.publicCode}`);
    await expect(page.getByRole('heading', { name: 'Chào mừng bạn đến bàn' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Chọn Trà sữa', exact: true })).toBeDisabled();
    await login(staff, fixture.waiter.email, fixture.password);
    await staff.goto('/staff/tables');
    const card = staff
      .locator('article')
      .filter({ has: staff.getByRole('heading', { name: 'Bàn 01', exact: true }) });
    await card.getByRole('button', { name: 'Mở bàn', exact: true }).click();
    await expect(card.getByText('Đang phục vụ', { exact: true })).toBeVisible();
    await staff.screenshot({ path: resolve(qaDir, 'staff-sessions-desktop.png'), fullPage: true });
    await page.getByRole('button', { name: 'Kiểm tra lại bàn' }).click();
    await page.getByRole('button', { name: 'Bắt đầu gọi món', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Chọn Trà sữa', exact: true })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Chọn Nước cam', exact: true })).toBeDisabled();
    await page.getByLabel('Tìm món ăn').fill('Trà đào');
    await expect(page.getByRole('heading', { name: 'Trà sữa', exact: true })).toHaveCount(0);
    await page.getByLabel('Tìm món ăn').fill('');
    await page.screenshot({ path: resolve(qaDir, 'customer-menu-mobile.png'), fullPage: true });
    await page.getByRole('button', { name: 'Chọn Trà sữa', exact: true }).click();
    await page.getByRole('button', { name: /^Thêm vào giỏ/ }).click();
    await expect(page.getByRole('alert')).toContainText('Size');
    await expect(page.getByRole('checkbox', { name: /^Pudding/ })).toBeDisabled();
    await page.getByRole('radio', { name: /^L/ }).check();
    await page.getByRole('checkbox', { name: /^Trân châu/ }).check();
    await page.getByLabel('Ghi chú món', { exact: true }).fill('Ít đá');
    await page.getByRole('button', { name: 'Tăng số lượng', exact: true }).click();
    await page.screenshot({
      path: resolve(qaDir, 'customer-modifiers-mobile.png'),
      fullPage: true,
    });
    await page.getByRole('button', { name: /^Thêm vào giỏ/ }).click();
    await page.getByRole('link', { name: 'Xem giỏ hàng' }).click();
    await page.getByLabel('Ghi chú cho cả đơn').fill('Mang ra cùng nhau');
    await page.reload();
    await expect(page.getByLabel('Ghi chú cho cả đơn')).toHaveValue('Mang ra cùng nhau');
    await expect(page.getByRole('button', { name: /^Xác nhận đặt món/ })).toContainText('90.000');
    await page.screenshot({ path: resolve(qaDir, 'customer-cart-mobile.png'), fullPage: true });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBeTruthy();
    const keys: string[] = [];
    let loseResponse = true,
      throttleRetry = true;
    await page.route('**/api/v1/public/tables/*/orders', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.continue();
        return;
      }
      keys.push((route.request().postDataJSON() as { idempotencyKey: string }).idempotencyKey);
      if (loseResponse) {
        loseResponse = false;
        const accepted = await route.fetch();
        expect(accepted.status()).toBe(201);
        await route.abort('failed');
      } else if (throttleRetry) {
        throttleRetry = false;
        await route.fulfill({
          status: 429,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Quá nhiều yêu cầu. Vui lòng thử lại.' }),
        });
      } else await route.continue();
    });
    await page.getByRole('button', { name: /^Xác nhận đặt món/ }).click();
    await expect(page.getByRole('button', { name: 'Thử lại cùng đơn', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Tăng Trà sữa', exact: true })).toBeDisabled();
    expect(await fixture.db.order.count({ where: { restaurantId: fixture.restaurantId } })).toBe(1);
    await page.reload();
    await page.getByRole('button', { name: 'Thử lại cùng đơn', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Quá nhiều yêu cầu' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Tăng Trà sữa', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Thử lại cùng đơn', exact: true }).click();
    await expect(page).toHaveURL(/\/orders$/);
    expect(keys.length).toBe(3);
    expect(new Set(keys).size).toBe(1);
    await expect(page.getByText('Chờ xác nhận', { exact: true })).toBeVisible();
    await expect(page.getByText('Ít đá', { exact: false })).toBeVisible();
    expect(await fixture.db.order.count({ where: { restaurantId: fixture.restaurantId } })).toBe(1);
    const guestCookie = (await page.context().cookies()).find(
      (cookie) => cookie.name === 'df_guest',
    )!;
    expect(guestCookie.httpOnly).toBe(true);
    expect(guestCookie.sameSite).toBe('Lax');
    expect(guestCookie.path).toBe(`/api/v1/public/tables/${fixture.table.publicCode}`);
    await otherGuest.goto(`/t/${fixture.table.publicCode}/orders`);
    await otherGuest.getByRole('button', { name: 'Bắt đầu gọi món', exact: true }).click();
    await expect(otherGuest.getByText('Bạn chưa gửi đơn nào', { exact: false })).toBeVisible();
    await expect(otherGuest.getByText('Chờ xác nhận', { exact: true })).toHaveCount(0);
    await page.getByRole('link', { name: 'Gọi thêm món', exact: true }).click();
    await chooseTea(page);
    await page.getByRole('link', { name: 'Xem giỏ hàng' }).click();
    await fixture.db.menuItem.update({
      where: { id: fixture.item.id },
      data: { basePrice: 40000, name: 'Trà sữa mới' },
    });
    await page.getByRole('button', { name: /^Xác nhận đặt món/ }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Giá món đã thay đổi' })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Xác nhận đặt món/ })).toContainText('50.000');
    await page.getByRole('button', { name: /^Xác nhận đặt món/ }).click();
    await expect(page).toHaveURL(/\/orders$/);
    await expect(page.getByText('Chờ xác nhận', { exact: true })).toHaveCount(2);
    await expect(page.getByText('2 × Trà sữa', { exact: true })).toBeVisible();
    await expect(page.getByText('1 × Trà sữa mới', { exact: true })).toBeVisible();
    await page.screenshot({ path: resolve(qaDir, 'customer-orders-mobile.png'), fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole('link', { name: 'Gọi thêm món', exact: true }).click();
    await page.screenshot({ path: resolve(qaDir, 'customer-menu-desktop.png'), fullPage: true });
    const orders = await fixture.db.order.findMany({
      where: { restaurantId: fixture.restaurantId },
    });
    expect(new Set(orders.map((order) => order.diningSessionId)).size).toBe(1);
    expect(orders.map((order) => order.totalAmount).sort()).toEqual([50000, 90000]);
    await staff.getByRole('button', { name: 'Cập nhật bàn', exact: true }).click();
    await expect(card.getByText('2 đơn', { exact: true })).toBeVisible();
    await card.getByRole('button', { name: 'Xem đơn của phiên', exact: true }).click();
    await expect(staff.getByRole('dialog').getByText('Chờ xác nhận', { exact: true })).toHaveCount(
      2,
    );
    await staff.getByRole('button', { name: 'Đóng chỉnh sửa', exact: true }).click();
    await staff.setViewportSize({ width: 390, height: 844 });
    expect(
      await staff.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBeTruthy();
    await staff.screenshot({ path: resolve(qaDir, 'staff-sessions-mobile.png'), fullPage: true });
    expect(errors).toEqual([]);
  } finally {
    await staffContext.close();
    await otherContext.close();
    await fixture.cleanup();
  }
});

test('owner closes an empty session with a reason, revokes admission and cleans for the next guests', async ({
  page,
  browser,
}) => {
  const fixture = await orderingFixture();
  const guestContext = await browser.newContext({
    baseURL: 'http://localhost:3000',
    viewport: { width: 390, height: 844 },
  });
  const guest = await guestContext.newPage();
  try {
    await login(page, fixture.owner.email, fixture.password);
    await page.goto('/staff/tables');
    const card = page
      .locator('article')
      .filter({ has: page.getByRole('heading', { name: 'Bàn 02', exact: true }) });
    await card.getByRole('button', { name: 'Mở bàn', exact: true }).click();
    await expect(card.getByText('Đang phục vụ', { exact: true })).toBeVisible();
    await guest.goto(`/t/${fixture.emptyTable.publicCode}`);
    await guest.getByRole('button', { name: 'Bắt đầu gọi món', exact: true }).click();
    await expect(guest.getByRole('button', { name: 'Chọn Trà sữa', exact: true })).toBeEnabled();
    await card.getByRole('button', { name: 'Đóng phiên chưa có đơn', exact: true }).click();
    await page.getByLabel('Lý do đóng phiên').fill('Khách chuyển sang bàn khác');
    await page.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
    await expect(card.getByText('Cần dọn', { exact: true })).toBeVisible();
    const response = await guestContext.request.get(
      `/api/v1/public/tables/${fixture.emptyTable.publicCode}/guest`,
    );
    expect(response.status()).toBe(401);
    await card.getByRole('button', { name: 'Xác nhận đã dọn', exact: true }).click();
    await expect(card.getByText('Sẵn sàng', { exact: true })).toBeVisible();
    await card.getByRole('button', { name: 'Mở bàn', exact: true }).click();
    await expect(card.getByText('Đang phục vụ', { exact: true })).toBeVisible();
    await guest.reload();
    await guest.getByRole('button', { name: 'Bắt đầu gọi món', exact: true }).click();
    await guest.getByRole('link', { name: 'Đơn đã đặt', exact: true }).click();
    await expect(guest.getByText('Bạn chưa gửi đơn nào', { exact: false })).toBeVisible();
    const sessions = await fixture.db.diningSession.findMany({
      where: { tableId: fixture.emptyTable.id },
      orderBy: { openedAt: 'asc' },
    });
    expect(sessions).toHaveLength(2);
    expect(sessions[0]!.closeReason).toBe('Khách chuyển sang bàn khác');
    expect(sessions[0]!.status).toBe('CLOSED');
    expect(sessions[1]!.status).toBe('OPEN');
  } finally {
    await guestContext.close();
    await fixture.cleanup();
  }
});
