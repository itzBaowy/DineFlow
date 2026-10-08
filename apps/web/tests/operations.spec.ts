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
async function chooseTea(page: Page) {
  await page.getByRole('button', { name: 'Chọn Trà sữa', exact: true }).click();
  await page.getByRole('radio', { name: /^L/ }).check();
  await page.getByRole('checkbox', { name: /^Trân châu/ }).check();
  await page.getByLabel('Ghi chú món', { exact: true }).fill('Ít đá');
  await page.getByRole('button', { name: /^Thêm vào giỏ/ }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBeTruthy();
}

test('waiter confirms QR orders, kitchen prepares, waiter serves and manual orders preserve modifiers and rejection reasons', async ({
  page,
  browser,
}) => {
  test.setTimeout(120000);
  const fixture = await orderingFixture();
  const kitchenContext = await browser.newContext({ baseURL: 'http://localhost:3000' });
  const guestContext = await browser.newContext({
    baseURL: 'http://localhost:3000',
    viewport: { width: 390, height: 844 },
  });
  const kitchen = await kitchenContext.newPage(),
    guest = await guestContext.newPage();
  const errors: string[] = [];
  for (const p of [page, kitchen, guest]) p.on('pageerror', (error) => errors.push(error.message));
  try {
    await login(page, fixture.waiter.email, fixture.password);
    await page.goto('/staff/tables');
    const table = page
      .locator('article')
      .filter({ has: page.getByRole('heading', { name: 'Bàn 01', exact: true }) });
    await table.getByRole('button', { name: 'Mở bàn', exact: true }).click();
    await expect(table.getByText('Đang phục vụ', { exact: true })).toBeVisible();
    await guest.goto(`/t/${fixture.table.publicCode}`);
    await guest.getByRole('button', { name: 'Bắt đầu gọi món', exact: true }).click();
    await chooseTea(guest);
    await guest.getByRole('link', { name: 'Xem giỏ hàng' }).click();
    await guest.getByRole('button', { name: /^Xác nhận đặt món/ }).click();
    await expect(guest).toHaveURL(/\/orders$/);
    await expect(guest.getByText('Chờ xác nhận', { exact: true })).toBeVisible();
    const order = await fixture.db.order.findFirstOrThrow({
      where: { restaurantId: fixture.restaurantId, source: 'GUEST' },
    });
    await page.goto('/staff/orders');
    const ticket = page.locator(`[data-order-id="${order.id}"]`);
    await expect(ticket.getByText(/Size: L/)).toBeVisible();
    await expect(ticket.getByText(/Topping: Trân châu/)).toBeVisible();
    await expect(ticket.getByText('Ghi chú: Ít đá', { exact: true })).toBeVisible();
    await page.screenshot({ path: resolve(qaDir, 'staff-orders-desktop.png'), fullPage: true });
    await ticket.getByRole('button', { name: 'Xác nhận đơn', exact: true }).click();
    await expect(ticket).toHaveCount(0);
    await login(kitchen, fixture.kitchen.email, fixture.password);
    await kitchen.goto('/staff/kitchen');
    const cooking = kitchen.locator(`[data-order-id="${order.id}"]`);
    await expect(
      cooking.getByRole('button', { name: 'Bắt đầu chế biến', exact: true }),
    ).toBeVisible();
    await expect(cooking.getByRole('button', { name: 'Từ chối đơn', exact: true })).toHaveCount(0);
    await kitchen.screenshot({ path: resolve(qaDir, 'kitchen-desktop.png'), fullPage: true });
    await kitchen.setViewportSize({ width: 390, height: 844 });
    await noOverflow(kitchen);
    await kitchen.screenshot({ path: resolve(qaDir, 'kitchen-mobile.png'), fullPage: true });
    await cooking.getByRole('button', { name: 'Bắt đầu chế biến', exact: true }).click();
    await expect(
      cooking.getByRole('button', { name: 'Món đã sẵn sàng', exact: true }),
    ).toBeVisible();
    await cooking.getByRole('button', { name: 'Món đã sẵn sàng', exact: true }).click();
    await expect(cooking.getByText('Chờ nhân viên phục vụ', { exact: true })).toBeVisible();
    await guest.getByRole('button', { name: 'Cập nhật', exact: true }).click();
    await expect(guest.getByText('Món sẵn sàng', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Cập nhật đơn', exact: true }).click();
    await page
      .getByRole('navigation', { name: 'Trạng thái đơn' })
      .getByRole('button', { name: /^Sẵn sàng/ })
      .click();
    await ticket.getByRole('button', { name: 'Đã phục vụ', exact: true }).click();
    await expect(ticket).toHaveCount(0);
    await guest.getByRole('button', { name: 'Cập nhật', exact: true }).click();
    await expect(guest.getByText('Đã phục vụ', { exact: true })).toBeVisible();
    const served = await fixture.db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(served.status).toBe('SERVED');
    for (const timestamp of [
      served.acceptedAt,
      served.preparingAt,
      served.readyAt,
      served.servedAt,
    ])
      expect(timestamp).not.toBeNull();

    await page.goto('/staff/tables');
    await table.getByRole('link', { name: 'Ghi đơn cho khách', exact: true }).click();
    await expect(page).toHaveURL(/\/staff\/tables\/[^/]+\/order$/);
    await chooseTea(page);
    await page.getByRole('link', { name: 'Xem giỏ hàng' }).click();
    await page.getByLabel('Ghi chú cho cả đơn').fill('Khách muốn mang ra sau');
    await page.reload();
    await expect(page.getByLabel('Ghi chú cho cả đơn')).toHaveValue('Khách muốn mang ra sau');
    await expect(page.getByRole('button', { name: /^Ghi nhận đơn/ })).toContainText('45.000');
    await page.screenshot({ path: resolve(qaDir, 'manual-cart-desktop.png'), fullPage: true });
    await page.getByRole('button', { name: /^Ghi nhận đơn/ }).click();
    await expect(page).toHaveURL(/\/staff\/orders$/);
    await page
      .getByRole('navigation', { name: 'Trạng thái đơn' })
      .getByRole('button', { name: /^Chờ xác nhận/ })
      .click();
    await expect(page.getByText('Nhân viên ghi nhận', { exact: false })).toBeVisible();
    const manual = await fixture.db.order.findFirstOrThrow({
      where: { restaurantId: fixture.restaurantId, source: 'STAFF' },
    });
    expect(manual.guestSessionId).toBeNull();
    expect(manual.totalAmount).toBe(45000);
    const manualTicket = page.locator(`[data-order-id="${manual.id}"]`);
    await manualTicket.getByRole('button', { name: 'Từ chối đơn', exact: true }).click();
    await page.getByRole('button', { name: 'Xác nhận hủy đơn', exact: true }).click();
    await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible();
    await page.getByLabel('Lý do hủy đơn').fill('Khách đổi ý trước khi chuẩn bị');
    await page.getByRole('button', { name: 'Xác nhận hủy đơn', exact: true }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await page
      .getByRole('navigation', { name: 'Trạng thái đơn' })
      .getByRole('button', { name: /^Đã hủy/ })
      .click();
    await expect(
      manualTicket.getByText('Lý do hủy: Khách đổi ý trước khi chuẩn bị', { exact: true }),
    ).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await noOverflow(page);
    await page.screenshot({ path: resolve(qaDir, 'staff-orders-mobile.png'), fullPage: true });
    await page.setViewportSize({ width: 320, height: 740 });
    await noOverflow(page);
    await guest.getByRole('button', { name: 'Cập nhật', exact: true }).click();
    await expect(guest.locator('article')).toHaveCount(1);
    expect(
      await fixture.db.activityLog.count({
        where: {
          entityId: order.id,
          action: { in: ['order.accepted', 'order.preparing', 'order.ready', 'order.served'] },
        },
      }),
    ).toBe(4);
    expect(errors).toEqual([]);
  } finally {
    await kitchenContext.close();
    await guestContext.close();
    await fixture.cleanup();
  }
});

test('cashier reads orders without actions; kitchen cannot access staff orders and stale confirmation refetches safely', async ({
  page,
  browser,
}) => {
  test.setTimeout(60000);
  const fixture = await orderingFixture();
  const managerContext = await browser.newContext({ baseURL: 'http://localhost:3000' });
  const manager = await managerContext.newPage();
  try {
    await login(page, fixture.waiter.email, fixture.password);
    await page.goto('/staff/tables');
    const table = page
      .locator('article')
      .filter({ has: page.getByRole('heading', { name: 'Bàn 01', exact: true }) });
    await table.getByRole('button', { name: 'Mở bàn', exact: true }).click();
    await expect(table.getByRole('link', { name: 'Ghi đơn cho khách', exact: true })).toBeVisible();
    await table.getByRole('link', { name: 'Ghi đơn cho khách', exact: true }).click();
    await chooseTea(page);
    await page.getByRole('link', { name: 'Xem giỏ hàng' }).click();
    await page.getByRole('button', { name: /^Ghi nhận đơn/ }).click();
    await expect(page).toHaveURL(/\/staff\/orders$/);
    const order = await fixture.db.order.findFirstOrThrow({
      where: { restaurantId: fixture.restaurantId },
    });
    const ticket = page.locator(`[data-order-id="${order.id}"]`);
    await expect(ticket.getByRole('button', { name: 'Xác nhận đơn', exact: true })).toBeVisible();
    await login(manager, fixture.manager.email, fixture.password);
    let release!: () => void, intercepted!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started = new Promise<void>((resolve) => {
      intercepted = resolve;
    });
    await page.route(`**/orders/${order.id}/status`, async (route) => {
      intercepted();
      await held;
      await route.continue();
    });
    const conflict = page.waitForResponse(
      (r) => r.url().endsWith(`/orders/${order.id}/status`) && r.request().method() === 'PATCH',
    );
    await ticket.getByRole('button', { name: 'Xác nhận đơn', exact: true }).click();
    await started;
    const response = await managerContext.request.patch(`/api/v1/orders/${order.id}/status`, {
      headers: { 'X-DineFlow-Client': 'web', Origin: 'http://localhost:3000' },
      data: { from: 'PENDING_CONFIRMATION', to: 'ACCEPTED', reason: null },
    });
    expect(response.status()).toBe(200);
    // Release the already-sent stale request after the manager's real transaction commits.
    release();
    expect((await conflict).status()).toBe(409);
    await expect(ticket).toHaveCount(0);
    await page
      .getByRole('navigation', { name: 'Trạng thái đơn' })
      .getByRole('button', { name: /^Đã nhận/ })
      .click();
    await expect(ticket).toBeVisible();
    await expect(ticket.getByRole('button', { name: 'Hủy đơn đã nhận', exact: true })).toHaveCount(
      0,
    );
    expect(
      await fixture.db.activityLog.count({
        where: { entityId: order.id, action: 'order.accepted' },
      }),
    ).toBe(1);
    await page.getByRole('button', { name: 'Đăng xuất', exact: true }).click();
    await expect(page).toHaveURL(/staff\/login$/);
    await login(page, fixture.cashier.email, fixture.password);
    await page.goto('/staff/orders');
    await page
      .getByRole('navigation', { name: 'Trạng thái đơn' })
      .getByRole('button', { name: /^Đã nhận/ })
      .click();
    await expect(ticket).toBeVisible();
    await expect(ticket.getByRole('button')).toHaveCount(0);
    await page.getByRole('button', { name: 'Đăng xuất', exact: true }).click();
    await expect(page).toHaveURL(/staff\/login$/);
    await login(page, fixture.kitchen.email, fixture.password);
    await page.goto('/staff/orders');
    await expect(
      page.getByText('Vai trò của bạn không có quyền xem danh sách đơn phục vụ.', { exact: true }),
    ).toBeVisible();
  } finally {
    await managerContext.close();
    await fixture.cleanup();
  }
});
