import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

if (existsSync('.env')) {
  console.log('.env đã tồn tại, giữ nguyên cấu hình.');
} else {
  const dbPassword = randomBytes(24).toString('hex');
  const values = {
    POSTGRES_PASSWORD: dbPassword,
    DATABASE_URL: `postgresql://dineflow:${dbPassword}@localhost:5432/dineflow?schema=public`,
    JWT_ACCESS_SECRET: randomBytes(48).toString('base64url'),
    REDIS_PASSWORD: randomBytes(24).toString('hex'),
    MINIO_ROOT_PASSWORD: randomBytes(24).toString('hex'),
    SEED_DEMO_PASSWORD: `Df!${randomBytes(15).toString('base64url')}`,
  };
  values.REDIS_URL = `redis://:${values.REDIS_PASSWORD}@localhost:6379`;
  values.S3_SECRET_ACCESS_KEY = values.MINIO_ROOT_PASSWORD;
  const content = readFileSync('.env.example', 'utf8').replace(/^(\w+)=(.*)$/gm, (line, key) => key in values ? `${key}=${values[key]}` : line);
  writeFileSync('.env', content, { flag: 'wx', mode: 0o600 });
  console.log('Đã tạo .env với secrets ngẫu nhiên. Mật khẩu demo nằm ở SEED_DEMO_PASSWORD trong .env.');
}
