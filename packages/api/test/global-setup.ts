import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { Pool } from 'pg';
import { runMigrations } from '../src/db/migrate.js';

/**
 * Starts one Postgres for the whole run (Testcontainers) and applies migrations once.
 * Set TEST_DATABASE_URL to reuse an existing Postgres instead of starting a container.
 */
export default async function setup(project: {
  provide: (key: string, value: string) => void;
}): Promise<() => Promise<void>> {
  let url = process.env['TEST_DATABASE_URL'];
  let stop = async () => {};

  if (!url) {
    const container = await new PostgreSqlContainer('postgres:18-alpine').start();
    url = container.getConnectionUri();
    stop = async () => {
      await container.stop();
    };
  }

  const pool = new Pool({ connectionString: url });
  try {
    await runMigrations(pool);
  } finally {
    await pool.end();
  }

  project.provide('databaseUrl', url);
  return stop;
}

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}
