import { ErrorCode, ErrorResponseSchema } from '@chat/contracts';
import { describe, expect, it } from 'vitest';
import { withApp } from '../../test/app-harness.js';

const SPA = 'http://localhost:5173';

describe('security headers', () => {
  it('serves standard headers and a strict Content-Security-Policy', async () => {
    await withApp({}, async (app) => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/health' });

      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBeDefined();
      expect(res.headers['strict-transport-security']).toBeDefined();
      expect(res.headers['referrer-policy']).toBeDefined();
      expect(res.headers['x-powered-by']).toBeUndefined();

      const csp = String(res.headers['content-security-policy']);
      expect(csp).toContain("default-src 'none'");
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).not.toContain("'unsafe-inline'");
      expect(csp).not.toContain("'unsafe-eval'");
    });
  });

  it('serves them on error responses too', async () => {
    await withApp({}, async (app) => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/nope' });

      expect(res.headers['content-security-policy']).toBeDefined();
    });
  });
});
describe('CORS', () => {
  it('allows the configured SPA origin, with credentials', async () => {
    await withApp({ config: { SPA_ORIGIN: SPA } }, async (app) => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/health',
        headers: { origin: SPA },
      });

      expect(res.headers['access-control-allow-origin']).toBe(SPA);
      expect(res.headers['access-control-allow-credentials']).toBe('true');
    });
  });

  it('answers preflight for the SPA origin', async () => {
    await withApp({ config: { SPA_ORIGIN: SPA } }, async (app) => {
      const res = await app.inject({
        method: 'OPTIONS',
        url: '/api/v1/health',
        headers: {
          origin: SPA,
          'access-control-request-method': 'POST',
          'access-control-request-headers': 'authorization,content-type',
        },
      });

      expect(res.statusCode).toBeLessThan(300);
      expect(res.headers['access-control-allow-origin']).toBe(SPA);
      expect(res.headers['access-control-allow-credentials']).toBe('true');
    });
  });

  it('does not allow any other origin', async () => {
    await withApp({ config: { SPA_ORIGIN: SPA } }, async (app) => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/health',
        headers: { origin: 'https://evil.example' },
      });

      expect(res.headers['access-control-allow-origin']).toBeUndefined();
      expect(res.headers['access-control-allow-credentials']).toBeUndefined();
    });
  });

  it('refuses preflight from another origin', async () => {
    await withApp({ config: { SPA_ORIGIN: SPA } }, async (app) => {
      const res = await app.inject({
        method: 'OPTIONS',
        url: '/api/v1/health',
        headers: { origin: 'https://evil.example', 'access-control-request-method': 'POST' },
      });

      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });
  });
});

describe('rate limiting', () => {
  it('answers 429 RATE_LIMITED with Retry-After once the limit is exceeded', async () => {
    await withApp({ config: { THROTTLE_LIMIT: '3', THROTTLE_TTL_MS: '60000' } }, async (app) => {
      for (let i = 0; i < 3; i++) {
        const ok = await app.inject({ method: 'GET', url: '/api/v1/health' });
        expect(ok.statusCode).toBe(200);
      }

      const limited = await app.inject({ method: 'GET', url: '/api/v1/health' });

      expect(limited.statusCode).toBe(429);
      expect(ErrorResponseSchema.parse(limited.json()).error.code).toBe(ErrorCode.RATE_LIMITED);
      expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    });
  });

  it('defaults to 120 requests per minute', async () => {
    await withApp({}, async (app) => {
      let last = 0;
      for (let i = 0; i < 121; i++) {
        last = (await app.inject({ method: 'GET', url: '/api/v1/health' })).statusCode;
        if (i < 120) expect(last).toBe(200);
      }
      expect(last).toBe(429);
    });
  });
});
