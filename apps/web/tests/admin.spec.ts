import { test, expect, type Page, type APIRequestContext } from '@playwright/test';
import { randomUUID, randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { localDate } from '@dineflow/shared';
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
  body: unknown = {},
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

test('owner reports real completed payments, filters days/months/methods and reads archived order snapshots and audit on mobile', async ({
  page,
  context,
}) => {
  test.setTimeout(90000);
  const fixture = await orderingFixture(),
    errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await fixture.db.restaurant.update({
      where: { id: fixture.restaurantId },
      data: { serviceChargeBps: 500, taxBps: 800 },
    });
    await login(page, fixture.owner.email, fixture.password);
    await page
      .getByRole('navigation', { name: 'Menu chính', exact: true })
      .getByRole('link', { name: 'Báo cáo', exact: true })
      .click();
    await expect(page.locator('[data-report-metric="Hóa đơn đã thanh toán"]')).toHaveText('0');
    const tea = await fixture.db.menuItem.findFirstOrThrow({
      where: { restaurantId: fixture.restaurantId, name: 'Trà đào' },
    });
    const open = async (tableId: string) =>
      mutation(context.request, `/dining-sessions/tables/${tableId}/open`);
    const order = async (sessionId: string, quantity: number) =>
      mutation(context.request, `/dining-sessions/${sessionId}/orders`, {
        diningSessionId: sessionId,
        idempotencyKey: randomUUID(),
        expectedTotal: quantity * 30000,
        note: 'Lịch sử thực tế',
        items: [{ menuItemId: tea.id, quantity, modifierOptionIds: [], note: 'Ít đá' }],
      });
    const serve = async (id: string) => {
      for (const [from, to] of [
        ['PENDING_CONFIRMATION', 'ACCEPTED'],
        ['ACCEPTED', 'PREPARING'],
        ['PREPARING', 'READY'],
        ['READY', 'SERVED'],
      ])
        await mutation(
          context.request,
          `/orders/${id}/status`,
          { from, to, reason: null },
          'PATCH',
        );
    };
    const first = await open(fixture.table.id),
      firstOrder = await order(first.id, 2),
      rejected = await order(first.id, 1);
    await serve(firstOrder.id);
    await mutation(
      context.request,
      `/orders/${rejected.id}/status`,
      { from: 'PENDING_CONFIRMATION', to: 'CANCELLED', reason: 'Khách hủy trước chế biến' },
      'PATCH',
    );
    const billResponse = await context.request.get(`/api/v1/billing/sessions/${first.id}/bill`),
      bill = await billResponse.json();
    expect(billResponse.ok()).toBeTruthy();
    const discounted = await mutation(
      context.request,
      `/billing/sessions/${first.id}/discount`,
      { amount: 3000, reason: 'Ưu đãi kiểm thử', revision: bill.revision },
      'PATCH',
    );
    const bankReceipt = await mutation(
      context.request,
      `/billing/sessions/${first.id}/payments`,
      {
        idempotencyKey: randomUUID(),
        revision: discounted.revision,
        method: 'BANK_TRANSFER',
        paidAmount: 64638,
        reference: 'ADMIN-E2E-REF',
        receivedConfirmed: true,
      },
    );
    const second = await open(fixture.emptyTable.id),
      secondOrder = await order(second.id, 1);
    await serve(secondOrder.id);
    const secondBill = await (
      await context.request.get(`/api/v1/billing/sessions/${second.id}/bill`)
    ).json();
    await mutation(context.request, `/billing/sessions/${second.id}/payments`, {
      idempotencyKey: randomUUID(),
      revision: secondBill.revision,
      method: 'CASH',
      paidAmount: 34020,
      reference: null,
      receivedConfirmed: true,
    });
    await mutation(context.request, `/dining-sessions/tables/${fixture.table.id}/clean`);
    const unpaid = await open(fixture.table.id);
    await order(unpaid.id, 5);
    await fixture.db.menuItem.update({
      where: { id: tea.id },
      data: { name: 'Tên đã đổi sau thanh toán', basePrice: 99000, archivedAt: new Date() },
    });
    await expect(page.locator('[data-report-metric="Hóa đơn đã thanh toán"]')).toHaveText('2');
    await expect(page.locator('[data-report-metric="Tiền đã thu"]')).toContainText('98.658');
    await expect(page.getByText('3 phần · 2 đơn đã thanh toán', { exact: true })).toBeVisible();
    await expect(page.getByText('Trà đào', { exact: true })).toBeVisible();
    await page.screenshot({ path: resolve(qaDir, 'reports-desktop.png'), fullPage: true });
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      await noOverflow(page);
      if (width === 390)
        await page.screenshot({ path: resolve(qaDir, 'reports-mobile.png'), fullPage: true });
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page
      .getByLabel('Phương thức thanh toán', { exact: true })
      .selectOption('BANK_TRANSFER');
    await page.getByLabel('Gom nhóm', { exact: true }).selectOption('month');
    await page.getByRole('button', { name: 'Áp dụng bộ lọc', exact: true }).click();
    await expect(page.locator('[data-report-metric="Tiền đã thu"]')).toContainText('64.638');
    await expect(
      page.getByRole('heading', { name: 'Tiền đã thu theo tháng', exact: true }),
    ).toBeVisible();
    await page.getByLabel('Từ ngày', { exact: true }).fill('2020-01-01');
    await page.getByLabel('Đến ngày', { exact: true }).fill('2020-01-02');
    await page.getByRole('button', { name: 'Áp dụng bộ lọc', exact: true }).click();
    await expect(
      page.getByText('Chưa có giao dịch hoàn tất trong kỳ đã chọn.', { exact: true }),
    ).toBeVisible();
    await page.getByLabel('Từ ngày', { exact: true }).fill('2020-01-03');
    await page.getByRole('button', { name: 'Áp dụng bộ lọc', exact: true }).click();
    await expect(
      page.getByRole('alert').filter({ hasText: 'Khoảng ngày phải đúng thứ tự' }),
    ).toBeVisible();
    await page
      .getByRole('navigation', { name: 'Quản trị', exact: true })
      .getByRole('link', { name: 'Lịch sử đơn', exact: true })
      .click();
    await expect(
      page.getByRole('link', { name: `#${firstOrder.number}`, exact: true }),
    ).toBeVisible();
    await page.getByRole('link', { name: `#${firstOrder.number}`, exact: true }).click();
    await expect(
      page.getByRole('heading', { name: `Đơn #${firstOrder.number}`, level: 1, exact: true }),
    ).toBeVisible();
    await expect(page.getByText('2 × Trà đào', { exact: true })).toBeVisible();
    const receiptLink = page.getByRole('link', {
      name: 'Xem biên nhận của phiên',
      exact: true,
    });
    await expect(receiptLink).toHaveAttribute(
      'href',
      `/staff/cashier/receipts/${bankReceipt.id}`,
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await noOverflow(page);
    await page.screenshot({
      path: resolve(qaDir, 'order-history-detail-mobile.png'),
      fullPage: true,
    });
    await page
      .getByRole('navigation', { name: 'Quản trị', exact: true })
      .getByRole('link', { name: 'Nhật ký hoạt động', exact: true })
      .click();
    await page.getByLabel('Mã hành động', { exact: true }).fill('payment.completed');
    await page
      .getByLabel('Nhân viên thực hiện', { exact: true })
      .selectOption(fixture.owner.id);
    await page.getByRole('button', { name: 'Áp dụng bộ lọc', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Ghi nhận thanh toán', exact: true }),
    ).toHaveCount(2);
    await noOverflow(page);
    await page.screenshot({ path: resolve(qaDir, 'activity-mobile.png'), fullPage: true });
    expect(errors).toEqual([]);
    expect(localDate(new Date(), 'Asia/Ho_Chi_Minh')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  } finally {
    await fixture.cleanup();
  }
});

test('staff UI creates roles resets passwords disables access and enforces manager OWNER restrictions with real sessions', async ({
  page,
  browser,
}) => {
  test.setTimeout(90000);
  const fixture = await orderingFixture(),
    employeeContext = await browser.newContext({ baseURL: 'http://localhost:3000' }),
    managerContext = await browser.newContext({ baseURL: 'http://localhost:3000' });
  const employee = await employeeContext.newPage(),
    manager = await managerContext.newPage(),
    email = `staff.${randomUUID()}@e2e.test`,
    password = randomBytes(24).toString('base64url'),
    newPassword = randomBytes(24).toString('base64url');
  try {
    await login(page, fixture.owner.email, fixture.password);
    await page
      .getByRole('navigation', { name: 'Menu chính', exact: true })
      .getByRole('link', { name: 'Nhân viên', exact: true })
      .click();
    await page.getByRole('button', { name: 'Thêm nhân viên', exact: true }).click();
    await page.getByLabel('Tên nhân viên', { exact: true }).fill('Nhân viên E2E');
    await page.getByLabel('Email đăng nhập', { exact: true }).fill(email);
    await page.getByLabel('Mật khẩu mới', { exact: true }).fill(password);
    await page.getByLabel('Vai trò nhân viên', { exact: true }).selectOption('WAITER');
    await page.getByRole('button', { name: 'Lưu nhân viên', exact: true }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    const user = await fixture.db.user.findUniqueOrThrow({ where: { email } });
    await fixture.trackStaffUser(user.id);
    await login(employee, email, password);
    await employee.goto('/admin/reports');
    await expect(
      employee.getByRole('alert').filter({ hasText: 'Bạn không có quyền quản trị' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Chỉnh sửa Nhân viên E2E', exact: true }).click();
    await page.getByLabel('Vai trò nhân viên', { exact: true }).selectOption('CASHIER');
    await page.getByRole('button', { name: 'Lưu nhân viên', exact: true }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    expect((await employeeContext.request.get('/api/v1/auth/me')).status()).toBe(401);
    await login(employee, email, password);
    await page
      .getByRole('button', { name: 'Đặt lại mật khẩu Nhân viên E2E', exact: true })
      .click();
    await page.getByLabel('Mật khẩu mới', { exact: true }).fill(newPassword);
    await page
      .getByLabel('Lý do đặt lại mật khẩu', { exact: true })
      .fill('Nhân viên quên mật khẩu');
    await page.getByRole('button', { name: 'Xác nhận đặt lại mật khẩu', exact: true }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    expect((await employeeContext.request.get('/api/v1/auth/me')).status()).toBe(401);
    await login(employee, email, newPassword);
    await login(manager, fixture.manager.email, fixture.password);
    await manager.goto('/admin/staff');
    await expect(
      manager.getByRole('button', { name: 'Chỉnh sửa OWNER', exact: true }),
    ).toBeDisabled();
    await manager.getByRole('button', { name: 'Thêm nhân viên', exact: true }).click();
    await expect(
      manager.getByLabel('Vai trò nhân viên', { exact: true }).locator('option[value="OWNER"]'),
    ).toHaveCount(0);
    await manager.getByRole('button', { name: 'Hủy', exact: true }).click();
    await page.getByRole('button', { name: 'Chỉnh sửa Nhân viên E2E', exact: true }).click();
    await page
      .getByRole('checkbox', { name: 'Cho phép nhân viên đăng nhập vào nhà hàng', exact: true })
      .uncheck();
    await page.getByRole('button', { name: 'Lưu nhân viên', exact: true }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    expect((await employeeContext.request.get('/api/v1/auth/me')).status()).toBe(401);
    await employee.goto('/staff/login');
    await employee.getByLabel('Email nhân viên').fill(email);
    await employee.getByLabel('Mật khẩu', { exact: true }).fill(newPassword);
    await employee.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    await expect(
      employee.getByRole('alert').filter({ hasText: 'Email hoặc mật khẩu không đúng' }),
    ).toBeVisible();
    await page.screenshot({ path: resolve(qaDir, 'staff-admin-desktop.png'), fullPage: true });
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      await noOverflow(page);
      if (width === 390)
        await page.screenshot({
          path: resolve(qaDir, 'staff-admin-mobile.png'),
          fullPage: true,
        });
    }
    await page
      .getByRole('navigation', { name: 'Quản trị', exact: true })
      .getByRole('link', { name: 'Nhật ký hoạt động', exact: true })
      .click();
    await page.getByLabel('Mã hành động', { exact: true }).fill('staff.password_reset');
    await page.getByRole('button', { name: 'Áp dụng bộ lọc', exact: true }).click();
    await expect(page.getByText('Nhân viên quên mật khẩu', { exact: true })).toBeVisible();
    await expect(page.getByText(newPassword, { exact: true })).toHaveCount(0);
  } finally {
    await employeeContext.close();
    await managerContext.close();
    await fixture.cleanup();
  }
});
