import { createApp } from './app.js';
import { loadConfig } from './config.js';

try {
  const config = loadConfig();
  const app = createApp(config, config.environment === 'production');

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      void app.close().catch(() => { process.exitCode = 1; });
    });
  }

  await app.listen({ host: config.host, port: config.port });
  console.info(`Server listening on port ${config.port}`);
} catch {
  console.error('Server startup failed. Check configuration and build output.');
  process.exitCode = 1;
}
