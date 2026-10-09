import { z } from 'zod';
import { loginSchema } from './identity';
import { platformPrincipalSchema } from './saas';
const password = z.string().min(12, 'Mật khẩu tối thiểu 12 ký tự').max(128);
export const emailRequestSchema = loginSchema.pick({ email: true });
export const accountTokenSchema = z
  .object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/, 'Liên kết không hợp lệ') })
  .strict();
export const resetPasswordSchema = accountTokenSchema.extend({ password });
export const changePasswordSchema = z
  .object({ currentPassword: z.string().min(1).max(128), password })
  .strict();
export const acceptedSchema = z.object({ accepted: z.literal(true) });
export const accountSecuritySchema = z.object({
  email: z.email(),
  emailVerified: z.boolean(),
  verificationRequired: z.boolean(),
});
export const mfaCodeSchema = z
  .object({ code: z.string().regex(/^\d{6}$/, 'Nhập mã 6 chữ số') })
  .strict();
export const mfaSetupSchema = z.object({ secret: z.string(), uri: z.string(), qr: z.string() });
export const platformLoginResultSchema = z.union([
  platformPrincipalSchema,
  z.object({ mfaRequired: z.literal(true), setupRequired: z.boolean() }),
]);
