import { createRequire } from 'node:module';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';

const webDir = fileURLToPath(new URL('../apps/web/', import.meta.url));
const require = createRequire(resolve(webDir, 'package.json'));
const cli = require.resolve('@playwright/test/cli');
const extra = process.argv.slice(2);
const files = readdirSync(resolve(webDir, 'tests')).filter((file) => file.endsWith('.spec.ts')).sort();
// Local tests never start web/API processes. Keep the real rate limiter enabled
// and let its one-minute window expire between batches sharing one proxy IP.
if (process.env.E2E_START_SERVERS !== '1') {
  for (const url of ['http://localhost:4000/api/v1/health/ready', 'http://localhost:3000/staff/login']) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error('Server is not ready');
    } catch {
      process.stderr.write(`Server unavailable: ${url}. Run pnpm api:up, then start pnpm dev:web in your terminal.\n`);
      process.exit(1);
    }
  }
}
const batches = extra.length ? [extra] : Array.from({ length: Math.ceil(files.length / 3) }, (_, index) => files.slice(index * 3, index * 3 + 3).map((file) => `tests/${file}`));
for (const [index, batch] of batches.entries()) {
  if (index && process.env.E2E_START_SERVERS !== '1') {
    process.stdout.write('\nWaiting 65s for the API rate-limit window before the next batch.\n');
    await setTimeout(65000);
  }
  process.stdout.write(`\nBrowser batch ${index + 1}/${batches.length}\n`);
  const result = spawnSync(process.execPath, [cli, 'test', ...batch, `--output=test-results/batch-${index + 1}`], {
    cwd: webDir, env: { ...process.env, CI: '1' }, stdio: 'inherit',
  });
  if (result.error) { process.stderr.write(`${result.error.message}\n`); process.exit(1); }
  if (result.status !== 0) process.exit(result.status ?? 1);
}
