import { config } from 'dotenv';
import { resolve } from 'node:path';
import { z } from 'zod';

export const CONFIG = Symbol('CONFIG');
const secret = z
  .string()
  .min(32)
  .refine((value) => !/GENERATE|CHANGE_ME/i.test(value), 'Secret phải được tạo ngẫu nhiên');
export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    APP_ORIGIN: z
      .url()
      .refine((value) => ['http:', 'https:'].includes(new URL(value).protocol)),
    DATABASE_URL: z.string().refine((value) => {
      try {
        return (
          ['postgresql:', 'postgres:'].includes(new URL(value).protocol) &&
          !value.includes('GENERATE')
        );
      } catch {
        return false;
      }
    }, 'DATABASE_URL phải là PostgreSQL URL'),
    JWT_ACCESS_SECRET: secret,
    ACCOUNT_SECURITY_KEY: z
      .string()
      .regex(/^[0-9a-f]{64}$/)
      .default('0'.repeat(64)),
    SMTP_HOST: z.string().min(1).default('localhost'),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(1025),
    SMTP_SECURE: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    SMTP_USER: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),
    EMAIL_FROM: z.email().default('no-reply@dineflow.local'),
    EMAIL_PROVIDER: z.enum(['smtp', 'resend']).default('smtp'),
    RESEND_API_KEY: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().min(10).optional(),
    ),
    ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(30).max(3600).default(900),
    REFRESH_TOKEN_TTL_SECONDS: z.coerce.number().int().min(300).max(2592000).default(604800),
    GUEST_TOKEN_TTL_SECONDS: z.coerce.number().int().min(300).max(86400).default(14400),
    COOKIE_SECURE: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    S3_ENDPOINT: z.url().default('http://localhost:9000'),
    S3_REGION: z.string().default('us-east-1'),
    S3_BUCKET: z
      .string()
      .regex(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/)
      .default('dineflow-menu'),
    S3_ACCESS_KEY_ID: z.string().min(1).optional(),
    S3_SECRET_ACCESS_KEY: z.string().min(8).optional(),
    S3_AUTO_CREATE_BUCKET: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
  })
  .superRefine((env, ctx) => {
    const origin = new URL(env.APP_ORIGIN);
    if (env.NODE_ENV !== 'test' && env.ACCOUNT_SECURITY_KEY === '0'.repeat(64))
      ctx.addIssue({
        code: 'custom',
        path: ['ACCOUNT_SECURITY_KEY'],
        message: 'Cần khóa ngẫu nhiên 32 bytes để mã hóa MFA/email',
      });
    if (!!env.SMTP_USER !== !!env.SMTP_PASSWORD)
      ctx.addIssue({
        code: 'custom',
        path: ['SMTP_USER'],
        message: 'Cần cả SMTP user và password',
      });
    if (env.EMAIL_PROVIDER === 'resend' && !env.RESEND_API_KEY)
      ctx.addIssue({ code: 'custom', path: ['RESEND_API_KEY'], message: 'Cần Resend API key' });
    if (
      env.NODE_ENV === 'production' &&
      ((env.EMAIL_PROVIDER === 'smtp' && !env.SMTP_USER) || env.EMAIL_FROM.endsWith('.local'))
    )
      ctx.addIssue({
        code: 'custom',
        path: ['EMAIL_FROM'],
        message: 'Production cần sender thật và provider đã xác thực',
      });
    if (origin.origin !== env.APP_ORIGIN)
      ctx.addIssue({
        code: 'custom',
        path: ['APP_ORIGIN'],
        message: 'APP_ORIGIN chỉ chứa origin, không có path/trailing slash',
      });
    if (env.NODE_ENV === 'production' && (!env.COOKIE_SECURE || origin.protocol !== 'https:'))
      ctx.addIssue({
        code: 'custom',
        path: ['COOKIE_SECURE'],
        message: 'Production yêu cầu Secure cookies và HTTPS origin',
      });
    if (env.ACCESS_TOKEN_TTL_SECONDS >= env.REFRESH_TOKEN_TTL_SECONDS)
      ctx.addIssue({
        code: 'custom',
        path: ['REFRESH_TOKEN_TTL_SECONDS'],
        message: 'Refresh TTL phải lớn hơn access TTL',
      });
    if (!!env.S3_ACCESS_KEY_ID !== !!env.S3_SECRET_ACCESS_KEY)
      ctx.addIssue({
        code: 'custom',
        path: ['S3_ACCESS_KEY_ID'],
        message: 'Cần cả access key và secret key cho storage',
      });
    if (env.NODE_ENV === 'production' && env.S3_AUTO_CREATE_BUCKET)
      ctx.addIssue({
        code: 'custom',
        path: ['S3_AUTO_CREATE_BUCKET'],
        message: 'Production cần provision bucket trước',
      });
  });
export type AppConfig = z.infer<typeof envSchema>;
export function loadEnv(): AppConfig {
  config({ path: resolve(__dirname, '../../../../../.env'), quiet: true });
  const result = envSchema.safeParse(process.env);
  if (!result.success)
    throw new Error(
      `Cấu hình môi trường không hợp lệ: ${result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`,
    );
  return result.data;
}
