import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { StaffPrincipal, TableInput } from '@dineflow/shared';
import QRCode from 'qrcode';
import { PrismaService } from '../database/prisma.service';
import { SetupMutationService } from '../common/setup-mutation.service';
import { CONFIG, type AppConfig } from '../config/env';
import type { Prisma } from '../generated/prisma/client';

@Injectable()
export class TablesService {
  constructor(
    private readonly db: PrismaService,
    private readonly mutations: SetupMutationService,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}
  url(publicCode: string) {
    return `${this.config.APP_ORIGIN}/t/${publicCode}`;
  }
  async list(restaurantId: string) {
    return (
      await this.db.diningTable.findMany({
        where: { restaurantId, archivedAt: null },
        orderBy: [{ position: 'asc' }, { name: 'asc' }],
      })
    ).map((table) => ({ ...table, url: this.url(table.publicCode) }));
  }
  private async idle(tx: Prisma.TransactionClient, restaurantId: string, id: string) {
    await tx.$queryRaw`SELECT id FROM "DiningTable" WHERE id = ${id}::uuid AND "restaurantId" = ${restaurantId}::uuid FOR UPDATE`;
    const table = await tx.diningTable.findFirst({ where: { id, restaurantId, archivedAt: null } });
    if (!table) throw new NotFoundException('Không tìm thấy bàn');
    if (
      !['AVAILABLE', 'OUT_OF_SERVICE'].includes(table.status) ||
      (await tx.diningSession.count({
        where: { tableId: id, status: { in: ['OPEN', 'PAYMENT_REQUESTED'] } },
      }))
    )
      throw new ConflictException(
        'Chỉ sửa, lưu trữ hoặc đổi QR khi bàn không có phiên phục vụ và ở trạng thái sẵn sàng/tạm ngưng',
      );
    return table;
  }
  save(staff: StaffPrincipal, input: TableInput, id?: string) {
    return this.mutations.run(
      staff,
      id ? 'table.updated' : 'table.created',
      'DiningTable',
      async (tx) => {
        if (id) await this.idle(tx, staff.restaurantId, id);
        return id
          ? tx.diningTable.update({ where: { id }, data: input })
          : tx.diningTable.create({
              data: {
                ...input,
                restaurantId: staff.restaurantId,
                publicCode: randomBytes(24).toString('base64url'),
              },
            });
      },
    );
  }
  archive(staff: StaffPrincipal, id: string) {
    return this.mutations.run(staff, 'table.archived', 'DiningTable', async (tx) => {
      await this.idle(tx, staff.restaurantId, id);
      return tx.diningTable.update({
        where: { id },
        data: { archivedAt: new Date(), status: 'OUT_OF_SERVICE' },
      });
    });
  }
  regenerate(staff: StaffPrincipal, id: string) {
    return this.mutations.run(staff, 'table.qr_regenerated', 'DiningTable', async (tx) => {
      await this.idle(tx, staff.restaurantId, id);
      return tx.diningTable.update({
        where: { id },
        data: { publicCode: randomBytes(24).toString('base64url') },
      });
    });
  }
  async qr(restaurantId: string, id: string, format: 'png' | 'svg') {
    const table = await this.db.diningTable.findFirst({
      where: { id, restaurantId, archivedAt: null },
    });
    if (!table) throw new NotFoundException('Không tìm thấy bàn');
    const options = {
      margin: 4,
      width: 512,
      errorCorrectionLevel: 'M' as const,
      color: { dark: '#173e32', light: '#ffffff' },
    };
    return format === 'png'
      ? QRCode.toBuffer(this.url(table.publicCode), options)
      : QRCode.toString(this.url(table.publicCode), { ...options, type: 'svg' });
  }
  async context(publicCode: string) {
    if (!/^[A-Za-z0-9_-]{32}$/.test(publicCode))
      throw new NotFoundException('Mã bàn không hợp lệ hoặc đã được thay đổi');
    const table = await this.db.diningTable.findFirst({
      where: { publicCode, archivedAt: null, status: { not: 'OUT_OF_SERVICE' } },
      include: { restaurant: true, sessions: { where: { status: 'OPEN' }, select: { id: true } } },
    });
    if (!table) throw new NotFoundException('Mã bàn không hợp lệ hoặc bàn đang tạm ngưng');
    return {
      restaurant: {
        name: table.restaurant.name,
        logoUrl: table.restaurant.logoUrl,
        address: table.restaurant.address,
      },
      table: { name: table.name },
      orderingEnabled: table.status === 'OCCUPIED' && table.sessions.length > 0,
    };
  }
}
