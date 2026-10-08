import { test, expect, type Page, type APIRequestContext } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
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
async function mutation(
  context: APIRequestContext,
  path: string,
  body: unknown,
  method = 'POST',
) {
  const response = await context.fetch(`/api/v1${path}`, {
    method,
    headers: { 'X-DineFlow-Client': 'web', Origin: 'http://localhost:3000' },
    data: body,
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBeTruthy();
}

test('QR through waiter, kitchen, served, cash billing and printable immutable receipt; clean and reuse the same QR', async ({
  page,
  browser,
}) => {
  test.setTimeout(120000);
  const fixture = await orderingFixture(),
    kitchenContext = await browser.newContext({ baseURL: 'http://localhost:3000' }),
    cashierContext = await browser.newContext({ baseURL: 'http://localhost:3000' }),
    guestContext = await browser.newContext({
      baseURL: 'http://localhost:3000',
      viewport: { width: 390, height: 844 },
    });
  const kitchen = await kitchenContext.newPage(),
    cashier = await cashierContext.newPage(),
    guest = await guestContext.newPage(),
    errors: string[] = [];
  for (const p of [page, kitchen, cashier, guest])
    p.on('pageerror', (error) => errors.push(error.message));
  try {
    await fixture.db.restaurant.update({
      where: { id: fixture.restaurantId },
      data: { serviceChargeBps: 500, taxBps: 800, cashierMaxDiscountBps: 1000 },
    });
    await login(page, fixture.waiter.email, fixture.password);
    await page.goto('/staff/tables');
    const table = page
      .locator('article')
      .filter({ has: page.getByRole('heading', { name: 'Bàn 01', exact: true }) });
    await table.getByRole('button', { name: 'Mở bàn', exact: true }).click();
    await expect(table.getByText('Đang phục vụ', { exact: true })).toBeVisible();
    const session = await fixture.db.diningSession.findFirstOrThrow({
      where: { tableId: fixture.table.id },
    });
    await guest.goto(`/t/${fixture.table.publicCode}`);
    await guest.getByRole('button', { name: 'Bắt đầu gọi món', exact: true }).click();
    for (let i = 0; i < 2; i++) {
      if (i) await guest.getByRole('link', { name: 'Gọi thêm món', exact: true }).click();
      await guest.getByRole('button', { name: 'Chọn Trà sữa', exact: true }).click();
      await guest.getByRole('radio', { name: /^L/ }).check();
      await guest.getByRole('button', { name: /^Thêm vào giỏ/ }).click();
      await guest.getByRole('link', { name: 'Xem giỏ hàng', exact: true }).click();
      await guest.getByRole('button', { name: /^Xác nhận đặt món/ }).click();
      await expect(guest).toHaveURL(/\/orders$/);
    }
    const tea = await fixture.db.menuItem.findFirstOrThrow({
      where: { restaurantId: fixture.restaurantId, name: 'Trà đào' },
    });
    const rejected = await mutation(
      guestContext.request,
      `/public/tables/${fixture.table.publicCode}/orders`,
      {
        diningSessionId: session.id,
        idempotencyKey: randomUUID(),
        expectedTotal: 30000,
        note: null,
        items: [{ menuItemId: tea.id, quantity: 1, modifierOptionIds: [], note: null }],
      },
    );
    const orders = await fixture.db.order.findMany({
      where: { diningSessionId: session.id, id: { not: rejected.id } },
      orderBy: { createdAt: 'asc' },
    });
    expect(orders).toHaveLength(2);
    await page.goto('/staff/orders');
    const rejectedTicket = page.locator(`[data-order-id="${rejected.id}"]`);
    await rejectedTicket.getByRole('button', { name: 'Từ chối đơn', exact: true }).click();
    await page.getByLabel('Lý do hủy đơn').fill('Khách đổi món trước khi chế biến');
    await page.getByRole('button', { name: 'Xác nhận hủy đơn', exact: true }).click();
    await expect(rejectedTicket).toHaveCount(0);
    await login(cashier, fixture.cashier.email, fixture.password);
    await cashier.goto('/staff/cashier');
    await cashier.getByRole('link', { name: /Bàn 01.*Xem hóa đơn/ }).click();
    await expect(cashier.getByText('2 đơn chưa phục vụ xong.', { exact: false })).toBeVisible();
    await expect(
      cashier.getByRole('button', { name: 'Kiểm tra & xác nhận thanh toán', exact: true }),
    ).toBeDisabled();
    await page.goto(`/staff/cashier/${session.id}`);
    await expect(
      page.getByText('Vai trò của bạn chỉ xem hóa đơn và biên nhận.', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Kiểm tra & xác nhận thanh toán', exact: true }),
    ).toHaveCount(0);
    await page.goto('/staff/orders');
    await login(kitchen, fixture.kitchen.email, fixture.password);
    await kitchen.goto('/staff/kitchen');
    for (const order of orders) {
      await page
        .locator(`[data-order-id="${order.id}"]`)
        .getByRole('button', { name: 'Xác nhận đơn', exact: true })
        .click();
      const ticket = kitchen.locator(`[data-order-id="${order.id}"]`);
      await ticket.getByRole('button', { name: 'Bắt đầu chế biến', exact: true }).click();
      await ticket.getByRole('button', { name: 'Món đã sẵn sàng', exact: true }).click();
    }
    await page
      .getByRole('navigation', { name: 'Trạng thái đơn' })
      .getByRole('button', { name: /^Sẵn sàng/ })
      .click();
    for (const order of orders)
      await page
        .locator(`[data-order-id="${order.id}"]`)
        .getByRole('button', { name: 'Đã phục vụ', exact: true })
        .click();
    await expect(
      cashier.getByText('Tất cả 2 đơn hợp lệ đã phục vụ', { exact: false }),
    ).toBeVisible();
    await guest.getByRole('link', { name: 'Hóa đơn tạm tính', exact: true }).click();
    await expect(guest.locator('[data-bill-total]')).toContainText('90.720');
    await cashier.getByLabel('Giảm giá (VND)', { exact: true }).fill('4000');
    await cashier
      .getByLabel('Lý do giảm giá', { exact: true })
      .fill('Ưu đãi được thu ngân duyệt');
    await cashier.getByRole('button', { name: 'Lưu giảm giá', exact: true }).click();
    await expect(cashier.locator('[data-bill-total]')).toContainText('86.184');
    await expect(guest.locator('[data-bill-total]')).toContainText('86.184');
    await cashier.screenshot({
      path: resolve(qaDir, 'cashier-bill-desktop.png'),
      fullPage: true,
    });
    await cashier.setViewportSize({ width: 390, height: 844 });
    await noOverflow(cashier);
    await cashier.screenshot({
      path: resolve(qaDir, 'cashier-bill-mobile.png'),
      fullPage: true,
    });
    await cashier.setViewportSize({ width: 320, height: 740 });
    await noOverflow(cashier);
    await cashier.setViewportSize({ width: 1440, height: 1000 });
    await cashier
      .getByRole('checkbox', { name: 'Tôi đã kiểm tra và nhận đủ tiền từ khách.', exact: true })
      .check();
    await cashier
      .getByRole('button', { name: 'Kiểm tra & xác nhận thanh toán', exact: true })
      .click();
    await expect(cashier.getByRole('dialog')).toBeVisible();
    expect(await fixture.db.payment.count({ where: { diningSessionId: session.id } })).toBe(0);
    await cashier
      .getByRole('button', { name: 'Xác nhận thanh toán & đóng phiên', exact: true })
      .click();
    await expect(cashier).toHaveURL(/\/cashier\/receipts\/[a-f0-9-]+$/);
    await expect(
      cashier.getByRole('heading', { name: 'Biên nhận thanh toán', exact: true }),
    ).toBeVisible();
    await expect(cashier.locator('[data-bill-total]')).toContainText('86.184');
    const payment = await fixture.db.payment.findUniqueOrThrow({
      where: { diningSessionId: session.id },
    });
    expect(payment.method).toBe('CASH');
    expect(payment.paidAmount).toBe(86184);
    expect(await fixture.db.payment.count({ where: { diningSessionId: session.id } })).toBe(1);
    await expect(
      guest.getByRole('heading', { name: 'Chào mừng bạn đến bàn', exact: true }),
    ).toBeVisible();
    await expect(guest.getByText('Bắt đầu gọi món', { exact: true })).toHaveCount(0);
    await cashier.emulateMedia({ media: 'print' });
    await expect(cashier.locator('[data-workspace-sidebar]')).not.toBeVisible();
    await expect(
      cashier.getByRole('button', { name: 'In biên nhận', exact: true }),
    ).not.toBeVisible();
    await cashier.screenshot({ path: resolve(qaDir, 'receipt-print.png'), fullPage: true });
    await cashier.pdf({
      path: resolve(qaDir, 'payment-receipt.pdf'),
      preferCSSPageSize: true,
      printBackground: true,
    });
    await cashier.emulateMedia({ media: 'screen' });
    await cashier.setViewportSize({ width: 320, height: 740 });
    await noOverflow(cashier);
    await page.goto('/staff/tables');
    await expect(table.getByText('Cần dọn', { exact: true })).toBeVisible();
    await table.getByRole('button', { name: 'Xác nhận đã dọn', exact: true }).click();
    await expect(table.getByRole('button', { name: 'Mở bàn', exact: true })).toBeVisible();
    await table.getByRole('button', { name: 'Mở bàn', exact: true }).click();
    await expect(table.getByText('Đang phục vụ', { exact: true })).toBeVisible();
    await guest.goto(`/t/${fixture.table.publicCode}`);
    await guest.getByRole('button', { name: 'Bắt đầu gọi món', exact: true }).click();
    await guest.getByRole('link', { name: 'Đơn đã đặt', exact: true }).click();
    await expect(guest.getByText('Bạn chưa gửi đơn nào', { exact: false })).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await guestContext.close();
    await kitchenContext.close();
    await cashierContext.close();
    await fixture.cleanup();
  }
});

test('manual transfer retry survives lost committed response and reload; cancelled session closes without collecting money', async ({
  page,
  browser,
}) => {
  test.setTimeout(90000);
  const fixture = await orderingFixture(),
    ownerContext = await browser.newContext({ baseURL: 'http://localhost:3000' }),
    owner = await ownerContext.newPage();
  try {
    await login(owner, fixture.owner.email, fixture.password);
    const session = await mutation(
      ownerContext.request,
      `/dining-sessions/tables/${fixture.table.id}/open`,
      {},
    );
    const tea = await fixture.db.menuItem.findFirstOrThrow({
      where: { restaurantId: fixture.restaurantId, name: 'Trà đào' },
    });
    const body = (id: string) => ({
      diningSessionId: id,
      idempotencyKey: randomUUID(),
      expectedTotal: 30000,
      note: null,
      items: [{ menuItemId: tea.id, quantity: 1, modifierOptionIds: [], note: null }],
    });
    const order = await mutation(
      ownerContext.request,
      `/dining-sessions/${session.id}/orders`,
      body(session.id),
    );
    for (const [from, to] of [
      ['PENDING_CONFIRMATION', 'ACCEPTED'],
      ['ACCEPTED', 'PREPARING'],
      ['PREPARING', 'READY'],
      ['READY', 'SERVED'],
    ])
      await mutation(
        ownerContext.request,
        `/orders/${order.id}/status`,
        { from, to, reason: null },
        'PATCH',
      );
    await login(page, fixture.cashier.email, fixture.password);
    await page.goto(`/staff/cashier/${session.id}`);
    await page
      .getByRole('button', { name: 'Tạm ngừng món để thanh toán', exact: true })
      .click();
    await page.getByRole('button', { name: 'Mở lại để gọi thêm', exact: true }).click();
    await page.getByLabel('Lý do', { exact: true }).fill('Khách cần kiểm tra lại món');
    await page.getByRole('button', { name: 'Xác nhận mở lại', exact: true }).click();
    await expect(
      page.getByText('Đang phục vụ · Có thể gọi thêm món', { exact: true }),
    ).toBeVisible();
    await page.getByRole('radio', { name: 'Chuyển khoản', exact: true }).check();
    await page
      .getByLabel('Mã giao dịch đã kiểm tra', { exact: true })
      .fill('MANUAL-VERIFIED-123');
    await expect(
      page.getByRole('button', { name: 'Kiểm tra & xác nhận thanh toán', exact: true }),
    ).toBeDisabled();
    await page
      .getByRole('checkbox', { name: 'Tôi đã kiểm tra và nhận đủ tiền từ khách.', exact: true })
      .check();
    let drop = true;
    const submitted: unknown[] = [];
    await page.route(`**/billing/sessions/${session.id}/payments`, async (route) => {
      submitted.push(route.request().postDataJSON());
      if (drop) {
        drop = false;
        const response = await route.fetch();
        expect(response.status()).toBe(201);
        await route.abort('failed');
      } else await route.continue();
    });
    await page
      .getByRole('button', { name: 'Kiểm tra & xác nhận thanh toán', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Xác nhận thanh toán & đóng phiên', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: 'Thử lại cùng mã thanh toán', exact: true }),
    ).toBeEnabled();
    expect(await fixture.db.payment.count({ where: { diningSessionId: session.id } })).toBe(1);
    await page.reload();
    await expect(
      page.getByRole('button', { name: 'Thử lại cùng mã thanh toán', exact: true }),
    ).toBeEnabled();
    await page.screenshot({
      path: resolve(qaDir, 'payment-retry-after-reload.png'),
      fullPage: true,
    });
    await page.getByRole('button', { name: 'Thử lại cùng mã thanh toán', exact: true }).click();
    await expect(page).toHaveURL(/\/cashier\/receipts\/[a-f0-9-]+$/);
    expect(submitted).toHaveLength(2);
    expect(submitted[0]).toEqual(submitted[1]);
    const payment = await fixture.db.payment.findUniqueOrThrow({
      where: { diningSessionId: session.id },
    });
    expect(payment.method).toBe('BANK_TRANSFER');
    expect(payment.reference).toBe('MANUAL-VERIFIED-123');
    expect(
      await fixture.db.activityLog.count({
        where: { entityId: payment.id, action: 'payment.completed' },
      }),
    ).toBe(1);
    const cancelledSession = await mutation(
        ownerContext.request,
        `/dining-sessions/tables/${fixture.emptyTable.id}/open`,
        {},
      ),
      cancelledOrder = await mutation(
        ownerContext.request,
        `/dining-sessions/${cancelledSession.id}/orders`,
        body(cancelledSession.id),
      );
    await mutation(
      ownerContext.request,
      `/orders/${cancelledOrder.id}/status`,
      { from: 'PENDING_CONFIRMATION', to: 'CANCELLED', reason: 'Khách hủy trước chế biến' },
      'PATCH',
    );
    await mutation(ownerContext.request, `/billing/sessions/${cancelledSession.id}/status`, {
      from: 'OPEN',
      to: 'PAYMENT_REQUESTED',
      reason: null,
    });
    await page.goto(`/staff/cashier/${cancelledSession.id}`);
    await page.getByRole('button', { name: 'Đóng phiên không thu tiền', exact: true }).click();
    await page.getByLabel('Lý do', { exact: true }).fill('Khách đã hủy toàn bộ món');
    await page.getByRole('button', { name: 'Xác nhận đóng phiên', exact: true }).click();
    await expect(page).toHaveURL(/\/staff\/cashier$/);
    expect(
      (await fixture.db.diningSession.findUniqueOrThrow({ where: { id: cancelledSession.id } }))
        .status,
    ).toBe('CLOSED');
    expect(
      await fixture.db.payment.count({ where: { diningSessionId: cancelledSession.id } }),
    ).toBe(0);
    expect(
      await fixture.db.order.count({
        where: { diningSessionId: cancelledSession.id, status: 'CANCELLED' },
      }),
    ).toBe(1);
  } finally {
    await ownerContext.close();
    await fixture.cleanup();
  }
});
