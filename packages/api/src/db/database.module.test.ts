import { getDrizzleToken } from '@nestjs/drizzle';
import { sql } from 'drizzle-orm';
import type { Pool } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import { withApp } from '../../test/app-harness.js';
import { PG_POOL, type Database } from './database.module.js';

describe('DatabaseModule', () => {
  it('registers a Drizzle database built on the instrumented pool the health check uses', async () => {
    await withApp({}, async (app) => {
      const db = app.get<Database>(getDrizzleToken(), { strict: false });

      const result = await db.execute(sql`select 1 as one`);

      expect(result.rows).toEqual([{ one: 1 }]);
      expect(db.$client).toBe(app.get(PG_POOL, { strict: false }));
    });
  });

  it('logs slow queries run through the injected database', async () => {
    await withApp({ config: { DB_SLOW_QUERY_MS: '0' } }, async (app, logs) => {
      const db = app.get<Database>(getDrizzleToken(), { strict: false });

      await db.execute(sql`select 42 as answer`);

      expect(
        logs.lines.find((l) => l.msg === 'slow db query' && l['sql'] === 'select 42 as answer'),
      ).toBeDefined();
    });
  });

  it('closes the pool exactly once when the app closes', async () => {
    await withApp({}, async (app) => {
      const pool = app.get<Pool>(PG_POOL, { strict: false });
      const end = vi.spyOn(pool, 'end');

      await app.close();

      expect(end).toHaveBeenCalledTimes(1);
      expect(pool.ended).toBe(true);
    });
  });
});
