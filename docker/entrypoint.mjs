import { spawnSync } from 'node:child_process';
import { prepareDockerEnv } from './env.mjs';

prepareDockerEnv(process.env);
const mode = process.argv[2];
if (mode === 'migrate') {
  const result = spawnSync('pnpm', ['--filter', '@dineflow/api', 'db:migrate'], { stdio: 'inherit', env: process.env });
  if (result.error) throw new Error('Could not start database migration');
  process.exit(result.status ?? 1);
} else if (mode === 'api') {
  await import('../dist/src/main.js');
} else {
  throw new Error('Expected api or migrate entrypoint mode');
}
