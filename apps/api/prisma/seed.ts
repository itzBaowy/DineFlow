import { config } from 'dotenv';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, type Role } from '../src/generated/prisma/client';
import { hashPassword } from '../src/auth/password';

config({ path: resolve(__dirname, '../../../../.env'), quiet: true });

const catalog = [
  { name: 'Khai vị', items: [['Gỏi cuốn tôm thịt', 45000], ['Chả giò giòn', 55000], ['Gỏi ngó sen', 65000], ['Khoai tây chiên', 35000]] },
  { name: 'Món chính', items: [['Cơm chiên hải sản', 85000], ['Bò lúc lắc', 125000], ['Gà nướng mật ong', 95000], ['Cá kho tộ', 90000]] },
  { name: 'Bún & mì', items: [['Phở bò', 65000], ['Bún thịt nướng', 60000], ['Mì xào hải sản', 85000], ['Mì cay', 75000]] },
  { name: 'Đồ uống', items: [['Trà sữa', 35000], ['Trà đào', 35000], ['Cà phê sữa đá', 30000], ['Nước cam', 40000]] },
  { name: 'Tráng miệng', items: [['Chè khúc bạch', 35000], ['Bánh flan', 25000], ['Kem dừa', 40000], ['Trái cây theo mùa', 45000]] },
] as const;
const accounts: { email: string; name: string; role: Role }[] = [
  { email: 'owner@dineflow.local', name: 'Chủ nhà hàng', role: 'OWNER' },
  { email: 'manager@dineflow.local', name: 'Quản lý', role: 'MANAGER' },
  { email: 'waiter@dineflow.local', name: 'Nhân viên phục vụ', role: 'WAITER' },
  { email: 'kitchen@dineflow.local', name: 'Nhân viên bếp', role: 'KITCHEN' },
  { email: 'cashier@dineflow.local', name: 'Thu ngân', role: 'CASHIER' },
];

async function seed(): Promise<void> {
  if (process.env.NODE_ENV === 'production') throw new Error('Không chạy demo seed trong production');
  const password = process.env.SEED_DEMO_PASSWORD;
  if (!password || password.length < 12 || password.length > 128 || /GENERATE|CHANGE_ME/i.test(password)) throw new Error('SEED_DEMO_PASSWORD phải được tạo ngẫu nhiên và dài 12–128 ký tự');
  if (!process.env.DATABASE_URL) throw new Error('Thiếu DATABASE_URL');
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  try {
    const passwordHash = await hashPassword(password);
    await prisma.$transaction(async tx => {
      const restaurant = await tx.restaurant.upsert({ where: { slug: 'dineflow-demo' }, update: {}, create: { slug: 'dineflow-demo', name: 'Bếp Nhà DineFlow', address: 'Thành phố Hồ Chí Minh', timezone: 'Asia/Ho_Chi_Minh' } });
      for (const account of accounts) {
        // Re-running seed must not reset existing accounts or privileges.
        const user = await tx.user.upsert({ where: { email: account.email }, update: {}, create: { email: account.email, name: account.name, passwordHash } });
        await tx.staffMembership.upsert({ where: { userId_restaurantId: { userId: user.id, restaurantId: restaurant.id } }, update: {}, create: { userId: user.id, restaurantId: restaurant.id, role: account.role } });
      }
      for (let n = 1; n <= 10; n++) {
        const name = `Bàn ${String(n).padStart(2, '0')}`;
        await tx.diningTable.upsert({ where: { restaurantId_name: { restaurantId: restaurant.id, name } }, update: {}, create: { restaurantId: restaurant.id, name, publicCode: randomBytes(24).toString('base64url'), capacity: n > 8 ? 6 : 4, position: n } });
      }
      for (const [position, categoryData] of catalog.entries()) {
        let category = await tx.menuCategory.findFirst({ where: { restaurantId: restaurant.id, name: categoryData.name } });
        category ??= await tx.menuCategory.create({ data: { restaurantId: restaurant.id, name: categoryData.name, position } });
        for (const [itemPosition, [name, basePrice]] of categoryData.items.entries()) {
          const existing = await tx.menuItem.findFirst({ where: { restaurantId: restaurant.id, categoryId: category.id, name } });
          if (!existing) await tx.menuItem.create({ data: { restaurantId: restaurant.id, categoryId: category.id, name, basePrice, position: itemPosition, description: `${name} được chuẩn bị tại bếp nhà hàng.` } });
        }
      }
      let size = await tx.modifierGroup.findFirst({ where: { restaurantId: restaurant.id, name: 'Size' } });
      size ??= await tx.modifierGroup.create({ data: { restaurantId: restaurant.id, name: 'Size', minSelections: 1, maxSelections: 1 } });
      let topping = await tx.modifierGroup.findFirst({ where: { restaurantId: restaurant.id, name: 'Topping' } });
      topping ??= await tx.modifierGroup.create({ data: { restaurantId: restaurant.id, name: 'Topping', minSelections: 0, maxSelections: 2 } });
      for (const { group, options } of [{ group: size, options: [{ name: 'M', priceDelta: 0 }, { name: 'L', priceDelta: 5000 }] }, { group: topping, options: [{ name: 'Trân châu', priceDelta: 5000 }, { name: 'Pudding', priceDelta: 7000 }] }]) {
        for (const [position, option] of options.entries()) {
          const existing = await tx.modifierOption.findFirst({ where: { modifierGroupId: group.id, name: option.name } });
          if (!existing) await tx.modifierOption.create({ data: { restaurantId: restaurant.id, modifierGroupId: group.id, ...option, position } });
        }
      }
      const tea = await tx.menuItem.findFirstOrThrow({ where: { restaurantId: restaurant.id, name: 'Trà sữa' } });
      for (const [position, group] of [size, topping].entries()) {
        await tx.menuItemModifierGroup.upsert({ where: { menuItemId_modifierGroupId: { menuItemId: tea.id, modifierGroupId: group.id } }, update: {}, create: { restaurantId: restaurant.id, menuItemId: tea.id, modifierGroupId: group.id, position } });
      }
    }, { timeout: 30000 });
    console.log('Seed hoàn tất: 1 nhà hàng, 10 bàn, 5 danh mục, 20 món, modifiers, 5 tài khoản. Mật khẩu: SEED_DEMO_PASSWORD trong .env.');
  } finally { await prisma.$disconnect(); }
}
seed().catch((error: unknown) => { console.error(error instanceof Error ? error.message : 'Seed failed'); process.exitCode = 1; });
