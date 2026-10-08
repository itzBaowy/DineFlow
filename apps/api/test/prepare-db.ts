import { Client } from 'pg';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { testDatabaseUrl } from './test-env';

async function prepare(): Promise<void> {
  const targetUrl = testDatabaseUrl();
  const admin = new URL(targetUrl);
  const databaseName = admin.pathname.slice(1);
  admin.pathname = '/postgres';
  const client = new Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    const existing = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [databaseName]);
    if (!existing.rowCount) await client.query(`CREATE DATABASE "${databaseName}"`); // Validated identifier from test-env.
  } finally { await client.end(); }
  const cli = resolve(dirname(require.resolve('prisma/package.json')), 'build/index.js');
  const result = spawnSync(process.execPath, [cli, 'migrate', 'deploy'], { cwd: resolve(__dirname, '../..'), env: { ...process.env, DATABASE_URL: targetUrl }, stdio: 'inherit' });
  if (result.status !== 0) throw new Error('Test database migration thất bại');
}
prepare().catch((error: unknown) => { console.error(error instanceof Error ? error.message : 'Prepare DB failed'); process.exitCode = 1; });
