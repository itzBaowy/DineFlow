import { ForbiddenException } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';

export async function lockActiveRestaurant(tx: Prisma.TransactionClient, restaurantId: string) {
  await tx.$queryRaw`SELECT id FROM "Restaurant" WHERE id = ${restaurantId}::uuid FOR UPDATE`;
  const restaurant = await tx.restaurant.findUnique({
    where: { id: restaurantId },
    select: { status: true },
  });
  if (!restaurant || restaurant.status !== 'ACTIVE')
    throw new ForbiddenException('Nhà hàng đã tạm ngừng hoạt động');
}
