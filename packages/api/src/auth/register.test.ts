import { ErrorCode, ErrorResponseSchema, RegisterResponseSchema } from '@chat/contracts';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { inject, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { withApp } from '../../test/app-harness.js';

const valid = {
  username: 'Alice',
  email: 'Alice@Example.com',
  password: 'correct horse battery',
  nickname: 'Ali',
};

function register(app: NestFastifyApplication, payload: unknown) {
  return app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: payload as object });
}

function errorOf(res: { json: () => unknown }) {
  return ErrorResponseSchema.parse(res.json()).error;
}

describe('POST /auth/register', () => {
  it('creates a User and returns it exactly as typed, without any password', async () => {
    await withApp({}, async (app) => {
      const res = await register(app, valid);

      expect(res.statusCode).toBe(201);
      const { user } = RegisterResponseSchema.parse(res.json());
      expect(user).toMatchObject({
        username: 'Alice',
        email: 'Alice@Example.com',
        nickname: 'Ali',
      });
      expect(res.body).not.toContain(valid.password);
      expect(res.body.toLowerCase()).not.toContain('password');
    });
  });

  it('gives a User without a Nickname a null Nickname', async () => {
    await withApp({}, async (app) => {
      const withoutNickname: Partial<typeof valid> = { ...valid };
      delete withoutNickname.nickname;
      const res = await register(app, withoutNickname);

      expect(res.statusCode).toBe(201);
      expect(RegisterResponseSchema.parse(res.json()).user.nickname).toBeNull();
    });
  });

  it('stores the password as an argon2id hash', async () => {
    await withApp({}, async (app) => {
      await register(app, valid);

      const pool = new Pool({ connectionString: inject('databaseUrl') });
      try {
        const { rows } = await pool.query<{ password_hash: string }>(
          'select password_hash from users',
        );
        expect(rows).toHaveLength(1);
        expect(rows[0]!.password_hash).toMatch(/^\$argon2id\$/);
        expect(rows[0]!.password_hash).not.toContain(valid.password);
      } finally {
        await pool.end();
      }
    });
  });

  it('rejects a taken Username in any capitalization with USERNAME_TAKEN', async () => {
    await withApp({}, async (app) => {
      await register(app, valid);
      const res = await register(app, { ...valid, username: 'alice', email: 'other@example.com' });

      expect(res.statusCode).toBe(409);
      expect(errorOf(res).code).toBe(ErrorCode.USERNAME_TAKEN);
    });
  });

  it('rejects a taken email in any capitalization with EMAIL_TAKEN', async () => {
    await withApp({}, async (app) => {
      await register(app, valid);
      const res = await register(app, { ...valid, username: 'bob', email: 'alice@EXAMPLE.COM' });

      expect(res.statusCode).toBe(409);
      expect(errorOf(res).code).toBe(ErrorCode.EMAIL_TAKEN);
    });
  });

  it('lets only one of two simultaneous registrations for the same Username win', async () => {
    await withApp({}, async (app) => {
      const results = await Promise.all([
        register(app, { ...valid, email: 'one@example.com' }),
        register(app, { ...valid, username: 'ALICE', email: 'two@example.com' }),
      ]);

      expect(results.map((r) => r.statusCode).sort()).toEqual([201, 409]);
    });
  });

  it.each([
    ['username', { ...valid, username: 'a b' }],
    ['email', { ...valid, email: 'not-an-email' }],
    ['password', { ...valid, password: 'short' }],
    ['nickname', { ...valid, nickname: '   ' }],
  ])(
    'answers an invalid %s with VALIDATION_FAILED and details naming the field',
    async (field, body) => {
      await withApp({}, async (app) => {
        const res = await register(app, body);

        expect(res.statusCode).toBe(400);
        const error = errorOf(res);
        expect(error.code).toBe(ErrorCode.VALIDATION_FAILED);
        const paths = (error.details as { path: string[] }[]).map((i) => i.path[0]);
        expect(paths).toEqual([field]);
      });
    },
  );

  it('answers a missing body with VALIDATION_FAILED', async () => {
    await withApp({}, async (app) => {
      const res = await app.inject({ method: 'POST', url: '/api/v1/auth/register' });

      expect(res.statusCode).toBe(400);
      expect(errorOf(res).code).toBe(ErrorCode.VALIDATION_FAILED);
    });
  });

  it('rejects an unknown key with VALIDATION_FAILED', async () => {
    await withApp({}, async (app) => {
      const res = await register(app, { ...valid, nicknme: 'Ali' });

      expect(res.statusCode).toBe(400);
      expect(errorOf(res).code).toBe(ErrorCode.VALIDATION_FAILED);
    });
  });

  it('does not echo the password in a validation error', async () => {
    await withApp({}, async (app) => {
      const res = await register(app, {
        ...valid,
        username: 'a b',
        password: 'a-very-secret-pass',
      });

      expect(res.body).not.toContain('a-very-secret-pass');
    });
  });

  it('allows 5 registrations per hour per IP and then answers 429 RATE_LIMITED', async () => {
    await withApp({}, async (app) => {
      for (let i = 0; i < 5; i++) {
        const ok = await register(app, {
          ...valid,
          username: `user_${i}`,
          email: `user${i}@example.com`,
        });
        expect(ok.statusCode).toBe(201);
      }

      const res = await register(app, { ...valid, username: 'user_6', email: 'user6@example.com' });

      expect(res.statusCode).toBe(429);
      expect(errorOf(res).code).toBe(ErrorCode.RATE_LIMITED);
      expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
    });
  });

  it('does not rate limit registrations or logins when THROTTLE_DISABLED is true', async () => {
    await withApp({ config: { THROTTLE_DISABLED: 'true' } }, async (app) => {
      for (let i = 0; i < 7; i++) {
        const ok = await register(app, {
          ...valid,
          username: `user_${i}`,
          email: `user${i}@example.com`,
        });
        expect(ok.statusCode).toBe(201);
      }

      // Past the login limits (10 per IP, 5 per identifier): still 401, never 429.
      for (let i = 0; i < 12; i++) {
        const res = await app.inject({
          method: 'POST',
          url: '/api/v1/auth/login',
          payload: { identifier: 'user_0', password: 'wrong password!!' },
        });
        expect(res.statusCode).toBe(401);
      }
    });
  });

  it('keeps the rate limits when THROTTLE_DISABLED is false', async () => {
    await withApp({ config: { THROTTLE_DISABLED: 'false' } }, async (app) => {
      for (let i = 0; i < 5; i++) {
        const ok = await register(app, {
          ...valid,
          username: `user_${i}`,
          email: `user${i}@example.com`,
        });
        expect(ok.statusCode).toBe(201);
      }

      const res = await register(app, { ...valid, username: 'user_6', email: 'user6@example.com' });

      expect(res.statusCode).toBe(429);
    });
  });

  it('writes neither the password nor the email to the logs, on success or on conflict', async () => {
    await withApp({ config: { LOG_LEVEL: 'debug' } }, async (app, logs) => {
      const body = {
        username: 'Carol',
        email: 'carol.unique@example.org',
        password: 'p4ssw0rd-never-logged',
      };
      expect((await register(app, body)).statusCode).toBe(201);
      expect((await register(app, body)).statusCode).toBe(409);
      expect((await register(app, { ...body, username: 'a b' })).statusCode).toBe(400);

      expect(logs.lines.length).toBeGreaterThan(0);
      expect(logs.raw).not.toContain(body.password);
      expect(logs.raw.toLowerCase()).not.toContain(body.email);
      expect(logs.raw.toLowerCase()).not.toContain('carol.unique');
    });
  });
});
