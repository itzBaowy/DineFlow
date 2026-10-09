import {
  ConflictException,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { CreateRestaurantInput, StaffPrincipal } from '@dineflow/shared';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { lockActiveRestaurant } from '../common/tenant-scope';

@Injectable()
export class TenancyService {
  constructor(private readonly db: PrismaService) {}
  async create(staff: StaffPrincipal, input: CreateRestaurantInput) {
    try {
      return await this.db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "PlatformSettings" WHERE id = 'global' FOR UPDATE`;
        const settings = await tx.platformSettings.findUniqueOrThrow({
          where: { id: 'global' },
        });
        if (!settings.registrationsEnabled)
          throw new ServiceUnavailableException(
            'Tạo nhà hàng đang tạm dừng. Vui lòng quay lại sau.',
          );
        await lockActiveRestaurant(tx, staff.restaurantId);
        await tx.$queryRaw`SELECT id FROM "AuthSession" WHERE id = ${staff.authSessionId}::uuid FOR UPDATE`;
        const session = await tx.authSession.findUnique({
          where: { id: staff.authSessionId },
          include: { user: true, membership: true },
        });
        if (
          !session ||
          session.userId !== staff.userId ||
          session.membershipId !== staff.membershipId ||
          session.revokedAt ||
          session.expiresAt <= new Date() ||
          !session.user.isActive ||
          !session.membership.isActive
        )
          throw new UnauthorizedException('Phiên đăng nhập không còn hiệu lực');
        if (session.membership.role !== 'OWNER')
          throw new ForbiddenException('Chỉ chủ nhà hàng được tạo thêm nhà hàng');
        const restaurant = await tx.restaurant.create({
          data: {
            name: input.restaurantName,
            slug: input.slug,
            timezone: input.timezone,
            memberships: { create: { userId: staff.userId, role: 'OWNER' } },
          },
        });
        await tx.activityLog.create({
          data: {
            restaurantId: restaurant.id,
            actorUserId: staff.userId,
            action: 'tenant.created',
            entityType: 'Restaurant',
            entityId: restaurant.id,
          },
        });
        return {
          restaurantId: restaurant.id,
          name: restaurant.name,
          slug: restaurant.slug,
          timezone: restaurant.timezone,
          status: restaurant.status,
          role: 'OWNER' as const,
        };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new ConflictException('Mã nhà hàng đã được sử dụng');
      throw error;
    }
  }
}
