import { z } from 'zod';
import { loadEnv } from '../src/config/env';
import { PrismaService } from '../src/database/prisma.service';
import { hashPassword } from '../src/auth/password';

async function bootstrap() {
  const config = loadEnv();
  const input = z
    .object({
      PLATFORM_ADMIN_EMAIL: z.string().trim().toLowerCase().pipe(z.email()),
      PLATFORM_ADMIN_NAME: z.string().trim().min(2).max(120),
      PLATFORM_ADMIN_PASSWORD: z
        .string()
        .min(12)
        .max(128)
        .refine((value) => !/GENERATE|CHANGE_ME/.test(value)),
    })
    .parse(process.env);
  const db = new PrismaService(config);
  try {
    const existing = await db.user.findUnique({
      where: { email: input.PLATFORM_ADMIN_EMAIL },
      include: { memberships: true },
    });
    if (existing) {
      if (!existing.isPlatformAdmin || existing.memberships.length)
        throw new Error('Email đã thuộc tài khoản khác; không tự cấp quyền platform admin.');
      console.log('Platform admin đã tồn tại; giữ nguyên mật khẩu/quyền.');
      return;
    }
    const passwordHash = await hashPassword(input.PLATFORM_ADMIN_PASSWORD);
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "PlatformSettings" WHERE id = 'global' FOR UPDATE`;
      if (await tx.user.count({ where: { isPlatformAdmin: true } }))
        throw new Error('Platform admin đã có; không tự tạo admin thứ hai.');
      const user = await tx.user.create({
        data: {
          email: input.PLATFORM_ADMIN_EMAIL,
          name: input.PLATFORM_ADMIN_NAME,
          passwordHash,
          isPlatformAdmin: true,
        },
      });
      await tx.platformAudit.create({
        data: { actorUserId: user.id, action: 'platform.bootstrapped', targetId: user.id },
      });
    });
    console.log(
      'Đã tạo platform admin. Credentials nằm trong .env; không có membership nhà hàng.',
    );
  } finally {
    await db.$disconnect();
  }
}
bootstrap().catch((error: unknown) => {
  console.error(
    error instanceof z.ZodError
      ? 'Thiếu cấu hình PLATFORM_ADMIN_EMAIL/NAME/PASSWORD hợp lệ trong .env.'
      : error instanceof Error
        ? error.message
        : 'Bootstrap platform admin failed',
  );
  process.exitCode = 1;
});
