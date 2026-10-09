import { lockActiveRestaurant } from './tenant-scope';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { StaffPrincipal } from '@dineflow/shared';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { RealtimeService } from '../realtime/realtime.service';

@Injectable()
export class SetupMutationService {
  constructor(
    private readonly db: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}
  async run<T extends { id: string }>(
    staff: StaffPrincipal,
    action: string,
    entityType: string,
    work: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    try {
      const result = await this.db.$transaction(async (tx) => {
        // Setup mutations share this lock: reference validation and writes cannot race with archives.
        await lockActiveRestaurant(tx, staff.restaurantId);
        const result = await work(tx);
        await tx.activityLog.create({
          data: {
            restaurantId: staff.restaurantId,
            actorUserId: staff.userId,
            action,
            entityType,
            entityId: result.id,
          },
        });
        return result;
      });
      if (entityType === 'DiningTable')
        await this.realtime.publish('table.status_changed', {
          restaurantId: staff.restaurantId,
          tableId: result.id,
        });
      if (entityType === 'Restaurant')
        await this.realtime.publish('billing.updated', { restaurantId: staff.restaurantId });
      if (entityType === 'DiningSession') {
        const session = await this.db.diningSession
          .findUnique({ where: { id: result.id }, select: { id: true, tableId: true } })
          .catch(() => null);
        if (session)
          await this.realtime.publish(
            action === 'dining_session.closed_empty'
              ? 'dining_session.closed'
              : 'table.status_changed',
            {
              restaurantId: staff.restaurantId,
              tableId: session.tableId,
              diningSessionId: session.id,
            },
          );
      }
      return result;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002')
          throw new ConflictException('Tên hoặc mã đã tồn tại, vui lòng chọn tên khác');
        if (error.code === 'P2025') throw new NotFoundException('Không tìm thấy dữ liệu');
      }
      throw error;
    }
  }
  async image(
    tx: Prisma.TransactionClient,
    restaurantId: string,
    imageUrl: string | null,
  ): Promise<void> {
    if (!imageUrl) return;
    const id = imageUrl.split('/').at(-1)!;
    if (!(await tx.mediaAsset.findFirst({ where: { id, restaurantId } })))
      throw new BadRequestException('Ảnh không thuộc nhà hàng hoặc chưa được tải lên');
  }
}
