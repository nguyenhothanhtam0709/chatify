import type { LightMyRequestResponse } from 'fastify';
import {
  ErrorCode,
  ErrorResponseSchema,
  LoginResponseSchema,
  SearchUsersResponseSchema,
} from '@chat/contracts';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Pool } from 'pg';
import { describe, expect, inject, it } from 'vitest';
import { withApp } from '../../test/app-harness.js';

const password = 'correct horse battery';

async function signUp(
  app: NestFastifyApplication,
  username: string,
  nickname?: string,
): Promise<string> {
  await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: { username, email: `${username.toLowerCase()}@example.com`, password, nickname },
  });
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { identifier: username, password },
  });
  return LoginResponseSchema.parse(res.json()).accessToken;
}

function search(
  app: NestFastifyApplication,
  token: string | undefined,
  q: string | undefined,
): Promise<LightMyRequestResponse> {
  return app.inject({
    method: 'GET',
    url: '/api/v1/users/search',
    query: q === undefined ? {} : { q },
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

async function usernames(app: NestFastifyApplication, token: string, q: string): Promise<string[]> {
  const res = await search(app, token, q);
  expect(res.statusCode).toBe(200);
  return SearchUsersResponseSchema.parse(res.json()).users.map((u) => u.username);
}

// oxlint-disable-next-line max-lines-per-function -- a test suite or case keeps its setup and assertions in one block; splitting it would scatter them
describe('GET /users/search', () => {
  it('requires authentication', async () => {
    await withApp({}, async (app) => {
      const res = await search(app, undefined, 'al');

      expect(res.statusCode).toBe(401);
      expect(ErrorResponseSchema.parse(res.json()).error.code).toBe(ErrorCode.UNAUTHENTICATED);
    });
  });

  it('matches the start of a Username case-insensitively, not the middle', async () => {
    await withApp({}, async (app) => {
      const token = await signUp(app, 'zed');
      await signUp(app, 'Alice');
      await signUp(app, 'alfred');
      await signUp(app, 'Malik');

      expect((await usernames(app, token, 'AL')).sort()).toEqual(['Alice', 'alfred']);
    });
  });

  it('returns ID, Username and Nickname only, never the email', async () => {
    await withApp({}, async (app) => {
      const token = await signUp(app, 'zed');
      await signUp(app, 'Alice', 'Ali');
      await signUp(app, 'Albert');

      const res = await search(app, token, 'al');

      const body: unknown = res.json();
      const { users } = SearchUsersResponseSchema.parse(body);
      expect(
        users
          .map(({ username, nickname }) => ({ username, nickname }))
          .sort((a, b) => a.username.localeCompare(b.username)),
      ).toEqual(
        expect.arrayContaining([
          { username: 'Alice', nickname: 'Ali' },
          { username: 'Albert', nickname: null },
        ]),
      );
      expect(JSON.stringify(body)).not.toContain('@example.com');
    });
  });

  it('treats _ and % in the query literally', async () => {
    await withApp({}, async (app) => {
      const token = await signUp(app, 'zed');
      await signUp(app, 'a_b_one');
      await signUp(app, 'axb_two');

      expect(await usernames(app, token, 'a_b')).toEqual(['a_b_one']);
      expect(await usernames(app, token, 'a%')).toEqual([]);
      expect(await usernames(app, token, '%%')).toEqual([]);
    });
  });

  it('ranks an exact Username match first', async () => {
    await withApp({}, async (app) => {
      const token = await signUp(app, 'zed');
      await signUp(app, 'ann_a');
      await signUp(app, 'anna1');
      await signUp(app, 'Ann');
      await signUp(app, 'annabel');

      const found = await usernames(app, token, 'ann');

      expect(found[0]).toBe('Ann');
      expect(found).toHaveLength(4);
    });
  });

  it('returns at most 20 results', async () => {
    await withApp({}, async (app) => {
      const token = await signUp(app, 'zed');
      // Registration is rate limited per IP, so bulk fixtures are seeded directly.
      const pool = new Pool({ connectionString: inject('databaseUrl') });
      try {
        await pool.query(
          `insert into users (id, username, email, password_hash)
           select gen_random_uuid(), 'user' || n, 'user' || n || '@example.com', 'x'
           from generate_series(1, 22) as n`,
        );
      } finally {
        await pool.end();
      }

      expect(await usernames(app, token, 'user')).toHaveLength(20);
    });
  });

  it('excludes the searching User', async () => {
    await withApp({}, async (app) => {
      const token = await signUp(app, 'Alice');
      await signUp(app, 'Alicia');

      expect(await usernames(app, token, 'ali')).toEqual(['Alicia']);
      expect(await usernames(app, token, 'Alice')).toEqual([]);
    });
  });

  it.each([
    ['missing', undefined],
    ['1 character', 'a'],
    ['33 characters', 'a'.repeat(33)],
  ])('rejects a %s q with VALIDATION_FAILED', async (_name, q) => {
    await withApp({}, async (app) => {
      const token = await signUp(app, 'zed');

      const res = await search(app, token, q);

      expect(res.statusCode).toBe(400);
      expect(ErrorResponseSchema.parse(res.json()).error.code).toBe(ErrorCode.VALIDATION_FAILED);
    });
  });

  it('allows 30 searches per minute per User, then 429 RATE_LIMITED; other Users are unaffected', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const bob = await signUp(app, 'Bob');

      for (let i = 0; i < 30; i++) {
        expect((await search(app, alice, 'zz')).statusCode).toBe(200);
      }
      const limited = await search(app, alice, 'zz');

      expect(limited.statusCode).toBe(429);
      expect(ErrorResponseSchema.parse(limited.json()).error.code).toBe(ErrorCode.RATE_LIMITED);
      expect((await search(app, bob, 'zz')).statusCode).toBe(200);
    });
  });
});
