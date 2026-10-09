import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import type {
  LoginInput,
  PlatformSettingsInput,
  PlatformTenantQuery,
  TenantStatusInput,
} from '@dineflow/shared';
import { PrismaService } from '../database/prisma.service';
import { DUMMY_PASSWORD_HASH, verifyPassword } from '../auth/password';
import type { Prisma } from '../generated/prisma/client';
import { CONFIG, type AppConfig } from '../config/env';
import { newTotpSecret, seal, unseal, totpCounter } from '../security/crypto';
import QRCode from 'qrcode';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const principalInclude = { user: true } as const;
type Session = Prisma.PlatformSessionGetPayload<{ include: typeof principalInclude }>;
export type PlatformActor = {
  userId: string;
  sessionId: string;
  name: string;
  email: string;
  role: 'PLATFORM_ADMIN';
  expiresAt: Date;
};
const tenantInclude = {
  memberships: {
    where: { role: 'OWNER' as const, isActive: true, user: { isActive: true } },
    select: { user: { select: { name: true, email: true } } },
  },
  _count: { select: { memberships: true, tables: true, menuItems: true } },
} as const;
function tenantDto(row: Prisma.RestaurantGetPayload<{ include: typeof tenantInclude }>) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: row.status,
    suspensionReason: row.suspensionReason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    owners: row.memberships.map((member) => member.user),
    counts: {
      staff: row._count.memberships,
      tables: row._count.tables,
      menuItems: row._count.menuItems,
    },
  };
}
@Injectable()
export class PlatformService {
  constructor(
    private readonly db: PrismaService,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}
  private actor(session: Session): PlatformActor {
    return {
      userId: session.userId,
      sessionId: session.id,
      name: session.user.name,
      email: session.user.email,
      role: 'PLATFORM_ADMIN',
      expiresAt: session.expiresAt,
    };
  }
  private valid(session: Session | null): session is Session {
    return (
      !!session &&
      !session.revokedAt &&
      session.expiresAt > new Date() &&
      session.user.isActive &&
      session.user.isPlatformAdmin &&
      session.mfaVerified &&
      !!session.user.mfaSecret &&
      session.credentialVersion === session.user.credentialVersion
    );
  }
  async login(input: LoginInput) {
    const user = await this.db.user.findUnique({ where: { email: input.email } });
    const verified = await verifyPassword(
      input.password,
      user?.passwordHash ?? DUMMY_PASSWORD_HASH,
    );
    if (!user?.isActive || !user.isPlatformAdmin || !verified) {
      if (user?.isPlatformAdmin)
        await this.db.securityEvent.create({
          data: { userId: user.id, action: 'platform.login_failed' },
        });
      throw new UnauthorizedException('Email hoặc mật khẩu không đúng');
    }
    const token = randomBytes(32).toString('base64url');
    const challenge = await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id=${user.id}::uuid FOR NO KEY UPDATE`;
      const current = await tx.user.findUnique({ where: { id: user.id } });
      if (
        !current?.isActive ||
        !current.isPlatformAdmin ||
        current.passwordHash !== user.passwordHash
      )
        throw new UnauthorizedException();
      const created = await tx.mfaChallenge.create({
        data: {
          userId: user.id,
          tokenHash: hash(token),
          expiresAt: new Date(Date.now() + 5 * 60000),
          credentialVersion: current.credentialVersion,
          setupSecret: current.mfaSecret
            ? null
            : seal(newTotpSecret(), this.config.ACCOUNT_SECURITY_KEY, `mfa:${user.id}`),
        },
      });
      return created;
    });
    return { challengeToken: token, setupRequired: !!challenge.setupSecret };
  }
  private async challenge(token: unknown) {
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token))
      throw new UnauthorizedException('Bước xác thực đã hết hạn. Đăng nhập lại.');
    const challenge = await this.db.mfaChallenge.findUnique({
      where: { tokenHash: hash(token) },
      include: { user: true },
    });
    if (
      !challenge ||
      challenge.consumedAt ||
      challenge.expiresAt <= new Date() ||
      challenge.attempts >= 5 ||
      !challenge.user.isActive ||
      !challenge.user.isPlatformAdmin ||
      challenge.credentialVersion !== challenge.user.credentialVersion
    )
      throw new UnauthorizedException('Bước xác thực đã hết hạn. Đăng nhập lại.');
    return challenge;
  }
  async setup(token: unknown) {
    const challenge = await this.challenge(token);
    if (!challenge.setupSecret || challenge.user.mfaSecret)
      throw new UnauthorizedException('Không thể thiết lập MFA trong phiên này');
    const secret = unseal(
      challenge.setupSecret,
      this.config.ACCOUNT_SECURITY_KEY,
      `mfa:${challenge.userId}`,
    );
    const uri = `otpauth://totp/${encodeURIComponent(`DineFlow:${challenge.user.email}`)}?secret=${secret}&issuer=DineFlow&algorithm=SHA1&digits=6&period=30`;
    return { secret, uri, qr: await QRCode.toDataURL(uri, { width: 240, margin: 1 }) };
  }
  async finishMfa(token: unknown, code: string) {
    const initial = await this.challenge(token),
      sessionToken = randomBytes(32).toString('base64url');
    const result = await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id=${initial.userId}::uuid FOR NO KEY UPDATE`;
      await tx.$queryRaw`SELECT id FROM "MfaChallenge" WHERE id=${initial.id}::uuid FOR UPDATE`;
      const challenge = await tx.mfaChallenge.findUniqueOrThrow({
          where: { id: initial.id },
          include: { user: true },
        }),
        user = challenge.user;
      if (
        challenge.consumedAt ||
        challenge.expiresAt <= new Date() ||
        challenge.attempts >= 5 ||
        !user.isActive ||
        !user.isPlatformAdmin ||
        challenge.credentialVersion !== user.credentialVersion
      )
        return null;
      const encrypted = user.mfaSecret ?? challenge.setupSecret;
      if (!encrypted) return null;
      const counter = totpCounter(
        unseal(encrypted, this.config.ACCOUNT_SECURITY_KEY, `mfa:${user.id}`),
        code,
        user.mfaLastCounter,
      );
      if (counter === null) {
        await tx.mfaChallenge.update({
          where: { id: challenge.id },
          data: { attempts: { increment: 1 } },
        });
        await tx.securityEvent.create({
          data: { userId: user.id, action: 'platform.mfa_failed' },
        });
        return null; // Commit the failed attempt instead of rolling it back.
      }
      await tx.user.update({
        where: { id: user.id },
        data: { mfaSecret: encrypted, mfaLastCounter: counter },
      });
      await tx.mfaChallenge.updateMany({
        where: { userId: user.id, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      if (!user.mfaSecret) {
        await tx.platformSession.updateMany({
          where: { userId: user.id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        await tx.securityEvent.create({
          data: { userId: user.id, action: 'platform.mfa_enabled' },
        });
      }
      const session = await tx.platformSession.create({
        data: {
          userId: user.id,
          tokenHash: hash(sessionToken),
          expiresAt: new Date(Date.now() + 8 * 3600000),
          credentialVersion: user.credentialVersion,
          mfaVerified: true,
        },
        include: principalInclude,
      });
      await tx.platformAudit.create({
        data: { actorUserId: user.id, action: 'platform.login', targetId: session.id },
      });
      return session;
    });
    if (!result)
      throw new UnauthorizedException('Mã xác thực sai, đã dùng hoặc bước xác thực hết hạn');
    return { token: sessionToken, principal: this.actor(result) };
  }
  async authenticate(token: unknown): Promise<PlatformActor> {
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token))
      throw new UnauthorizedException('Vui lòng đăng nhập quản trị nền tảng');
    const session = await this.db.platformSession.findUnique({
      where: { tokenHash: hash(token) },
      include: principalInclude,
    });
    if (!this.valid(session)) throw new UnauthorizedException('Phiên quản trị đã hết hạn');
    return this.actor(session);
  }
  async cancelChallenge(token: unknown) {
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) return;
    await this.db.mfaChallenge.updateMany({
      where: { tokenHash: hash(token), consumedAt: null },
      data: { consumedAt: new Date() },
    });
  }
  async logout(token: unknown) {
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) return;
    await this.db.$transaction(async (tx) => {
      const session = await tx.platformSession.findUnique({
        where: { tokenHash: hash(token) },
      });
      if (!session || session.revokedAt) return;
      const changed = await tx.platformSession.updateMany({
        where: { id: session.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (changed.count)
        await tx.platformAudit.create({
          data: {
            actorUserId: session.userId,
            action: 'platform.logout',
            targetId: session.id,
          },
        });
    });
  }
  private async recheck(tx: Prisma.TransactionClient, actor: PlatformActor) {
    const session = await tx.platformSession.findUnique({
      where: { id: actor.sessionId },
      include: principalInclude,
    });
    if (!this.valid(session) || session.userId !== actor.userId)
      throw new UnauthorizedException('Phiên quản trị không còn hiệu lực');
  }
  overview() {
    return this.db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT 1`;
        return {
          generatedAt: new Date(),
          uptimeSeconds: Math.floor(process.uptime()),
          database: 'up' as const,
          counts: {
            tenants: await tx.restaurant.count(),
            activeTenants: await tx.restaurant.count({ where: { status: 'ACTIVE' } }),
            suspendedTenants: await tx.restaurant.count({ where: { status: 'SUSPENDED' } }),
            users: await tx.user.count(),
            openSessions: await tx.diningSession.count({
              where: { status: { in: ['OPEN', 'PAYMENT_REQUESTED'] } },
            }),
          },
          settings: await tx.platformSettings.findUniqueOrThrow({ where: { id: 'global' } }),
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
  tenants(query: PlatformTenantQuery) {
    const where: Prisma.RestaurantWhereInput = {
      status: query.status,
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { slug: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    return this.db.$transaction(
      async (tx) => ({
        total: await tx.restaurant.count({ where }),
        page: query.page,
        pageSize: query.pageSize,
        tenants: (
          await tx.restaurant.findMany({
            where,
            include: tenantInclude,
            orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
            skip: (query.page - 1) * query.pageSize,
            take: query.pageSize,
          })
        ).map(tenantDto),
      }),
      { isolationLevel: 'RepeatableRead' },
    );
  }
  async status(actor: PlatformActor, id: string, input: TenantStatusInput) {
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Restaurant" WHERE id = ${id}::uuid FOR UPDATE`;
      await this.recheck(tx, actor);
      const tenant = await tx.restaurant.findUnique({ where: { id } });
      if (!tenant) throw new NotFoundException('Không tìm thấy nhà hàng');
      if (tenant.updatedAt.getTime() !== Date.parse(input.expectedUpdatedAt))
        throw new ConflictException('Nhà hàng đã thay đổi. Hãy tải lại trước khi lưu.');
      if (tenant.status === input.status)
        throw new ConflictException('Nhà hàng đã ở trạng thái này');
      const result = await tx.restaurant.update({
        where: { id },
        data: {
          status: input.status,
          suspensionReason: input.status === 'SUSPENDED' ? input.reason : null,
        },
        include: tenantInclude,
      });
      if (input.status === 'SUSPENDED') {
        await tx.authSession.updateMany({
          where: { membership: { restaurantId: id }, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        await tx.guestSession.updateMany({
          where: { diningSession: { restaurantId: id }, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      await tx.platformAudit.create({
        data: {
          actorUserId: actor.userId,
          action: input.status === 'SUSPENDED' ? 'tenant.suspended' : 'tenant.resumed',
          targetId: id,
          reason: input.reason,
        },
      });
      return tenantDto(result);
    });
  }
  async settings(actor: PlatformActor, input: PlatformSettingsInput) {
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "PlatformSettings" WHERE id = 'global' FOR UPDATE`;
      await this.recheck(tx, actor);
      const settings = await tx.platformSettings.findUniqueOrThrow({ where: { id: 'global' } });
      if (settings.updatedAt.getTime() !== Date.parse(input.expectedUpdatedAt))
        throw new ConflictException('Cấu hình đã thay đổi. Hãy tải lại trước khi lưu.');
      const result = await tx.platformSettings.update({
        where: { id: 'global' },
        data: { registrationsEnabled: input.registrationsEnabled },
      });
      await tx.platformAudit.create({
        data: {
          actorUserId: actor.userId,
          action: input.registrationsEnabled ? 'registration.enabled' : 'registration.disabled',
          targetId: 'global',
          reason: input.reason,
        },
      });
      return result;
    });
  }
  audit(query: { page: number; pageSize: number }) {
    return this.db.$transaction(
      async (tx) => ({
        total: await tx.platformAudit.count(),
        page: query.page,
        pageSize: query.pageSize,
        entries: (
          await tx.platformAudit.findMany({
            include: { actorUser: { select: { name: true, email: true } } },
            orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
            skip: (query.page - 1) * query.pageSize,
            take: query.pageSize,
          })
        ).map((row) => ({
          id: row.id,
          action: row.action,
          targetId: row.targetId,
          reason: row.reason,
          createdAt: row.createdAt,
          actor: row.actorUser,
        })),
      }),
      { isolationLevel: 'RepeatableRead' },
    );
  }
}
