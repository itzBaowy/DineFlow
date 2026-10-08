import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  menuInputSchema,
  modifierInputSchema,
  restaurantInputSchema,
  tableInputSchema,
} from './setup';

test('setup rejects money fractions, arbitrary image URLs and foreign scope overrides', () => {
  const menu = {
    name: 'Trà',
    description: null,
    categoryId: '187780c4-32a9-4a1c-b79b-563f8797a6a1',
    imageUrl: null,
    basePrice: 35000,
    isAvailable: true,
    position: 0,
    modifierGroupIds: [],
  };
  assert.equal(menuInputSchema.safeParse(menu).success, true);
  for (const extra of [
    { basePrice: -1 },
    { basePrice: 0.5 },
    { imageUrl: 'https://attacker.example/image.svg' },
    { imageUrl: '/api/v1/storage/images/' + '-'.repeat(36) },
    { restaurantId: menu.categoryId },
  ])
    assert.equal(menuInputSchema.safeParse({ ...menu, ...extra }).success, false);
  assert.equal(
    tableInputSchema.safeParse({ name: 'Bàn', capacity: 4, position: 0, status: 'OCCUPIED' })
      .success,
    false,
  );
});
test('modifier minimum is bounded by available options and option IDs cannot repeat', () => {
  const group = {
    name: 'Size',
    minSelections: 1,
    maxSelections: 1,
    position: 0,
    options: [{ name: 'M', priceDelta: 0, isAvailable: true, position: 0 }],
  };
  assert.equal(modifierInputSchema.safeParse(group).success, true);
  assert.equal(modifierInputSchema.safeParse({ ...group, minSelections: 2 }).success, false);
  assert.equal(
    modifierInputSchema.safeParse({
      ...group,
      options: [{ ...group.options[0], isAvailable: false }],
    }).success,
    false,
  );
});
test('restaurant validates real timezones and basis points', () => {
  const settings = {
    name: 'Bếp Nhà',
    address: null,
    phone: null,
    logoUrl: null,
    timezone: 'Asia/Ho_Chi_Minh',
    serviceChargeBps: 500,
    taxBps: 800,
  };
  assert.equal(restaurantInputSchema.safeParse(settings).success, true);
  assert.equal(
    restaurantInputSchema.safeParse({ ...settings, timezone: 'Fake/Zone' }).success,
    false,
  );
  assert.equal(restaurantInputSchema.safeParse({ ...settings, taxBps: 10001 }).success, false);
});
