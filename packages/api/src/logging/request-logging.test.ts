import { describe, expect, it } from 'vitest';
import { withApp } from '../../test/app-harness.js';
import { LEVEL } from '../../test/log-capture.js';

describe('request logging', () => {
  it('logs exactly one line per request with method, route, status, duration, request ID and IP', async () => {
    await withApp({}, async (app, logs) => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/health',
        remoteAddress: '203.0.113.9',
      });

      const lines = logs.lines.filter((l) => l.msg === 'request completed');
      expect(lines).toHaveLength(1);
      const line = lines[0]!;
      expect(line).toMatchObject({
        level: LEVEL.info,
        method: 'GET',
        route: '/api/v1/health',
        status: 200,
        ip: '203.0.113.9',
      });
      expect(typeof line['durationMs']).toBe('number');
      expect(line['requestId']).toBe(res.headers['x-request-id']);
      expect(typeof line['requestId']).toBe('string');
    });
  });

  it('gives each request its own request ID', async () => {
    await withApp({}, async (app, logs) => {
      await app.inject({ method: 'GET', url: '/api/v1/health' });
      await app.inject({ method: 'GET', url: '/api/v1/health' });

      const ids = logs.lines
        .filter((l) => l.msg === 'request completed')
        .map((l) => l['requestId']);
      expect(ids).toHaveLength(2);
      expect(new Set(ids).size).toBe(2);
    });
  });

  it('never logs bodies, or authorization and cookie headers', async () => {
    await withApp({ config: { LOG_LEVEL: 'trace' } }, async (app, logs) => {
      await app.inject({
        method: 'POST',
        url: '/api/v1/health',
        headers: {
          authorization: 'Bearer super-secret-token',
          cookie: 'refresh=super-secret-cookie',
        },
        payload: { password: 'super-secret-password' },
      });

      expect(logs.raw).not.toContain('super-secret');
    });
  });

  it('logs 5xx-free error responses with their status', async () => {
    await withApp({}, async (app, logs) => {
      await app.inject({ method: 'GET', url: '/api/v1/nope' });

      const line = logs.lines.find((l) => l.msg === 'request completed');
      expect(line).toMatchObject({ status: 404, method: 'GET' });
    });
  });

  it('routes Nest boot logs through the shared logger', async () => {
    await withApp({}, async (_app, logs) => {
      const bootLine = logs.lines.find((l) => l['context'] === 'NestFactory');
      expect(bootLine).toBeDefined();
      expect(bootLine!.msg).toMatch(/Starting Nest application/);
    });
  });
});
