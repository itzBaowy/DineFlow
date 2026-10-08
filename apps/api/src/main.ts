import { createApp } from './bootstrap';
import { CONFIG, type AppConfig } from './config/env';

async function main(): Promise<void> {
  const app = await createApp();
  const config = app.get<AppConfig>(CONFIG);
  await app.listen(config.API_PORT, '0.0.0.0');
}
main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : 'API startup failed'); process.exitCode = 1; });
