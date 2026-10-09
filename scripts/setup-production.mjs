import { randomBytes } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
const target = process.argv[2] || '.env.production';
if (existsSync(target)) {
  console.log('Production env already exists; credentials preserved.');
} else {
  const dbPassword = randomBytes(32).toString('hex');
  const values = {
    DEPLOY_TAG: 'production',
    API_HOST_PORT: '4001',
    APP_ORIGIN: 'https://dineflow.khuugiabao.com',
    POSTGRES_USER: 'dineflow',
    POSTGRES_DB: 'dineflow',
    POSTGRES_PASSWORD: dbPassword,
    DATABASE_URL: `postgresql://dineflow:${dbPassword}@postgres:5432/dineflow?schema=public`,
    JWT_ACCESS_SECRET: randomBytes(48).toString('base64url'),
    ACCOUNT_SECURITY_KEY: randomBytes(32).toString('hex'),
    MINIO_ROOT_USER: 'dineflow-storage-admin',
    MINIO_ROOT_PASSWORD: randomBytes(32).toString('hex'),
    S3_BUCKET: 'dineflow-menu',
    S3_ACCESS_KEY_ID: 'dineflow-api-storage',
    S3_SECRET_ACCESS_KEY: randomBytes(32).toString('hex'),
    EMAIL_FROM: 'no-reply@dineflow.khuugiabao.com',
    RESEND_API_KEY: 'SET_ME_RESEND_KEY',
    PLATFORM_ADMIN_EMAIL: 'admin@khuugiabao.com',
    PLATFORM_ADMIN_NAME: 'DineFlow Admin',
    PLATFORM_ADMIN_PASSWORD: `Df!${randomBytes(24).toString('base64url')}`,
  };
  writeFileSync(
    target,
    Object.entries(values)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n') + '\n',
    { flag: 'wx', mode: 0o600 },
  );
  console.log(
    'Created private production env. Configure real Resend key/sender before starting API.',
  );
}
