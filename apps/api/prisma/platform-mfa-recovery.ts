import { z } from 'zod';
import { loadEnv } from '../src/config/env';
import { PrismaService } from '../src/database/prisma.service';
import { AccountService } from '../src/security/account.service';

async function recover() {
  const config = loadEnv();
  const input = z
    .object({
      PLATFORM_RECOVERY_EMAIL: z.string().trim().toLowerCase().pipe(z.email()),
      PLATFORM_RECOVERY_PASSWORD: z.string().min(1).max(128),
      PLATFORM_RECOVERY_REASON: z.string().trim().min(10).max(500),
    })
    .parse(process.env);
  delete process.env.PLATFORM_RECOVERY_PASSWORD;
  const db = new PrismaService(config);
  try {
    await new AccountService(db, config).recoverMfa(
      input.PLATFORM_RECOVERY_EMAIL,
      input.PLATFORM_RECOVERY_PASSWORD,
      input.PLATFORM_RECOVERY_REASON,
    );
    console.log(
      'Đã thu hồi các phiên và MFA cũ. Admin phải thiết lập Authenticator mới khi đăng nhập.',
    );
  } finally {
    await db.$disconnect();
  }
}
recover().catch(() => {
  console.error(
    'Khôi phục MFA thất bại. Cần email admin đang hoạt động, mật khẩu hiện tại và lý do hợp lệ.',
  );
  process.exitCode = 1;
});
