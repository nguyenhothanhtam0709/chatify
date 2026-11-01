import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { withApp } from '../../test/app-harness.js';
import { testJwtKeys } from '../../test/keys.js';
import { LEVEL, LogCapture } from '../../test/log-capture.js';
import { loadConfig } from '../config/config.js';
import { createLogger } from './logger.js';
import { runWithRequestContext, setRequestUserId } from './request-context.js';

const validConfig = { DATABASE_URL: 'postgres://chat:chat@127.0.0.1:1/chat', ...testJwtKeys };

describe('database query logging', () => {
  it('logs SQL text and duration at debug, tagged with the request ID', async () => {
    await withApp({ config: { LOG_LEVEL: 'debug' } }, async (app, logs) => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/health' });

      const query = logs.lines.find((l) => l.msg === 'db query' && l['sql'] === 'select 1');
      expect(query).toBeDefined();
      expect(query!.level).toBe(LEVEL.debug);
      expect(typeof query!['durationMs']).toBe('number');
      expect(query!['requestId']).toBe(res.headers['x-request-id']);
      expect(query).not.toHaveProperty('params');
      expect(query).not.toHaveProperty('values');
    });
  });

  it('does not log queries when the level is above debug', async () => {
    await withApp({}, async (app, logs) => {
      await app.inject({ method: 'GET', url: '/api/v1/health' });

      expect(logs.lines.filter((l) => l.msg === 'db query')).toHaveLength(0);
    });
  });

  it('logs queries slower than the threshold at warn, whatever the level', async () => {
    // A 0 ms threshold makes every query "slow"; the default is 200 ms.
    await withApp({ config: { DB_SLOW_QUERY_MS: '0' } }, async (app, logs) => {
      await app.inject({ method: 'GET', url: '/api/v1/health' });

      const slow = logs.lines.find((l) => l.msg === 'slow db query');
      expect(slow).toMatchObject({ level: LEVEL.warn, sql: 'select 1' });
    });
  });

  it('defaults the slow-query threshold to 200 ms', () => {
    expect(loadConfig(validConfig).DB_SLOW_QUERY_MS).toBe(200);
  });
});

describe('request context', () => {
  it('attaches request ID and User ID to every line logged within a request', async () => {
    const logs = new LogCapture();
    const { logger } = await createLogger(loadConfig(validConfig), logs);

    runWithRequestContext({ requestId: 'req-1' }, () => {
      logger.info('before auth');
      setRequestUserId('user-1');
      logger.info('after auth');
    });
    logger.info('outside a request');

    const [before, after, outside] = logs.lines;
    expect(before).toMatchObject({ requestId: 'req-1', msg: 'before auth' });
    expect(before!['userId']).toBeUndefined();
    expect(after).toMatchObject({ requestId: 'req-1', userId: 'user-1' });
    expect(outside!['requestId']).toBeUndefined();
  });

  it('redacts secrets and message bodies that code tries to log', async () => {
    const logs = new LogCapture();
    const { logger } = await createLogger(loadConfig(validConfig), logs);

    logger.info(
      {
        password: 'pw-secret',
        user: { email: 'a@b.c', token: 'tok-secret' },
        body: 'message-secret',
        req: { headers: { authorization: 'Bearer x-secret', cookie: 'c-secret' } },
      },
      'oops',
    );

    for (const secret of [
      'pw-secret',
      'a@b.c',
      'tok-secret',
      'message-secret',
      'x-secret',
      'c-secret',
    ]) {
      expect(logs.raw).not.toContain(secret);
    }
  });
});

describe('log transports', () => {
  it('writes to a rotating file when enabled, honouring the file level', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'chat-logs-'));
    try {
      await withApp(
        {
          useRealLogTransports: true,
          config: {
            LOG_CONSOLE_ENABLED: 'false',
            LOG_FILE_ENABLED: 'true',
            LOG_FILE_PATH: join(dir, 'api.log'),
            LOG_LEVEL: 'error',
            LOG_FILE_LEVEL: 'info',
          },
        },
        async (app) => {
          await app.inject({ method: 'GET', url: '/api/v1/health' });
        },
      );

      const files = await readdir(dir);
      expect(files.length).toBeGreaterThan(0);
      const content = (await Promise.all(files.map((f) => readFile(join(dir, f), 'utf8')))).join(
        '',
      );
      const lines = content
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l) as { msg?: string });
      expect(lines.some((l) => l.msg === 'request completed')).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('lets each target fall back to the global level', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'chat-logs-'));
    try {
      await withApp(
        {
          useRealLogTransports: true,
          config: {
            LOG_CONSOLE_ENABLED: 'false',
            LOG_FILE_ENABLED: 'true',
            LOG_FILE_PATH: join(dir, 'api.log'),
            LOG_LEVEL: 'error',
          },
        },
        async (app) => {
          await app.inject({ method: 'GET', url: '/api/v1/health' });
        },
      );

      const files = await readdir(dir);
      const content = (await Promise.all(files.map((f) => readFile(join(dir, f), 'utf8')))).join(
        '',
      );
      expect(content).not.toContain('request completed');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
