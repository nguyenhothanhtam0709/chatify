import { Pool } from 'pg';
import { describe, expect, it, inject } from 'vitest';
import { CLOCK, type Clock } from '../src/clock/clock.js';
import { withApp } from './app-harness.js';
import { truncateAllTables } from './database.js';

describe('test harness', () => {
  it('truncates all application tables between tests', async () => {
    const pool = new Pool({ connectionString: inject('databaseUrl') });
    try {
      await pool.query(
        `insert into users (username, email, password_hash) values ('k', 'k@example.com', 'x')`,
      );
      await truncateAllTables(inject('databaseUrl'));
      const { rows } = await pool.query(`select count(*)::int as n from users`);
      expect(rows[0].n).toBe(0);
    } finally {
      await pool.end();
    }
  });

  it('lets app tests override the clock', async () => {
    const fixed = new Date('2030-01-02T03:04:05.000Z');
    const clock: Clock = { now: () => fixed };

    await withApp({ clock }, (app) => {
      expect(app.get<Clock>(CLOCK).now().toISOString()).toBe('2030-01-02T03:04:05.000Z');
    });
  });

  it('uses the real clock by default', async () => {
    await withApp({}, (app) => {
      const before = Date.now();
      const now = app.get<Clock>(CLOCK).now().getTime();
      expect(now).toBeGreaterThanOrEqual(before);
      expect(now).toBeLessThanOrEqual(before + 5_000);
    });
  });
});
