import { BadRequestException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { CONFIG, type AppConfig } from '../config/env';
import { PrismaService } from '../database/prisma.service';
import type { Prisma, User } from '../generated/prisma/client';
import { hashPassword, verifyPassword } from '../auth/password';
import { seal, tokenHash } from './crypto';

@Injectable()
export class AccountService {
  constructor(
    private readonly db: PrismaService,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}
  async issue(
    tx: Prisma.TransactionClient,
    user: User,
    kind: 'VERIFY_EMAIL' | 'RESET_PASSWORD',
  ) {
    const token = randomBytes(32).toString('base64url'),
      expiresAt = new Date(Date.now() + (kind === 'VERIFY_EMAIL' ? 24 * 3600000 : 30 * 60000));
    await tx.accountToken.updateMany({
      where: { userId: user.id, kind, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    await tx.accountToken.create({
      data: {
        userId: user.id,
        kind,
        tokenHash: tokenHash(token),
        credentialVersion: user.credentialVersion,
        expiresAt,
      },
    });
    const link = `${this.config.APP_ORIGIN}/${kind === 'VERIFY_EMAIL' ? 'verify-email' : 'reset-password'}#token=${token}`;
    await tx.emailOutbox.create({
      data: {
        userId: user.id,
        expiresAt,
        payload: seal(
          JSON.stringify({
            to: user.email,
            subject:
              kind === 'VERIFY_EMAIL'
                ? 'DineFlow — Xác minh email'
                : 'DineFlow — Đặt lại mật khẩu',
            text: `${kind === 'VERIFY_EMAIL' ? 'Xác minh email của bạn trong 24 giờ' : 'Đặt lại mật khẩu trong 30 phút'}:\n${link}\n\nNếu không yêu cầu thao tác này, bạn có thể bỏ qua email.`,
          }),
          this.config.ACCOUNT_SECURITY_KEY,
          `email:${user.id}`,
        ),
      },
    });
  }
  async request(email: string, kind: 'VERIFY_EMAIL' | 'RESET_PASSWORD') {
    const user = await this.db.user.findUnique({ where: { email } });
    if (!user?.isActive || (kind === 'VERIFY_EMAIL' && user.emailVerifiedAt)) return;
    await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id=${user.id}::uuid FOR NO KEY UPDATE`;
      const current = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
      if (!current.isActive || (kind === 'VERIFY_EMAIL' && current.emailVerifiedAt)) return;
      const recent = await tx.accountToken.findFirst({
        where: { userId: user.id, kind, createdAt: { gt: new Date(Date.now() - 60000) } },
      });
      if (recent) return;
      await this.issue(tx, current, kind);
      await tx.securityEvent.create({
        data: {
          userId: user.id,
          action:
            kind === 'VERIFY_EMAIL'
              ? 'account.verification_requested'
              : 'account.reset_requested',
        },
      });
    });
  }
  private async consume(
    token: string,
    kind: 'VERIFY_EMAIL' | 'RESET_PASSWORD',
    passwordHash?: string,
  ) {
    const stored = await this.db.accountToken.findUnique({
      where: { tokenHash: tokenHash(token) },
    });
    if (!stored || stored.kind !== kind)
      throw new BadRequestException('Liên kết không hợp lệ hoặc đã hết hạn');
    await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id=${stored.userId}::uuid FOR NO KEY UPDATE`;
      const user = await tx.user.findUniqueOrThrow({ where: { id: stored.userId } });
      const current = await tx.accountToken.findUniqueOrThrow({ where: { id: stored.id } });
      if (
        !user.isActive ||
        current.consumedAt ||
        current.expiresAt <= new Date() ||
        current.credentialVersion !== user.credentialVersion
      )
        throw new BadRequestException('Liên kết không hợp lệ hoặc đã hết hạn');
      if (kind === 'VERIFY_EMAIL') {
        await tx.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
        await tx.accountToken.updateMany({
          where: { userId: user.id, kind, consumedAt: null },
          data: { consumedAt: new Date() },
        });
        await tx.securityEvent.create({
          data: { userId: user.id, action: 'account.email_verified' },
        });
      } else await this.replacePassword(tx, user.id, passwordHash!, 'account.password_reset');
    });
  }
  verify(token: string) {
    return this.consume(token, 'VERIFY_EMAIL');
  }
  async reset(token: string, password: string) {
    await this.consume(token, 'RESET_PASSWORD', await hashPassword(password));
  }
  private async replacePassword(
    tx: Prisma.TransactionClient,
    userId: string,
    passwordHash: string,
    action: string,
  ) {
    await tx.user.update({
      where: { id: userId },
      data: { passwordHash, credentialVersion: { increment: 1 } },
    });
    await tx.accountToken.updateMany({
      where: { userId, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    await tx.mfaChallenge.updateMany({
      where: { userId, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    await tx.authSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await tx.platformSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await tx.securityEvent.create({ data: { userId, action } });
  }
  async change(
    userId: string,
    sessionId: string,
    platform: boolean,
    currentPassword: string,
    password: string,
  ) {
    const next = await hashPassword(password);
    await this.db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "User" WHERE id=${userId}::uuid FOR NO KEY UPDATE`;
        const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
        const session = platform
          ? await tx.platformSession.findUnique({ where: { id: sessionId } })
          : await tx.authSession.findUnique({ where: { id: sessionId } });
        if (
          !session ||
          session.userId !== userId ||
          session.revokedAt ||
          session.expiresAt <= new Date() ||
          session.credentialVersion !== user.credentialVersion ||
          (platform &&
            (!user.isPlatformAdmin ||
              !user.mfaSecret ||
              !('mfaVerified' in session) ||
              !session.mfaVerified)) ||
          !user.isActive ||
          !(await verifyPassword(currentPassword, user.passwordHash))
        )
          throw new UnauthorizedException('Mật khẩu hiện tại hoặc phiên không hợp lệ');
        await this.replacePassword(tx, userId, next, 'account.password_changed');
      },
      { timeout: 10000 },
    );
  }
  async status(userId: string) {
    const user = await this.db.user.findUniqueOrThrow({ where: { id: userId } });
    return {
      email: user.email,
      emailVerified: !!user.emailVerifiedAt,
      verificationRequired: user.requiresEmailVerification,
    };
  }
  // Operator-only recovery: deliberately not exposed through an HTTP controller.
  async recoverMfa(email: string, password: string, reason: string) {
    const initial = await this.db.user.findUnique({ where: { email } });
    if (!initial) throw new UnauthorizedException('Không thể khôi phục MFA');
    await this.db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "User" WHERE id=${initial.id}::uuid FOR NO KEY UPDATE`;
        const user = await tx.user.findUniqueOrThrow({ where: { id: initial.id } });
        if (
          !user.isActive ||
          !user.isPlatformAdmin ||
          !(await verifyPassword(password, user.passwordHash))
        )
          throw new UnauthorizedException('Không thể khôi phục MFA');
        await tx.user.update({
          where: { id: user.id },
          data: { mfaSecret: null, mfaLastCounter: null, credentialVersion: { increment: 1 } },
        });
        await tx.platformSession.updateMany({
          where: { userId: user.id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        await tx.authSession.updateMany({
          where: { userId: user.id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        await tx.mfaChallenge.updateMany({
          where: { userId: user.id, consumedAt: null },
          data: { consumedAt: new Date() },
        });
        await tx.accountToken.updateMany({
          where: { userId: user.id, consumedAt: null },
          data: { consumedAt: new Date() },
        });
        await tx.securityEvent.create({
          data: { userId: user.id, action: 'platform.mfa_recovered' },
        });
        await tx.platformAudit.create({
          data: {
            actorUserId: user.id,
            action: 'platform.mfa_recovered',
            targetId: user.id,
            reason,
          },
        });
      },
      { timeout: 10000 },
    );
  }
}
