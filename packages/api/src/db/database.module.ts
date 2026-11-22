import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DrizzleModule, getDrizzleToken } from '@nestjs/drizzle';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import type { Logger } from 'pino';
import type { Config } from '../config/config.js';
import { PINO } from '../logging/logging.module.js';
import { instrumentPool } from './instrument-pool.js';
import * as schema from './schema.js';

export const PG_POOL = Symbol('PG_POOL');

function createDatabase(pool: Pool): NodePgDatabase<typeof schema> & { $client: Pool } {
  return drizzle(pool, { schema });
}

/**
 * The Drizzle database registered by `DatabaseModule`; inject it with `@InjectDrizzle()`.
 * Derived from what the factory builds, so the two cannot drift apart.
 */
export type Database = ReturnType<typeof createDatabase>;

@Global()
@Module({
  imports: [
    DrizzleModule.forRootAsync({
      inject: [ConfigService, PINO],
      useFactory: (config: ConfigService<Config, true>, logger: Logger): { db: Database } => {
        const pool = new Pool({
          connectionString: config.get('DATABASE_URL', { infer: true }),
          connectionTimeoutMillis: 2_000,
        });
        // An idle-client error must not crash the process.
        pool.on('error', (): void => undefined);
        const instrumented = instrumentPool(
          pool,
          logger,
          config.get('DB_SLOW_QUERY_MS', { infer: true }),
        );
        return { db: createDatabase(instrumented) };
      },
    }),
  ],
  providers: [
    {
      provide: PG_POOL,
      inject: [getDrizzleToken()],
      useFactory: (db: Database): Pool => db.$client,
    },
  ],
  exports: [PG_POOL],
})
export class DatabaseModule {}
