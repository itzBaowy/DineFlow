import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { StaffPrincipal } from '@dineflow/shared';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';

@Injectable()
export class SetupMutationService {
  constructor(private readonly db: PrismaService) {}
  async run<T extends { id: string }>(staff: StaffPrincipal, action: string, entityType: string, work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    try {
      return await this.db.$transaction(async tx => {
        // Setup mutations share this lock: reference validation and writes cannot race with archives.
        await tx.$queryRaw`SELECT id FROM "Restaurant" WHERE id = ${staff.restaurantId}::uuid FOR UPDATE`;
        const result = await work(tx);
        await tx.activityLog.create({ data: { restaurantId: staff.restaurantId, actorUserId: staff.userId, action, entityType, entityId: result.id } });
        return result;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') throw new ConflictException('Tên hoặc mã đã tồn tại, vui lòng chọn tên khác');
        if (error.code === 'P2025') throw new NotFoundException('Không tìm thấy dữ liệu');
      }
      throw error;
    }
  }
  async image(tx: Prisma.TransactionClient, restaurantId: string, imageUrl: string | null): Promise<void> {
    if (!imageUrl) return;
    const id = imageUrl.split('/').at(-1)!;
    if (!await tx.mediaAsset.findFirst({ where: { id, restaurantId } })) throw new BadRequestException('Ảnh không thuộc nhà hàng hoặc chưa được tải lên');
  }
}
