import { expect, test } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const qaDir = resolve(__dirname, '../../../.local/qa');
mkdirSync(qaDir, { recursive: true });
const headers = { 'X-DineFlow-Client': 'web', Origin: 'http://localhost:3000' };

test('owner configures category, modifier, uploaded menu item, tables and printable QR through real APIs', async ({
  page,
  context,
}) => {
  test.setTimeout(90000);
  page.setDefaultTimeout(10000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const suffix = Date.now().toString();
  const names = {
    category: `QA danh mục ${suffix}`,
    group: `QA tùy chọn ${suffix}`,
    item: `QA món ${suffix}`,
    table: `QA bàn ${suffix}`,
  };
  let categoryId = '',
    groupId = '',
    itemId = '',
    tableId = '';
  await page.goto('/staff/login');
  await page.getByLabel('Email nhân viên').fill('owner@dineflow.local');
  await page.getByLabel('Mật khẩu', { exact: true }).fill(process.env.SEED_DEMO_PASSWORD!);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page).toHaveURL(/staff\/dashboard$/);
  const save = async (endpoint: string) => {
    const response = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/v1${endpoint}`) &&
        ['POST', 'PATCH'].includes(response.request().method()) &&
        response.ok(),
    );
    await page.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
    const data = (await (await response).json()) as { id: string };
    await expect(page.getByRole('dialog')).not.toBeVisible();
    return data.id;
  };
  try {
    await page.goto('/admin/categories');
    await page.getByRole('button', { name: 'Thêm danh mục', exact: true }).click();
    await page.getByLabel('Tên danh mục').fill(names.category);
    categoryId = await save('/menu/categories');
    await expect(page.getByRole('heading', { name: names.category, exact: true })).toBeVisible();
    await page.goto('/admin/modifiers');
    await page.getByRole('button', { name: 'Thêm nhóm', exact: true }).click();
    await page.getByLabel('Tên nhóm tùy chọn').fill(names.group);
    await page.getByLabel('Tên lựa chọn 1', { exact: true }).fill('Thêm topping');
    await page.getByLabel('Giá cộng thêm 1 (VND)', { exact: true }).fill('5000');
    groupId = await save('/menu/modifiers');
    await page.goto('/admin/menu');
    await expect(page.getByRole('heading', { name: 'Thực đơn của nhà hàng' })).toBeVisible();
    await expect(page.getByRole('status', { name: 'Đang tải', exact: true })).not.toBeVisible();
    await page.screenshot({ path: resolve(qaDir, 'menu-desktop.png'), fullPage: true });
    await page.getByRole('button', { name: 'Thêm món', exact: true }).click();
    await page.getByLabel('Tên món', { exact: true }).fill(names.item);
    await page.getByLabel('Danh mục', { exact: true }).selectOption({ value: categoryId });
    await page.getByLabel('Giá bán (VND)', { exact: true }).fill('45000');
    await page.getByRole('checkbox', { name: new RegExp(names.group) }).check();
    const uploaded = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/v1/storage/images') && response.request().method() === 'POST',
    );
    await page.getByLabel('Tải ảnh món ăn').setInputFiles({
      name: 'dining.jpeg',
      mimeType: 'image/jpeg',
      buffer: readFileSync(resolve(__dirname, '../public/images/dining-editorial.png')),
    });
    expect((await uploaded).status()).toBe(201);
    await expect(page.getByRole('img', { name: 'Ảnh món ăn', exact: true })).toBeVisible();
    await expect(page.getByRole('img', { name: 'Ảnh món ăn', exact: true })).toHaveJSProperty(
      'complete',
      true,
    );
    await expect(page.getByRole('img', { name: 'Ảnh món ăn', exact: true })).not.toHaveJSProperty(
      'naturalWidth',
      0,
    );
    await page.screenshot({ path: resolve(qaDir, 'menu-editor-desktop.png'), fullPage: true });
    itemId = await save('/menu/items');
    await page.reload();
    await page.getByLabel('Tìm món', { exact: true }).fill(names.item);
    await expect(page.getByRole('heading', { name: names.item, exact: true })).toBeVisible();
    await expect(page.getByText('45.000', { exact: false })).toBeVisible();
    await page.getByRole('button', { name: `Sửa ${names.item}`, exact: true }).click();
    await page.getByLabel('Giá bán (VND)', { exact: true }).fill('50000');
    await page.getByLabel('Đang bán', { exact: true }).uncheck();
    await save(`/menu/items/${itemId}`);
    await expect(page.getByText('Tạm hết', { exact: true })).toBeVisible();
    await page.goto('/admin/tables');
    await expect(page.getByRole('status', { name: 'Đang tải', exact: true })).not.toBeVisible();
    await page.screenshot({ path: resolve(qaDir, 'tables-desktop.png'), fullPage: true });
    await page.getByRole('button', { name: 'Thêm bàn', exact: true }).click();
    await page.getByLabel('Tên bàn', { exact: true }).fill(names.table);
    await page.getByLabel('Số chỗ ngồi').fill('6');
    tableId = await save('/tables');
    await page.goto(`/admin/qr-codes?table=${tableId}`);
    const card = page
      .locator('[data-print-label]')
      .filter({ has: page.getByRole('heading', { name: names.table, exact: true }) });
    const url = await card.locator('a').getAttribute('href');
    await expect(
      card.getByRole('img', { name: `Mã QR ${names.table}`, exact: true }),
    ).toBeVisible();
    await page.waitForFunction(() =>
      [...document.querySelectorAll('img')].every((img) => img.complete && img.naturalWidth > 0),
    );
    const downloaded = page.waitForEvent('download');
    await card.getByRole('button', { name: 'PNG', exact: true }).click();
    expect((await downloaded).suggestedFilename()).toMatch(/\.png$/);
    await page.emulateMedia({ media: 'print' });
    await page.pdf({
      path: resolve(qaDir, 'qr-labels.pdf'),
      format: 'A4',
      preferCSSPageSize: true,
      printBackground: true,
    });
    expect(await page.locator('[data-print-label]:visible').count()).toBe(1);
    await page.emulateMedia({ media: 'screen' });
    await page.getByRole('button', { name: 'Chọn tất cả', exact: true }).click();
    await expect(page.getByRole('button', { name: 'In nhãn đã chọn', exact: true })).toBeEnabled();
    await page.emulateMedia({ media: 'print' });
    await page.pdf({
      path: resolve(qaDir, 'qr-all-labels.pdf'),
      format: 'A4',
      preferCSSPageSize: true,
      printBackground: true,
    });
    expect(await page.locator('[data-print-label]:visible').count()).toBe(11);
    await page.emulateMedia({ media: 'screen' });
    await page.screenshot({ path: resolve(qaDir, 'qr-desktop.png'), fullPage: true });
    await card.getByRole('button', { name: 'Đổi mã QR', exact: true }).click();
    await page.getByRole('button', { name: 'Xác nhận', exact: true }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await page.goto(url!);
    await expect(page.getByRole('alert').filter({ hasText: 'Mã bàn không hợp lệ' })).toBeVisible();
    await page.goto('/admin/settings');
    await page.getByRole('button', { name: 'Chỉnh sửa thông tin', exact: true }).click();
    const phone = await page.getByLabel('Số điện thoại', { exact: true }).inputValue();
    await page.getByLabel('Số điện thoại', { exact: true }).fill('0901234567');
    await save('/restaurant/settings');
    await expect(page.getByText('0901234567', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Chỉnh sửa thông tin', exact: true }).click();
    await page.getByLabel('Số điện thoại', { exact: true }).fill(phone);
    await save('/restaurant/settings');
    expect(errors).toEqual([]);
  } finally {
    for (const path of [
      itemId && `/menu/items/${itemId}`,
      groupId && `/menu/modifiers/${groupId}`,
      categoryId && `/menu/categories/${categoryId}`,
      tableId && `/tables/${tableId}`,
    ].filter(Boolean)) {
      const response = await context.request.delete(`/api/v1${path}`, { headers, data: {} });
      expect(response.ok()).toBeTruthy();
    }
  }
});

test('mobile setup stays within viewport and public QR context reveals no session history', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/staff/login');
  await page.getByLabel('Email nhân viên').fill('manager@dineflow.local');
  await page.getByLabel('Mật khẩu', { exact: true }).fill(process.env.SEED_DEMO_PASSWORD!);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page).toHaveURL(/staff\/dashboard$/);
  for (const [route, title] of [
    ['menu', 'Thực đơn của nhà hàng'],
    ['categories', 'Danh mục món ăn'],
    ['modifiers', 'Size & topping'],
    ['tables', 'Bàn phục vụ'],
    ['qr-codes', 'Mã QR tại bàn'],
  ] as const) {
    await page.goto(`/admin/${route}`);
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
    await expect(page.getByRole('status', { name: 'Đang tải', exact: true })).not.toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBeTruthy();
    if (route === 'qr-codes')
      await page.waitForFunction(() =>
        [...document.querySelectorAll('img')].every((img) => img.complete && img.naturalWidth > 0),
      );
    await page.screenshot({ path: resolve(qaDir, `${route}-mobile.png`), fullPage: true });
  }
  const url = await page
    .getByRole('link', { name: 'Xem trang bàn', exact: true })
    .first()
    .getAttribute('href');
  await page.goto(url!);
  await expect(page.getByRole('heading', { name: 'Chào mừng bạn đến bàn' })).toBeVisible();
  await page.screenshot({ path: resolve(qaDir, 'public-table-mobile.png'), fullPage: true });
});
