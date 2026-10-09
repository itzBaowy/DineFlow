import { lockActiveRestaurant } from '../common/tenant-scope';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  StaffPrincipal,
  StaffCreate,
  StaffUpdate,
  StaffPassword,
  StaffListQuery,
} from '@dineflow/shared';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { hashPassword } from '../auth/password';

const include = {
  user: { select: { id: true, email: true, name: true, isActive: true } },
} as const;
type Member = Prisma.StaffMembershipGetPayload<{ include: typeof include }>;
function dto(row: Member) {
  return {
    id: row.id,
    userId: row.userId,
    email: row.user.email,
    name: row.user.name,
    role: row.role,
    isActive: row.isActive,
    userActive: row.user.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
@Injectable()
export class StaffService {
  constructor(private readonly db: PrismaService) {}
  list(restaurantId: string, query: StaffListQuery) {
    const where: Prisma.StaffMembershipWhereInput = {
      restaurantId,
      role: query.role,
      isActive: query.active === undefined ? undefined : query.active === 'true',
      ...(query.search
        ? {
            user: {
              OR: [
                { name: { contains: query.search, mode: 'insensitive' } },
                { email: { contains: query.search, mode: 'insensitive' } },
              ],
            },
          }
        : {}),
    };
    return this.db.$transaction(
      async (tx) => ({
        total: await tx.staffMembership.count({ where }),
        members: (
          await tx.staffMembership.findMany({
            where,
            include,
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            skip: (query.page - 1) * query.pageSize,
            take: query.pageSize,
          })
        ).map(dto),
        page: query.page,
        pageSize: query.pageSize,
      }),
      { isolationLevel: 'RepeatableRead' },
    );
  }
  private async run<T>(
    staff: StaffPrincipal,
    work: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.db.$transaction(async (tx) => {
        await lockActiveRestaurant(tx, staff.restaurantId);
        // Recheck inside the mutation lock: a concurrent role change cannot leave old admin powers.
        const actor = await tx.staffMembership.findFirst({
          where: {
            id: staff.membershipId,
            restaurantId: staff.restaurantId,
            userId: staff.userId,
            isActive: true,
            user: { isActive: true },
          },
        });
        if (!actor || actor.role !== staff.role || !['OWNER', 'MANAGER'].includes(actor.role))
          throw new ForbiddenException('Quyền quản lý đã thay đổi. Vui lòng đăng nhập lại');
        return work(tx);
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new ConflictException('Không thể tạo nhân viên với email này');
      throw error;
    }
  }
  private permission(staff: StaffPrincipal, targetRole: string, newRole = targetRole) {
    if (staff.role === 'MANAGER' && (targetRole === 'OWNER' || newRole === 'OWNER'))
      throw new ForbiddenException('Chỉ chủ nhà hàng được quản lý vai trò OWNER');
  }
  private async target(
    tx: Prisma.TransactionClient,
    staff: StaffPrincipal,
    id: string,
    expectedUpdatedAt: string,
  ) {
    const row = await tx.staffMembership.findFirst({
      where: { id, restaurantId: staff.restaurantId },
      include,
    });
    if (!row) throw new NotFoundException('Không tìm thấy nhân viên');
    if (row.updatedAt.getTime() !== Date.parse(expectedUpdatedAt))
      throw new ConflictException('Nhân viên đã được cập nhật. Tải lại trước khi thay đổi');
    return row;
  }
  private async singleRestaurant(
    tx: Prisma.TransactionClient,
    userId: string,
    restaurantId: string,
  ) {
    if (
      await tx.staffMembership.count({ where: { userId, restaurantId: { not: restaurantId } } })
    )
      throw new ConflictException(
        'Tài khoản dùng ở nhiều nhà hàng; không sửa thông tin chung trong MVP',
      );
  }
  async create(staff: StaffPrincipal, input: StaffCreate) {
    this.permission(staff, input.role);
    const passwordHash = await hashPassword(input.password);
    return this.run(staff, async (tx) => {
      const row = await tx.staffMembership.create({
        data: {
          restaurant: { connect: { id: staff.restaurantId } },
          role: input.role,
          user: { create: { email: input.email, name: input.name, passwordHash } },
        },
        include,
      });
      await tx.activityLog.create({
        data: {
          restaurantId: staff.restaurantId,
          actorUserId: staff.userId,
          action: 'staff.created',
          entityType: 'StaffMembership',
          entityId: row.id,
          metadata: { role: input.role, isActive: true },
        },
      });
      return dto(row);
    });
  }
  update(staff: StaffPrincipal, id: string, input: StaffUpdate) {
    return this.run(staff, async (tx) => {
      const row = await this.target(tx, staff, id, input.expectedUpdatedAt);
      this.permission(staff, row.role, input.role);
      const accessChanged = row.role !== input.role || row.isActive !== input.isActive;
      if (id === staff.membershipId && accessChanged)
        throw new ConflictException('Không tự đổi quyền hoặc khóa tài khoản đang đăng nhập');
      if (row.role === 'OWNER' && row.isActive && (input.role !== 'OWNER' || !input.isActive)) {
        if (
          (await tx.staffMembership.count({
            where: {
              restaurantId: staff.restaurantId,
              role: 'OWNER',
              isActive: true,
              user: { isActive: true },
            },
          })) <= 1
        )
          throw new ConflictException('Phải giữ ít nhất một chủ nhà hàng đang hoạt động');
      }
      if (row.user.name !== input.name) {
        await this.singleRestaurant(tx, row.userId, staff.restaurantId);
        await tx.user.update({ where: { id: row.userId }, data: { name: input.name } });
      }
      const updated = await tx.staffMembership.update({
        where: { id },
        data: { role: input.role, isActive: input.isActive, updatedAt: new Date() },
        include,
      });
      if (accessChanged)
        await tx.authSession.updateMany({
          where: { membershipId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      await tx.activityLog.create({
        data: {
          restaurantId: staff.restaurantId,
          actorUserId: staff.userId,
          action: 'staff.updated',
          entityType: 'StaffMembership',
          entityId: id,
          metadata: {
            from: `${row.role}:${row.isActive}`,
            to: `${input.role}:${input.isActive}`,
          },
        },
      });
      return dto(updated);
    });
  }
  async password(staff: StaffPrincipal, id: string, input: StaffPassword) {
    const passwordHash = await hashPassword(input.password);
    return this.run(staff, async (tx) => {
      const row = await this.target(tx, staff, id, input.expectedUpdatedAt);
      this.permission(staff, row.role);
      if (id === staff.membershipId)
        throw new ConflictException(
          'Dùng tài khoản quản lý khác để đặt lại mật khẩu của tài khoản này',
        );
      await this.singleRestaurant(tx, row.userId, staff.restaurantId);
      await tx.user.update({
        where: { id: row.userId },
        data: { passwordHash, credentialVersion: { increment: 1 } },
      });
      await tx.accountToken.updateMany({
        where: { userId: row.userId, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      await tx.mfaChallenge.updateMany({
        where: { userId: row.userId, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      await tx.platformSession.updateMany({
        where: { userId: row.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.securityEvent.create({
        data: { userId: row.userId, action: 'account.password_reset_by_manager' },
      });
      const updated = await tx.staffMembership.update({
        where: { id },
        data: { updatedAt: new Date() },
        include,
      });
      await tx.authSession.updateMany({
        where: { membershipId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.activityLog.create({
        data: {
          restaurantId: staff.restaurantId,
          actorUserId: staff.userId,
          action: 'staff.password_reset',
          entityType: 'StaffMembership',
          entityId: id,
          metadata: { reason: input.reason },
        },
      });
      return dto(updated);
    });
  }
}
