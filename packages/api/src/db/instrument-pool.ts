import type { Pool } from 'pg';
import type { Logger } from 'pino';
import { readProperty } from '../common/read-property.js';

function sqlText(first: unknown): string {
  if (typeof first === 'string') return first;
  const text = readProperty(first, 'text');
  return typeof text === 'string' ? text : '<unknown query>';
}

/**
 * Wraps the pool's query path to log SQL text and duration at debug, and queries slower
 * than `slowQueryMs` at warn. Bound parameters are never logged.
 */
export function instrumentPool(pool: Pool, logger: Logger, slowQueryMs: number): Pool {
  const originalQuery = pool.query;
  const original = (...args: unknown[]): unknown => Reflect.apply(originalQuery, pool, args);

  const instrumented = (...args: unknown[]): unknown => {
    const start = performance.now();
    const sql = sqlText(args[0]);
    const report = () => {
      const durationMs = Math.round((performance.now() - start) * 1000) / 1000;
      const slow = durationMs > slowQueryMs;
      logger[slow ? 'warn' : 'debug']({ sql, durationMs }, slow ? 'slow db query' : 'db query');
    };
    const result = original(...args);
    if (result instanceof Promise) {
      return result.finally(report);
    }
    return result;
  };

  Reflect.set(pool, 'query', instrumented);
  return pool;
}
