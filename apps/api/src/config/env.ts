import { config } from 'dotenv';
import { resolve } from 'node:path';
import { z } from 'zod';

export const CONFIG = Symbol('CONFIG');
const secret = z.string().min(32).refine(value => !/GENERATE|CHANGE_ME/i.test(value), 'Secret phải được tạo ngẫu nhiên');
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  APP_ORIGIN: z.url().refine(value => ['http:', 'https:'].includes(new URL(value).protocol)),
  DATABASE_URL: z.string().refine(value => { try { return ['postgresql:', 'postgres:'].includes(new URL(value).protocol) && !value.includes('GENERATE'); } catch { return false; } }, 'DATABASE_URL phải là PostgreSQL URL'),
  JWT_ACCESS_SECRET: secret,
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(30).max(3600).default(900),
  REFRESH_TOKEN_TTL_SECONDS: z.coerce.number().int().min(300).max(2592000).default(604800),
  COOKIE_SECURE: z.enum(['true', 'false']).default('false').transform(value => value === 'true'),
  S3_ENDPOINT: z.url().default('http://localhost:9000'),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().regex(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/).default('dineflow-menu'),
  S3_ACCESS_KEY_ID: z.string().min(1).optional(),
  S3_SECRET_ACCESS_KEY: z.string().min(8).optional(),
  S3_AUTO_CREATE_BUCKET: z.enum(['true', 'false']).default('false').transform(value => value === 'true'),
}).superRefine((env, ctx) => {
  const origin = new URL(env.APP_ORIGIN);
  if (origin.origin !== env.APP_ORIGIN) ctx.addIssue({ code: 'custom', path: ['APP_ORIGIN'], message: 'APP_ORIGIN chỉ chứa origin, không có path/trailing slash' });
  if (env.NODE_ENV === 'production' && (!env.COOKIE_SECURE || origin.protocol !== 'https:')) ctx.addIssue({ code: 'custom', path: ['COOKIE_SECURE'], message: 'Production yêu cầu Secure cookies và HTTPS origin' });
  if (env.ACCESS_TOKEN_TTL_SECONDS >= env.REFRESH_TOKEN_TTL_SECONDS) ctx.addIssue({ code: 'custom', path: ['REFRESH_TOKEN_TTL_SECONDS'], message: 'Refresh TTL phải lớn hơn access TTL' });
  if (!!env.S3_ACCESS_KEY_ID !== !!env.S3_SECRET_ACCESS_KEY) ctx.addIssue({ code: 'custom', path: ['S3_ACCESS_KEY_ID'], message: 'Cần cả access key và secret key cho storage' });
  if (env.NODE_ENV === 'production' && env.S3_AUTO_CREATE_BUCKET) ctx.addIssue({ code: 'custom', path: ['S3_AUTO_CREATE_BUCKET'], message: 'Production cần provision bucket trước' });
});
export type AppConfig = z.infer<typeof envSchema>;
export function loadEnv(): AppConfig {
  config({ path: resolve(__dirname, '../../../../../.env'), quiet: true });
  const result = envSchema.safeParse(process.env);
  if (!result.success) throw new Error(`Cấu hình môi trường không hợp lệ: ${result.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`);
  return result.data;
}
