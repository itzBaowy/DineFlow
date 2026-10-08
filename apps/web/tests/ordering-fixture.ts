import { createRequire } from 'node:module';
import { randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import type { PrismaClient } from '../../api/src/generated/prisma/client';

const apiRequire = createRequire(resolve(__dirname, '../../api/package.json'));
const { PrismaService } = apiRequire('./dist/src/database/prisma.service.js') as {
  PrismaService: new (config: { DATABASE_URL: string }) => PrismaClient;
};
const { hashPassword } = apiRequire('./dist/src/auth/password.js') as {
  hashPassword: (password: string) => Promise<string>;
};

// Each browser flow has a private tenant; cleanup can never target the seeded demo restaurant.
export async function orderingFixture() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for browser fixtures');
  const db = new PrismaService({ DATABASE_URL: process.env.DATABASE_URL });
  const suffix = randomUUID(),
    restaurantId = randomUUID(),
    userIds = Array.from({ length: 5 }, () => randomUUID());
  const slug = `e2e-ordering-${suffix}`,
    password = randomBytes(24).toString('base64url');
  async function cleanup() {
    try {
      const restaurant = await db.restaurant.findUnique({ where: { id: restaurantId } });
      if (!restaurant) return;
      if (restaurant.slug !== slug || !slug.startsWith('e2e-ordering-'))
        throw new Error('Unsafe fixture cleanup scope');
      await db.orderItemModifier.deleteMany({ where: { restaurantId } });
      await db.orderItem.deleteMany({ where: { restaurantId } });
      await db.order.deleteMany({ where: { restaurantId } });
      await db.guestSession.deleteMany({ where: { diningSession: { restaurantId } } });
      await db.diningSession.deleteMany({ where: { restaurantId } });
      await db.diningTable.deleteMany({ where: { restaurantId } });
      await db.menuItemModifierGroup.deleteMany({ where: { restaurantId } });
      await db.menuItem.deleteMany({ where: { restaurantId } });
      await db.modifierOption.deleteMany({ where: { restaurantId } });
      await db.modifierGroup.deleteMany({ where: { restaurantId } });
      await db.menuCategory.deleteMany({ where: { restaurantId } });
      await db.activityLog.deleteMany({ where: { restaurantId } });
      await db.refreshToken.deleteMany({ where: { authSession: { userId: { in: userIds } } } });
      await db.authSession.deleteMany({ where: { userId: { in: userIds } } });
      await db.staffMembership.deleteMany({ where: { restaurantId } });
      await db.user.deleteMany({ where: { id: { in: userIds } } });
      await db.restaurant.delete({ where: { id: restaurantId } });
    } finally {
      await db.$disconnect();
    }
  }
  try {
    await db.restaurant.create({
      data: { id: restaurantId, slug, name: 'Bếp Nhà E2E', address: 'Thành phố Hồ Chí Minh' },
    });
    const passwordHash = await hashPassword(password);
    const users = await Promise.all(
      (['OWNER', 'WAITER', 'MANAGER', 'KITCHEN', 'CASHIER'] as const).map((role, index) =>
        db.user.create({
          data: {
            id: userIds[index]!,
            email: `${role.toLowerCase()}.${suffix}@e2e.test`,
            name: role,
            passwordHash,
            memberships: { create: { restaurantId, role } },
          },
        }),
      ),
    );
    const tables = await Promise.all(
      ['Bàn 01', 'Bàn 02'].map((name) =>
        db.diningTable.create({
          data: { restaurantId, name, publicCode: randomBytes(24).toString('base64url') },
        }),
      ),
    );
    const category = await db.menuCategory.create({ data: { restaurantId, name: 'Đồ uống' } });
    const group = await db.modifierGroup.create({
      data: {
        restaurantId,
        name: 'Size',
        minSelections: 1,
        maxSelections: 1,
        options: {
          create: [
            { name: 'M', priceDelta: 0 },
            { name: 'L', priceDelta: 5000 },
          ],
        },
      },
      include: { options: true },
    });
    const topping = await db.modifierGroup.create({
      data: {
        restaurantId,
        name: 'Topping',
        minSelections: 0,
        maxSelections: 1,
        options: {
          create: [
            { name: 'Trân châu', priceDelta: 5000 },
            { name: 'Pudding', priceDelta: 7000, isAvailable: false },
          ],
        },
      },
    });
    const item = await db.menuItem.create({
      data: {
        restaurantId,
        categoryId: category.id,
        name: 'Trà sữa',
        description: 'Trà thơm, sữa dịu, pha tươi theo yêu cầu.',
        basePrice: 35000,
        modifierGroups: {
          create: [{ modifierGroupId: group.id }, { modifierGroupId: topping.id }],
        },
      },
    });
    await db.menuItem.create({
      data: {
        restaurantId,
        categoryId: category.id,
        name: 'Trà đào',
        description: 'Thanh mát cùng đào tươi.',
        basePrice: 30000,
      },
    });
    await db.menuItem.create({
      data: {
        restaurantId,
        categoryId: category.id,
        name: 'Nước cam',
        basePrice: 40000,
        isAvailable: false,
      },
    });
    return {
      db,
      restaurantId,
      password,
      owner: users[0]!,
      waiter: users[1]!,
      manager: users[2]!,
      kitchen: users[3]!,
      cashier: users[4]!,
      table: tables[0]!,
      emptyTable: tables[1]!,
      item,
      cleanup,
    };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
