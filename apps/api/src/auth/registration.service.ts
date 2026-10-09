import { ConflictException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { RegisterInput } from '@dineflow/shared';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { hashPassword } from './password';

@Injectable()
export class RegistrationService {
  constructor(private readonly db: PrismaService) {}
  async settings() {
    const settings = await this.db.platformSettings.findUniqueOrThrow({
      where: { id: 'global' },
    });
    return { registrationsEnabled: settings.registrationsEnabled };
  }
  async register(input: RegisterInput) {
    const passwordHash = await hashPassword(input.password);
    try {
      return await this.db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "PlatformSettings" WHERE id = 'global' FOR UPDATE`;
        const settings = await tx.platformSettings.findUniqueOrThrow({
          where: { id: 'global' },
        });
        if (!settings.registrationsEnabled)
          throw new ServiceUnavailableException(
            'Đăng ký đang tạm dừng. Vui lòng quay lại sau.',
          );
        const restaurant = await tx.restaurant.create({
          data: { name: input.restaurantName, slug: input.slug, timezone: input.timezone },
        });
        const user = await tx.user.create({
          data: {
            email: input.email,
            name: input.name,
            passwordHash,
            memberships: { create: { restaurantId: restaurant.id, role: 'OWNER' } },
          },
        });
        await tx.activityLog.create({
          data: {
            restaurantId: restaurant.id,
            actorUserId: user.id,
            action: 'tenant.registered',
            entityType: 'Restaurant',
            entityId: restaurant.id,
          },
        });
        return { restaurantId: restaurant.id };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new ConflictException('Email hoặc mã nhà hàng đã được sử dụng.');
      throw error;
    }
  }
}
