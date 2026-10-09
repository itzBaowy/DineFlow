// Preserve URL-encoded credentials and query options from the host .env.
// Only container DNS/port differs; never log the connection string.
export function prepareDockerEnv(env) {
  if (!env.DATABASE_HOST) return;
  let url;
  try { url = new URL(env.DATABASE_URL); } catch { throw new Error('Invalid DATABASE_URL'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('Expected PostgreSQL DATABASE_URL');
  url.hostname = env.DATABASE_HOST;
  url.port = env.DATABASE_PORT ?? '5432';
  env.DATABASE_URL = url.toString();
}
