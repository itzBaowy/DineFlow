import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

if (existsSync('.env')) {
  const existing = readFileSync('.env', 'utf8');
  const value = key => existing.match(new RegExp(`^${key}=(.*)$`, 'm'))?.[1]?.trim();
  const additions = { GUEST_TOKEN_TTL_SECONDS: '14400', S3_REGION: 'us-east-1', S3_AUTO_CREATE_BUCKET: 'true', S3_ACCESS_KEY_ID: value('MINIO_ROOT_USER'), S3_SECRET_ACCESS_KEY: value('MINIO_ROOT_PASSWORD') };
  Object.assign(additions, { PLATFORM_ADMIN_EMAIL: 'admin@dineflow.local', PLATFORM_ADMIN_NAME: 'DineFlow Platform Admin', PLATFORM_ADMIN_PASSWORD: `Df!${randomBytes(24).toString('base64url')}` });
  Object.assign(additions, { ACCOUNT_SECURITY_KEY: randomBytes(32).toString('hex'), SMTP_HOST: 'localhost', SMTP_PORT: '1025', SMTP_SECURE: 'false', EMAIL_FROM: 'no-reply@dineflow.local', EMAIL_PROVIDER: 'smtp' });
  const missing = Object.entries(additions).filter(([key, content]) => value(key) === undefined && content !== undefined);
  if (missing.length) writeFileSync('.env', existing.trimEnd() + '\n' + missing.map(([key, content]) => `${key}=${content}`).join('\n') + '\n', { mode: 0o600 });
  console.log('.env đã tồn tại; giữ nguyên giá trị cũ, chỉ bổ sung cấu hình guest/S3 còn thiếu.');
} else {
  const dbPassword = randomBytes(24).toString('hex');
  const values = {
    POSTGRES_PASSWORD: dbPassword,
    DATABASE_URL: `postgresql://dineflow:${dbPassword}@localhost:5432/dineflow?schema=public`,
    JWT_ACCESS_SECRET: randomBytes(48).toString('base64url'),
    ACCOUNT_SECURITY_KEY: randomBytes(32).toString('hex'),
    REDIS_PASSWORD: randomBytes(24).toString('hex'),
    MINIO_ROOT_PASSWORD: randomBytes(24).toString('hex'),
    SEED_DEMO_PASSWORD: `Df!${randomBytes(15).toString('base64url')}`,
    PLATFORM_ADMIN_PASSWORD: `Df!${randomBytes(24).toString('base64url')}`,
  };
  values.REDIS_URL = `redis://:${values.REDIS_PASSWORD}@localhost:6379`;
  values.S3_SECRET_ACCESS_KEY = values.MINIO_ROOT_PASSWORD;
  const content = readFileSync('.env.example', 'utf8').replace(/^(\w+)=(.*)$/gm, (line, key) => key in values ? `${key}=${values[key]}` : line);
  writeFileSync('.env', content, { flag: 'wx', mode: 0o600 });
  console.log('Đã tạo .env với secrets ngẫu nhiên. Mật khẩu demo nằm ở SEED_DEMO_PASSWORD trong .env.');
}
