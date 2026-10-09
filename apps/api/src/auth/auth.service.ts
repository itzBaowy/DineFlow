import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'node:crypto';
import type { StaffLoginInput, StaffPrincipal } from '@dineflow/shared';
import { PrismaService } from '../database/prisma.service';
import { CONFIG, type AppConfig } from '../config/env';
import type { AccessClaims } from './auth.types';
import { DUMMY_PASSWORD_HASH, verifyPassword } from './password';
import type { Prisma } from '../generated/prisma/client';
import { lockActiveRestaurant } from '../common/tenant-scope';

const authInclude = { user: true, membership: { include: { restaurant: true } } } as const;
type SessionWithPrincipal = Prisma.AuthSessionGetPayload<{ include: typeof authInclude }>;
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  private principal(session: SessionWithPrincipal): StaffPrincipal {
    return {
      userId: session.userId,
      membershipId: session.membershipId,
      authSessionId: session.id,
      restaurantId: session.membership.restaurantId,
      email: session.user.email,
      name: session.user.name,
      role: session.membership.role,
      restaurant: {
        name: session.membership.restaurant.name,
        currency: 'VND',
        timezone: session.membership.restaurant.timezone,
        logoUrl: session.membership.restaurant.logoUrl,
      },
    };
  }
  private isValid(session: SessionWithPrincipal): boolean {
    return (
      !session.revokedAt &&
      session.expiresAt > new Date() &&
      session.user.isActive &&
      session.membership.isActive &&
      session.membership.restaurant.status === 'ACTIVE'
    );
  }
  private async credentials(session: SessionWithPrincipal, refreshToken: string) {
    const accessToken = await this.jwt.signAsync(
      { sub: session.userId, sid: session.id, type: 'staff_access' } satisfies AccessClaims,
      {
        secret: this.config.JWT_ACCESS_SECRET,
        algorithm: 'HS256',
        issuer: 'dineflow',
        audience: 'dineflow-staff',
        expiresIn: this.config.ACCESS_TOKEN_TTL_SECONDS,
      },
    );
    return {
      accessToken,
      refreshToken,
      expiresAt: session.expiresAt,
      staff: this.principal(session),
    };
  }
  async restaurants(userId: string) {
    const memberships = await this.prisma.staffMembership.findMany({
      where: { userId, isActive: true, user: { isActive: true } },
      include: { restaurant: true },
      orderBy: [{ restaurant: { name: 'asc' } }, { id: 'asc' }],
    });
    return {
      restaurants: memberships.map(({ restaurant, role }) => ({
        restaurantId: restaurant.id,
        name: restaurant.name,
        slug: restaurant.slug,
        timezone: restaurant.timezone,
        status: restaurant.status,
        role,
      })),
    };
  }
  async login(input: StaffLoginInput) {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email },
      include: {
        memberships: {
          where: { isActive: true, restaurant: { status: 'ACTIVE' } },
          include: { restaurant: true },
        },
      },
    });
    const validPassword = await verifyPassword(
      input.password,
      user?.passwordHash ?? DUMMY_PASSWORD_HASH,
    );
    if (!user?.isActive || !validPassword || !user.memberships.length)
      throw new UnauthorizedException('Email hoặc mật khẩu không đúng');
    if (!input.restaurantId && user.memberships.length > 1) {
      const choices = await this.restaurants(user.id);
      return {
        selectionRequired: true as const,
        restaurants: choices.restaurants.filter((row) => row.status === 'ACTIVE'),
      };
    }
    const membership = input.restaurantId
      ? user.memberships.find((row) => row.restaurantId === input.restaurantId)
      : user.memberships[0];
    if (!membership) throw new UnauthorizedException('Email hoặc mật khẩu không đúng');
    const refreshToken = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + this.config.REFRESH_TOKEN_TTL_SECONDS * 1000);
    const session = await this.prisma.$transaction(async (tx) => {
      await lockActiveRestaurant(tx, membership.restaurantId);
      const created = await tx.authSession.create({
        data: {
          userId: user.id,
          membershipId: membership.id,
          expiresAt,
          refreshTokens: { create: { tokenHash: hashToken(refreshToken), expiresAt } },
        },
        include: authInclude,
      });
      if (!this.isValid(created))
        throw new UnauthorizedException('Email hoặc mật khẩu không đúng');
      await tx.activityLog.create({
        data: {
          restaurantId: membership.restaurantId,
          actorUserId: user.id,
          action: 'auth.login',
          entityType: 'AuthSession',
          entityId: created.id,
        },
      });
      return created;
    });
    return this.credentials(session, refreshToken);
  }
  async switchRestaurant(staff: StaffPrincipal, restaurantId: string) {
    if (restaurantId === staff.restaurantId)
      throw new ConflictException('Bạn đang làm việc tại nhà hàng này');
    const refreshToken = randomBytes(32).toString('base64url');
    const session = await this.prisma.$transaction(async (tx) => {
      // Same lock order as suspension: restaurants first, then the auth session.
      const ids = [staff.restaurantId, restaurantId].sort();
      for (const id of ids)
        await tx.$queryRaw`SELECT id FROM "Restaurant" WHERE id = ${id}::uuid FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM "AuthSession" WHERE id = ${staff.authSessionId}::uuid FOR UPDATE`;
      const current = await tx.authSession.findUnique({
        where: { id: staff.authSessionId },
        include: authInclude,
      });
      if (!current || current.userId !== staff.userId || !this.isValid(current))
        throw new UnauthorizedException('Phiên đăng nhập không còn hiệu lực');
      const membership = await tx.staffMembership.findFirst({
        where: {
          restaurantId,
          userId: staff.userId,
          isActive: true,
          restaurant: { status: 'ACTIVE' },
        },
      });
      if (!membership) throw new NotFoundException('Không thể truy cập nhà hàng này');
      await tx.authSession.update({
        where: { id: current.id },
        data: { revokedAt: new Date() },
      });
      const next = await tx.authSession.create({
        data: {
          userId: staff.userId,
          membershipId: membership.id,
          expiresAt: current.expiresAt,
          refreshTokens: {
            create: { tokenHash: hashToken(refreshToken), expiresAt: current.expiresAt },
          },
        },
        include: authInclude,
      });
      await tx.activityLog.createMany({
        data: [
          {
            restaurantId: staff.restaurantId,
            actorUserId: staff.userId,
            action: 'auth.tenant_left',
            entityType: 'AuthSession',
            entityId: current.id,
          },
          {
            restaurantId,
            actorUserId: staff.userId,
            action: 'auth.tenant_entered',
            entityType: 'AuthSession',
            entityId: next.id,
          },
        ],
      });
      return next;
    });
    return this.credentials(session, refreshToken);
  }
  async authenticate(token: string): Promise<StaffPrincipal> {
    let claims: AccessClaims;
    try {
      claims = await this.jwt.verifyAsync<AccessClaims>(token, {
        secret: this.config.JWT_ACCESS_SECRET,
        algorithms: ['HS256'],
        issuer: 'dineflow',
        audience: 'dineflow-staff',
      });
    } catch {
      throw new UnauthorizedException('Phiên đăng nhập đã hết hạn');
    }
    if (
      claims.type !== 'staff_access' ||
      typeof claims.sid !== 'string' ||
      typeof claims.sub !== 'string' ||
      !/^[0-9a-f-]{36}$/i.test(claims.sid)
    )
      throw new UnauthorizedException('Phiên đăng nhập không hợp lệ');
    const session = await this.prisma.authSession.findUnique({
      where: { id: claims.sid },
      include: authInclude,
    });
    if (!session || session.userId !== claims.sub || !this.isValid(session))
      throw new UnauthorizedException('Phiên đăng nhập không còn hiệu lực');
    return this.principal(session);
  }
  async refresh(token: string) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token))
      throw new UnauthorizedException('Phiên đăng nhập không hợp lệ');
    const nextToken = randomBytes(32).toString('base64url');
    const session = await this.prisma.$transaction(async (tx) => {
      const stored = await tx.refreshToken.findUnique({
        where: { tokenHash: hashToken(token) },
      });
      if (!stored) return null;
      await tx.$queryRaw`SELECT id FROM "AuthSession" WHERE id = ${stored.authSessionId}::uuid FOR UPDATE`;
      const current = await tx.refreshToken.findUniqueOrThrow({
        where: { id: stored.id },
        include: { authSession: { include: authInclude } },
      });
      if (current.usedAt) {
        await tx.authSession.update({
          where: { id: current.authSessionId },
          data: { revokedAt: new Date() },
        });
        await tx.activityLog.create({
          data: {
            restaurantId: current.authSession.membership.restaurantId,
            actorUserId: current.authSession.userId,
            action: 'auth.refresh_replay',
            entityType: 'AuthSession',
            entityId: current.authSessionId,
          },
        });
        return null; // Commit revocation before reporting 401.
      }
      if (!this.isValid(current.authSession) || current.expiresAt <= new Date()) return null;
      await tx.refreshToken.update({ where: { id: current.id }, data: { usedAt: new Date() } });
      await tx.refreshToken.create({
        data: {
          authSessionId: current.authSessionId,
          tokenHash: hashToken(nextToken),
          expiresAt: current.authSession.expiresAt,
        },
      });
      return current.authSession;
    });
    if (!session)
      throw new UnauthorizedException(
        'Phiên đăng nhập không còn hiệu lực, vui lòng đăng nhập lại',
      );
    return this.credentials(session, nextToken);
  }
  async logout(token: unknown): Promise<void> {
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) return;
    await this.prisma.$transaction(async (tx) => {
      const stored = await tx.refreshToken.findUnique({
        where: { tokenHash: hashToken(token) },
      });
      if (!stored) return;
      await tx.$queryRaw`SELECT id FROM "AuthSession" WHERE id = ${stored.authSessionId}::uuid FOR UPDATE`;
      const session = await tx.authSession.findUniqueOrThrow({
        where: { id: stored.authSessionId },
        include: authInclude,
      });
      if (session.revokedAt) return;
      await tx.authSession.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      });
      await tx.activityLog.create({
        data: {
          restaurantId: session.membership.restaurantId,
          actorUserId: session.userId,
          action: 'auth.logout',
          entityType: 'AuthSession',
          entityId: session.id,
        },
      });
    });
  }
}
