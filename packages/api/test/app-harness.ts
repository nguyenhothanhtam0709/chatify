import { inject } from 'vitest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createApp, type AppOverrides } from '../src/app.js';
import { testJwtKeys } from './keys.js';
import { LogCapture } from './log-capture.js';

export interface HarnessOptions extends Omit<AppOverrides, 'logDestination'> {
  /** Defaults to the run's Testcontainers Postgres. */
  databaseUrl?: string;
  /** Extra raw config (env-style strings) on top of the defaults. */
  config?: Record<string, unknown>;
  /** Replace the in-memory log destination (e.g. to exercise real transports). */
  useRealLogTransports?: boolean;
}

/**
 * Boots the real Nest app against the run's Postgres, hands it to the test (use
 * `app.inject()` for HTTP) with the captured logs, and always closes it afterwards.
 */
export async function withApp(
  options: HarnessOptions,
  run: (app: NestFastifyApplication, logs: LogCapture) => void | Promise<void>,
): Promise<void> {
  const {
    databaseUrl = inject('databaseUrl'),
    config = {},
    useRealLogTransports = false,
    ...overrides
  } = options;
  const logs = new LogCapture();
  const app = await createApp(
    { DATABASE_URL: databaseUrl, ...testJwtKeys, ...config },
    { ...overrides, ...(useRealLogTransports ? {} : { logDestination: logs }) },
  );
  try {
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    await run(app, logs);
  } finally {
    await app.close();
  }
}
