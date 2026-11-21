import type { LightMyRequestResponse } from 'fastify';
import { ErrorCode, ErrorResponseSchema, LoginResponseSchema } from '@chat/contracts';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Pool } from 'pg';
import { describe, expect, inject, it } from 'vitest';
import { withApp } from '../../test/app-harness.js';

const alice = { username: 'Alice', email: 'alice@example.com', password: 'correct horse battery' };

async function signIn(
  app: NestFastifyApplication,
): Promise<{ accessToken: string; cookie: LightMyRequestResponse['cookies'][number] }> {
  await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: alice });
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { identifier: 'alice', password: alice.password },
  });
  expect(res.statusCode).toBe(200);
  const { accessToken } = LoginResponseSchema.parse(res.json());
  const cookie = res.cookies.find((c) => c.name === 'refresh_token')!;
  return { accessToken, cookie };
}

const bearer = (accessToken?: string): { authorization: string } | { authorization?: never } =>
  accessToken ? { authorization: `Bearer ${accessToken}` } : {};

const me = (app: NestFastifyApplication, accessToken?: string): Promise<LightMyRequestResponse> =>
  app.inject({ method: 'GET', url: '/api/v1/users/me', headers: bearer(accessToken) });

const logout = (
  app: NestFastifyApplication,
  accessToken?: string,
): Promise<LightMyRequestResponse> =>
  app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers: bearer(accessToken) });

const refresh = (app: NestFastifyApplication, token: string): Promise<LightMyRequestResponse> =>
  app.inject({ method: 'POST', url: '/api/v1/auth/refresh', cookies: { refresh_token: token } });

const errorCode = (res: { json: () => unknown }): ErrorCode =>
  ErrorResponseSchema.parse(res.json()).error.code;

async function query<T extends object>(sql: string): Promise<T[]> {
  const pool = new Pool({ connectionString: inject('databaseUrl') });
  try {
    return (await pool.query<T>(sql)).rows;
  } finally {
    await pool.end();
  }
}

// oxlint-disable-next-line max-lines-per-function -- a test suite or case keeps its setup and assertions in one block; splitting it would scatter them
describe('POST /auth/logout', () => {
  it('ends the session: the access token is refused at once with SESSION_REVOKED', async () => {
    await withApp({}, async (app) => {
      const { accessToken } = await signIn(app);
      expect((await me(app, accessToken)).statusCode).toBe(200);

      const res = await logout(app, accessToken);

      expect(res.statusCode).toBe(204);
      const after = await me(app, accessToken);
      expect(after.statusCode).toBe(401);
      expect(errorCode(after)).toBe(ErrorCode.SESSION_REVOKED);
    });
  });

  it('kills the refresh token and clears the cookie', async () => {
    await withApp({}, async (app) => {
      const { accessToken, cookie } = await signIn(app);

      const res = await logout(app, accessToken);

      const cleared = res.cookies.find((c) => c.name === 'refresh_token')!;
      expect(cleared.value).toBe('');
      expect(cleared.path).toBe('/api/v1/auth');
      expect((await refresh(app, cookie.value)).statusCode).toBe(401);
    });
  });

  it('leaves the same User’s other sessions alone', async () => {
    await withApp({}, async (app) => {
      const first = await signIn(app);
      const second = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { identifier: 'alice', password: alice.password },
      });
      const secondToken = LoginResponseSchema.parse(second.json()).accessToken;

      await logout(app, first.accessToken);

      expect((await me(app, secondToken)).statusCode).toBe(200);
    });
  });

  it('requires an access token', async () => {
    await withApp({}, async (app) => {
      const res = await logout(app);

      expect(res.statusCode).toBe(401);
      expect(errorCode(res)).toBe(ErrorCode.UNAUTHENTICATED);
    });
  });

  it('sweeps expired deny-list entries on later logouts', async () => {
    await withApp({}, async (app) => {
      const first = await signIn(app);
      await logout(app, first.accessToken);
      expect(await query('select jti from token_deny_list')).toHaveLength(1);

      await query(`update token_deny_list set expires_at = now() - interval '1 second'`);
      const second = await signIn(app);
      await logout(app, second.accessToken);

      const rows = await query<{ jti: string }>('select jti from token_deny_list');
      expect(rows).toHaveLength(1);
    });
  });
});

describe('refresh-token reuse', () => {
  it('revokes the whole session when a rotated refresh token is replayed', async () => {
    await withApp({}, async (app) => {
      const { cookie } = await signIn(app);
      const rotated = await refresh(app, cookie.value);
      const current = rotated.cookies.find((c) => c.name === 'refresh_token')!;
      const { accessToken } = rotated.json() as { accessToken: string };

      const replay = await refresh(app, cookie.value);

      expect(replay.statusCode).toBe(401);
      expect(errorCode(replay)).toBe(ErrorCode.UNAUTHENTICATED);
      // The legitimate holder of the newest token is cut off too, and so is its access token.
      expect((await refresh(app, current.value)).statusCode).toBe(401);
      const after = await me(app, accessToken);
      expect(after.statusCode).toBe(401);
      expect(errorCode(after)).toBe(ErrorCode.SESSION_REVOKED);
    });
  });

  it('does not revoke anything for a token that was never issued', async () => {
    await withApp({}, async (app) => {
      const { cookie } = await signIn(app);

      expect((await refresh(app, 'made-up')).statusCode).toBe(401);

      expect((await refresh(app, cookie.value)).statusCode).toBe(200);
    });
  });
});
