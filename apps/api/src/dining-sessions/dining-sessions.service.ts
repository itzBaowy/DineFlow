import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { StaffPrincipal } from '@dineflow/shared';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import { SetupMutationService } from '../common/setup-mutation.service';

// All menu/setup/session/order writers acquire Restaurant -> DiningTable -> DiningSession.
export async function lockTable(tx: Prisma.TransactionClient, restaurantId: string, id: string) {
  await tx.$queryRaw`SELECT id FROM "DiningTable" WHERE id = ${id}::uuid AND "restaurantId" = ${restaurantId}::uuid FOR UPDATE`;
  const table = await tx.diningTable.findFirst({ where: { id, restaurantId, archivedAt: null } });
  if (!table) throw new NotFoundException('Không tìm thấy bàn');
  return table;
}
export async function lockSession(tx: Prisma.TransactionClient, tableId: string) {
  await tx.$queryRaw`SELECT id FROM "DiningSession" WHERE "tableId" = ${tableId}::uuid AND status IN ('OPEN', 'PAYMENT_REQUESTED') FOR UPDATE`;
  return tx.diningSession.findFirst({
    where: { tableId, status: { in: ['OPEN', 'PAYMENT_REQUESTED'] } },
  });
}
@Injectable()
export class DiningSessionsService {
  constructor(
    private readonly db: PrismaService,
    private readonly mutations: SetupMutationService,
  ) {}
  async list(restaurantId: string) {
    const tables = await this.db.diningTable.findMany({
      where: { restaurantId, archivedAt: null },
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
      include: {
        sessions: {
          where: { status: { in: ['OPEN', 'PAYMENT_REQUESTED'] } },
          include: { orders: { select: { totalAmount: true, status: true } } },
        },
      },
    });
    return tables.map((table) => {
      const session = table.sessions[0];
      return {
        id: table.id,
        name: table.name,
        capacity: table.capacity,
        publicCode: table.publicCode,
        status: table.status,
        session: session
          ? {
              id: session.id,
              status: session.status,
              openedAt: session.openedAt,
              orderCount: session.orders.length,
              totalAmount: session.orders
                .filter((order) => order.status !== 'CANCELLED')
                .reduce((sum, order) => sum + order.totalAmount, 0),
            }
          : null,
      };
    });
  }
  open(staff: StaffPrincipal, tableId: string) {
    return this.mutations.run(staff, 'dining_session.opened', 'DiningSession', async (tx) => {
      const table = await lockTable(tx, staff.restaurantId, tableId);
      if (table.status !== 'AVAILABLE' || (await lockSession(tx, tableId)))
        throw new ConflictException('Bàn chưa sẵn sàng hoặc đã có phiên phục vụ');
      const session = await tx.diningSession.create({
        data: { restaurantId: staff.restaurantId, tableId },
      });
      await tx.diningTable.update({ where: { id: tableId }, data: { status: 'OCCUPIED' } });
      return { id: session.id };
    });
  }
  closeEmpty(staff: StaffPrincipal, tableId: string, reason: string) {
    return this.mutations.run(staff, 'dining_session.closed_empty', 'DiningSession', async (tx) => {
      const table = await lockTable(tx, staff.restaurantId, tableId);
      const session = await lockSession(tx, tableId);
      if (table.status !== 'OCCUPIED' || !session || session.status !== 'OPEN')
        throw new ConflictException('Bàn không có phiên đang mở');
      if (await tx.order.count({ where: { diningSessionId: session.id } }))
        throw new ConflictException(
          'Phiên đã có đơn. Cần hoàn tất quy trình thanh toán để đóng bàn',
        );
      const now = new Date();
      await tx.diningSession.update({
        where: { id: session.id },
        data: { status: 'CLOSED', closedAt: now, closeReason: reason },
      });
      await tx.guestSession.updateMany({
        where: { diningSessionId: session.id, revokedAt: null },
        data: { revokedAt: now },
      });
      await tx.diningTable.update({ where: { id: tableId }, data: { status: 'NEEDS_CLEANING' } });
      return { id: session.id };
    });
  }
  clean(staff: StaffPrincipal, tableId: string) {
    return this.mutations.run(staff, 'table.cleaned', 'DiningTable', async (tx) => {
      const table = await lockTable(tx, staff.restaurantId, tableId);
      if (table.status !== 'NEEDS_CLEANING' || (await lockSession(tx, tableId)))
        throw new ConflictException(
          'Chỉ xác nhận đã dọn cho bàn đang cần dọn, không có phiên phục vụ',
        );
      await tx.diningTable.update({ where: { id: tableId }, data: { status: 'AVAILABLE' } });
      return { id: tableId };
    });
  }
}
