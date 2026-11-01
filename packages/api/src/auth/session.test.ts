import {
  ErrorCode,
  ErrorResponseSchema,
  LoginResponseSchema,
  MeResponseSchema,
  RefreshResponseSchema,
} from '@chat/contracts';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { decodeJwt, decodeProtectedHeader, importSPKI, jwtVerify } from 'jose';
import { Pool } from 'pg';
import { inject, describe, expect, it } from 'vitest';
import { withApp } from '../../test/app-harness.js';
import { testJwtKeys } from '../../test/keys.js';
import { testClock } from '../../test/test-clock.js';

const alice = { username: 'Alice', email: 'alice@example.com', password: 'correct horse battery' };

async function signIn(app: NestFastifyApplication) {
  await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: alice });
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { identifier: 'alice', password: alice.password },
  });
  expect(res.statusCode).toBe(200);
  const { accessToken } = LoginResponseSchema.parse(res.json());
  const cookie = res.cookies.find((c) => c.name === 'refresh_token')!;
  return { accessToken, cookie, response: res };
}

function me(app: NestFastifyApplication, accessToken?: string) {
  return app.inject({
    method: 'GET',
    url: '/api/v1/users/me',
    headers: accessToken ? { authorization: `Bearer ${accessToken}` } : {},
  });
}

function refresh(app: NestFastifyApplication, token?: string) {
  return app.inject({
    method: 'POST',
    url: '/api/v1/auth/refresh',
    cookies: token ? { refresh_token: token } : {},
  });
}

function errorCode(res: { json: () => unknown }) {
  return ErrorResponseSchema.parse(res.json()).error.code;
}

describe('access token', () => {
  it('is an EdDSA JWT with sub, sid, jti, iat and exp, valid for 15 minutes', async () => {
    const { clock } = testClock(new Date('2030-01-01T00:00:00Z'));
    await withApp({ clock }, async (app) => {
      const { accessToken } = await signIn(app);

      expect(decodeProtectedHeader(accessToken).alg).toBe('EdDSA');
      const { payload } = await jwtVerify(
        accessToken,
        await importSPKI(testJwtKeys.JWT_PUBLIC_KEY, 'EdDSA'),
        { currentDate: clock.now() },
      );
      const me = MeResponseSchema.parse(
        (
          await app.inject({
            method: 'GET',
            url: '/api/v1/users/me',
            headers: { authorization: `Bearer ${accessToken}` },
          })
        ).json(),
      );
      expect(payload.sub).toBe(me.user.id);
      expect(payload['sid']).toEqual(expect.any(String));
      expect(payload.jti).toEqual(expect.any(String));
      expect(payload.iat).toBe(Date.parse('2030-01-01T00:00:00Z') / 1000);
      expect(payload.exp).toBe(payload.iat! + 15 * 60);
      expect(Object.keys(decodeJwt(accessToken)).sort()).toEqual([
        'exp',
        'iat',
        'jti',
        'sid',
        'sub',
      ]);
    });
  });
});

describe('refresh cookie', () => {
  it('is httpOnly, Secure and SameSite=Strict, and only the hash is stored', async () => {
    await withApp({}, async (app) => {
      const { cookie, response } = await signIn(app);

      expect(cookie.httpOnly).toBe(true);
      expect(cookie.secure).toBe(true);
      expect(cookie.sameSite).toBe('Strict');
      expect(response.body).not.toContain(cookie.value);

      const pool = new Pool({ connectionString: inject('databaseUrl') });
      try {
        const { rows } = await pool.query<{ refresh_token_hash: string }>(
          'select refresh_token_hash from sessions',
        );
        expect(rows).toHaveLength(1);
        expect(rows[0]!.refresh_token_hash).not.toContain(cookie.value);
      } finally {
        await pool.end();
      }
    });
  });
});

describe('POST /auth/refresh', () => {
  it('rotates the refresh token and issues a working access token', async () => {
    await withApp({}, async (app) => {
      const { cookie } = await signIn(app);

      const res = await refresh(app, cookie.value);

      expect(res.statusCode).toBe(200);
      const { accessToken } = RefreshResponseSchema.parse(res.json());
      const rotated = res.cookies.find((c) => c.name === 'refresh_token')!;
      expect(rotated.value).not.toBe(cookie.value);
      expect(rotated.httpOnly).toBe(true);
      expect(rotated.secure).toBe(true);
      expect(rotated.sameSite).toBe('Strict');
      expect((await me(app, accessToken)).statusCode).toBe(200);
      // The new cookie keeps the session going.
      expect((await refresh(app, rotated.value)).statusCode).toBe(200);
    });
  });

  it('refuses a refresh token that was already rotated', async () => {
    await withApp({}, async (app) => {
      const { cookie } = await signIn(app);
      await refresh(app, cookie.value);

      const res = await refresh(app, cookie.value);

      expect(res.statusCode).toBe(401);
      expect(errorCode(res)).toBe(ErrorCode.UNAUTHENTICATED);
    });
  });

  it('answers 401 UNAUTHENTICATED without a cookie or with an unknown one', async () => {
    await withApp({}, async (app) => {
      for (const res of [await refresh(app), await refresh(app, 'made-up')]) {
        expect(res.statusCode).toBe(401);
        expect(errorCode(res)).toBe(ErrorCode.UNAUTHENTICATED);
      }
    });
  });

  it('refuses an expired session', async () => {
    await withApp({}, async (app) => {
      const { cookie } = await signIn(app);
      const pool = new Pool({ connectionString: inject('databaseUrl') });
      try {
        await pool.query(`update sessions set expires_at = now() - interval '1 second'`);
      } finally {
        await pool.end();
      }

      const res = await refresh(app, cookie.value);

      expect(res.statusCode).toBe(401);
    });
  });
});

describe('GET /users/me', () => {
  it('returns the current User profile', async () => {
    await withApp({}, async (app) => {
      const { accessToken } = await signIn(app);

      const res = await me(app, accessToken);

      expect(res.statusCode).toBe(200);
      expect(MeResponseSchema.parse(res.json()).user).toMatchObject({
        username: 'Alice',
        email: 'alice@example.com',
        nickname: null,
      });
      expect(res.body.toLowerCase()).not.toContain('password');
    });
  });

  it.each([
    ['no token', undefined],
    ['a malformed token', 'not.a.jwt'],
  ])('answers 401 UNAUTHENTICATED with %s', async (_name, token) => {
    await withApp({}, async (app) => {
      const res = await me(app, token);

      expect(res.statusCode).toBe(401);
      expect(errorCode(res)).toBe(ErrorCode.UNAUTHENTICATED);
    });
  });

  it('answers 401 UNAUTHENTICATED once the access token has expired', async () => {
    const time = testClock();
    await withApp({ clock: time.clock }, async (app) => {
      const { accessToken } = await signIn(app);

      time.advanceSeconds(15 * 60 - 1);
      expect((await me(app, accessToken)).statusCode).toBe(200);

      time.advanceSeconds(2);
      const res = await me(app, accessToken);
      expect(res.statusCode).toBe(401);
      expect(errorCode(res)).toBe(ErrorCode.UNAUTHENTICATED);
    });
  });

  it('refuses a token signed with a different key', async () => {
    await withApp({}, async (app) => {
      const { accessToken } = await signIn(app);
      const [header, payload] = accessToken.split('.');

      const res = await me(app, `${header}.${payload}.${'A'.repeat(86)}`);

      expect(res.statusCode).toBe(401);
    });
  });
});

describe('login rate limits', () => {
  const attempt = (app: NestFastifyApplication, identifier: string) =>
    app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { identifier, password: 'wrong password' },
    });

  it('allows 10 attempts per 15 minutes per IP, then answers 429 RATE_LIMITED', async () => {
    await withApp({}, async (app) => {
      for (let i = 0; i < 10; i++) {
        expect((await attempt(app, `user_${i}`)).statusCode).toBe(401);
      }

      const res = await attempt(app, 'user_11');

      expect(res.statusCode).toBe(429);
      expect(errorCode(res)).toBe(ErrorCode.RATE_LIMITED);
      expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
    });
  });

  it('allows 5 attempts per 15 minutes per identifier, in any capitalization', async () => {
    await withApp({}, async (app) => {
      for (const identifier of ['alice', 'ALICE', 'Alice', 'aLiCe', 'alice']) {
        expect((await attempt(app, identifier)).statusCode).toBe(401);
      }

      const res = await attempt(app, 'ALICE');

      expect(res.statusCode).toBe(429);
      expect(errorCode(res)).toBe(ErrorCode.RATE_LIMITED);
      expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
      // Another identifier from the same IP is unaffected.
      expect((await attempt(app, 'bob')).statusCode).toBe(401);
    });
  });
});

describe('logging', () => {
  it('captures neither the password nor any token from a login, refresh and profile read', async () => {
    await withApp({ config: { LOG_LEVEL: 'debug' } }, async (app, logs) => {
      const { accessToken, cookie } = await signIn(app);
      const refreshed = await refresh(app, cookie.value);
      const nextCookie = refreshed.cookies.find((c) => c.name === 'refresh_token')!;
      await me(app, accessToken);
      await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { identifier: 'alice', password: 'wrong-but-secret-pass' },
      });

      expect(logs.lines.length).toBeGreaterThan(0);
      for (const secret of [
        alice.password,
        'wrong-but-secret-pass',
        accessToken,
        accessToken.split('.')[2]!,
        cookie.value,
        nextCookie.value,
        RefreshResponseSchema.parse(refreshed.json()).accessToken,
      ]) {
        expect(logs.raw).not.toContain(secret);
      }
    });
  });

  it('tags log lines of an authenticated request with the User ID', async () => {
    await withApp({}, async (app, logs) => {
      const { accessToken } = await signIn(app);
      const profile = MeResponseSchema.parse((await me(app, accessToken)).json());

      const line = logs.lines.find((l) => l['route'] === '/api/v1/users/me');
      expect(line?.['userId']).toBe(profile.user.id);
    });
  });
});
