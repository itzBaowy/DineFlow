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
  await expect(page.locator('[data-live-connected="true"]')).toBeVisible();
}
async function admit(page: Page, code: string) {
  await page.goto(`/t/${code}`);
  await page.getByRole('button', { name: 'Bắt đầu gọi món', exact: true }).click();
  await expect(page.locator('[data-live-connected="true"]')).toBeVisible();
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBeTruthy();
}

test('live QR order delivery, guest tracking, polling fallback/reconnect and table service without manual refresh', async ({
  page,
  browser,
}) => {
  test.setTimeout(120000);
  const fixture = await orderingFixture();
  const kitchenContext = await browser.newContext({ baseURL: 'http://localhost:3000' }),
    guestContext = await browser.newContext({
      baseURL: 'http://localhost:3000',
      viewport: { width: 390, height: 844 },
    }),
    otherContext = await browser.newContext({ baseURL: 'http://localhost:3000' });
  const kitchen = await kitchenContext.newPage(),
    guest = await guestContext.newPage(),
    other = await otherContext.newPage();
  const errors: string[] = [];
  let receivedFrames = 0,
    ticketPosts = 0;
  for (const p of [page, guest, kitchen, other])
    p.on('pageerror', (error) => errors.push(error.message));
  page.on('websocket', (socket) => socket.on('framereceived', () => receivedFrames++));
  guest.on('request', (request) => {
    if (request.url().endsWith('/realtime-ticket') && request.method() === 'POST') ticketPosts++;
  });
  // Disable only the optional upgrade for this guest, exercising Socket.IO polling through Next.
  await guest.routeWebSocket('**/api/v1/realtime/socket.io**', (socket) => socket.close());
  try {
    await login(page, fixture.waiter.email, fixture.password);
    await page.goto('/staff/tables');
    const table = page
      .locator('article')
      .filter({ has: page.getByRole('heading', { name: 'Bàn 01', exact: true }) });
    await table.getByRole('button', { name: 'Mở bàn', exact: true }).click();
    await expect(table.getByText('Đang phục vụ', { exact: true })).toBeVisible();
    await page.goto('/staff/orders');
    await login(kitchen, fixture.kitchen.email, fixture.password);
    await kitchen.goto('/staff/kitchen');
    await admit(guest, fixture.table.publicCode);
    await admit(other, fixture.table.publicCode);
    await other.goto(`/t/${fixture.table.publicCode}/orders`);
    await guest.getByRole('button', { name: 'Chọn Trà sữa', exact: true }).click();
    await guest.getByRole('radio', { name: /^L/ }).check();
    await guest.getByRole('button', { name: /^Thêm vào giỏ/ }).click();
    await guest.getByRole('link', { name: 'Xem giỏ hàng' }).click();
    await guest.getByRole('button', { name: /^Xác nhận đặt món/ }).click();
    await expect(guest).toHaveURL(/\/orders$/);
    const order = await fixture.db.order.findFirstOrThrow({
      where: { restaurantId: fixture.restaurantId },
    });
    const staffTicket = page.locator(`[data-order-id="${order.id}"]`),
      kitchenTicket = kitchen.locator(`[data-order-id="${order.id}"]`);
    await expect(staffTicket).toBeVisible();
    await expect(page.getByText('Có đơn mới trong hàng đợi.', { exact: true })).toBeVisible();
    await expect(kitchenTicket).toHaveCount(0);
    await staffTicket.getByRole('button', { name: 'Xác nhận đơn', exact: true }).click();
    await expect(
      kitchenTicket.getByRole('button', { name: 'Bắt đầu chế biến', exact: true }),
    ).toBeVisible();
    await expect(guest.getByText('Đã xác nhận', { exact: true })).toBeVisible();
    await kitchenTicket.getByRole('button', { name: 'Bắt đầu chế biến', exact: true }).click();
    await expect(guest.getByText('Đang chế biến', { exact: true })).toBeVisible();
    await expect(
      guest.getByRole('list', { name: 'Tiến độ đơn' }).locator('[aria-current="step"]'),
    ).toContainText('Chế biến');
    await guest.screenshot({ path: resolve(qaDir, 'guest-tracking-mobile.png'), fullPage: true });
    await noOverflow(guest);
    await expect(other.getByText('Bạn chưa gửi đơn nào', { exact: false })).toBeVisible();
    await expect(other.getByText('Đang chế biến', { exact: true })).toHaveCount(0);
    const previousTickets = ticketPosts;
    await guestContext.setOffline(true);
    await expect(guest.locator('[data-live-connected="false"]')).toBeVisible({ timeout: 15000 });
    await guest.screenshot({
      path: resolve(qaDir, 'guest-disconnected-mobile.png'),
      fullPage: true,
    });
    await kitchenTicket.getByRole('button', { name: 'Món đã sẵn sàng', exact: true }).click();
    await expect(kitchenTicket.getByText('Chờ nhân viên phục vụ', { exact: true })).toBeVisible();
    await guestContext.setOffline(false);
    await expect(guest.locator('[data-live-connected="true"]')).toBeVisible({ timeout: 15000 });
    await expect(guest.getByText('Món sẵn sàng', { exact: true })).toBeVisible();
    expect(ticketPosts).toBeGreaterThan(previousTickets);
    await page
      .getByRole('navigation', { name: 'Trạng thái đơn' })
      .getByRole('button', { name: /^Sẵn sàng/ })
      .click();
    await staffTicket.getByRole('button', { name: 'Đã phục vụ', exact: true }).click();
    await expect(guest.getByText('Đã phục vụ', { exact: true })).toBeVisible();

    await page.goto('/staff/requests');
    await guest.getByRole('button', { name: 'Gọi nhân viên', exact: true }).click();
    await expect(guest.getByText('Gọi nhân viên · Chờ phản hồi', { exact: true })).toBeVisible();
    await expect(guest.getByRole('button', { name: 'Gọi nhân viên', exact: true })).toBeDisabled();
    const call = await fixture.db.serviceRequest.findFirstOrThrow({
      where: { restaurantId: fixture.restaurantId, type: 'CALL_STAFF' },
    });
    const requestCard = page.locator(`[data-request-id="${call.id}"]`);
    await expect(requestCard).toBeVisible();
    await page.screenshot({ path: resolve(qaDir, 'service-requests-desktop.png'), fullPage: true });
    await requestCard.getByRole('button', { name: 'Tiếp nhận yêu cầu', exact: true }).click();
    await expect(
      guest.getByText('Gọi nhân viên · Nhân viên đã tiếp nhận', { exact: true }),
    ).toBeVisible();
    await page
      .getByRole('navigation', { name: 'Trạng thái yêu cầu' })
      .getByRole('button', { name: 'Nhân viên đã tiếp nhận', exact: true })
      .click();
    await requestCard.getByRole('button', { name: 'Đã hỗ trợ khách', exact: true }).click();
    await expect(guest.getByText('Gọi nhân viên · Đã xử lý', { exact: true })).toBeVisible();
    await guest.getByRole('button', { name: 'Yêu cầu thanh toán', exact: true }).click();
    await expect(guest.getByRole('dialog')).toBeVisible();
    const session = await fixture.db.diningSession.findFirstOrThrow({
      where: { tableId: fixture.table.id },
    });
    expect(session.status).toBe('OPEN');
    await guest.getByRole('button', { name: 'Gửi yêu cầu thanh toán', exact: true }).click();
    await expect(guest.getByRole('dialog')).not.toBeVisible();
    await expect(
      guest.getByRole('heading', { name: 'Bàn đang chờ thanh toán', exact: true }),
    ).toBeVisible();
    expect(
      (await fixture.db.diningSession.findUniqueOrThrow({ where: { id: session.id } })).status,
    ).toBe('PAYMENT_REQUESTED');
    expect(await fixture.db.payment.count({ where: { diningSessionId: session.id } })).toBe(0);
    await page
      .getByRole('navigation', { name: 'Trạng thái yêu cầu' })
      .getByRole('button', { name: 'Chờ phản hồi', exact: true })
      .click();
    await expect(page.getByText('Yêu cầu thanh toán', { exact: true })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await noOverflow(page);
    await page.screenshot({ path: resolve(qaDir, 'service-requests-mobile.png'), fullPage: true });
    await page.setViewportSize({ width: 320, height: 740 });
    await noOverflow(page);
    await guest.getByRole('link', { name: 'Xem thực đơn', exact: true }).click();
    await expect(guest.getByRole('button', { name: 'Chọn Trà sữa', exact: true })).toBeDisabled();
    expect(receivedFrames).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  } finally {
    await guestContext.setOffline(false);
    await kitchenContext.close();
    await guestContext.close();
    await otherContext.close();
    await fixture.cleanup();
  }
});

test('session close reaches admitted guests automatically and clears pending service requests', async ({
  page,
  browser,
}) => {
  const fixture = await orderingFixture(),
    guestContext = await browser.newContext({
      baseURL: 'http://localhost:3000',
      viewport: { width: 390, height: 844 },
    }),
    guest = await guestContext.newPage();
  try {
    await login(page, fixture.owner.email, fixture.password);
    await page.goto('/staff/tables');
    const table = page
      .locator('article')
      .filter({ has: page.getByRole('heading', { name: 'Bàn 02', exact: true }) });
    await table.getByRole('button', { name: 'Mở bàn', exact: true }).click();
    await expect(table.getByText('Đang phục vụ', { exact: true })).toBeVisible();
    await admit(guest, fixture.emptyTable.publicCode);
    await guest.getByRole('button', { name: 'Gọi nhân viên', exact: true }).click();
    await expect(guest.getByText('Gọi nhân viên · Chờ phản hồi', { exact: true })).toBeVisible();
    await table.getByRole('button', { name: 'Đóng phiên chưa có đơn', exact: true }).click();
    await page.getByLabel('Lý do đóng phiên').fill('Khách chuyển sang bàn khác');
    await page.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
    await expect(
      guest.getByRole('heading', { name: 'Chào mừng bạn đến bàn', exact: true }),
    ).toBeVisible();
    await expect(guest.getByRole('button', { name: 'Chọn Trà sữa', exact: true })).toBeDisabled();
    await expect(guest.locator('[data-live-connected]')).toHaveCount(0);
    expect(
      await fixture.db.serviceRequest.count({
        where: { restaurantId: fixture.restaurantId, status: 'PENDING' },
      }),
    ).toBe(0);
  } finally {
    await guestContext.close();
    await fixture.cleanup();
  }
});
