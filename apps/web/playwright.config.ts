import { defineConfig, devices } from '@playwright/test';
import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(__dirname, '../../.env'), quiet: true });
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: { baseURL: 'http://localhost:3000', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } }],
  webServer: [
    { command: 'pnpm --filter @dineflow/api start', cwd: '../..', env: { NODE_ENV: 'development' }, url: 'http://localhost:4000/api/v1/health/ready', reuseExistingServer: !process.env.CI, timeout: 30000 },
    { command: 'pnpm --filter @dineflow/web start', cwd: '../..', env: { NODE_ENV: 'production' }, url: 'http://localhost:3000/staff/login', reuseExistingServer: !process.env.CI, timeout: 60000 },
  ],
});
