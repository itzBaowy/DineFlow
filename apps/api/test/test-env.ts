import { config } from 'dotenv';
import { resolve } from 'node:path';

export function testDatabaseUrl(): string {
  config({ path: resolve(__dirname, '../../../../.env'), quiet: true });
  if (!process.env.DATABASE_URL) throw new Error('Chạy pnpm setup:env trước');
  const url = new URL(process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL);
  if (!process.env.TEST_DATABASE_URL) url.pathname = '/dineflow_test';
  if (!/^\/[a-z0-9_]+_test$/.test(url.pathname)) throw new Error('Test database bắt buộc có tên kết thúc _test; không dùng development/production DB');
  return url.toString();
}
