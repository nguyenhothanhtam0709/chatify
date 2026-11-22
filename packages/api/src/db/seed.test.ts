import type { LightMyRequestResponse } from 'fastify';
import {
  GetConversationResponseSchema,
  GetMessagesResponseSchema,
  ListConversationsResponseSchema,
  LoginResponseSchema,
} from '@chat/contracts';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Pool } from 'pg';
import { describe, expect, it, inject } from 'vitest';
import { withApp } from '../../test/app-harness.js';
import { SEED_PASSWORD, SEED_USERNAMES, assertNotProduction, seedDatabase } from './seed.js';

async function withPool<T>(run: (pool: Pool) => Promise<T>): Promise<T> {
  const pool = new Pool({ connectionString: inject('databaseUrl') });
  try {
    return await run(pool);
  } finally {
    await pool.end();
  }
}

async function loginAs(app: NestFastifyApplication, username: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { identifier: username, password: SEED_PASSWORD },
  });
  expect(res.statusCode).toBe(200);
  return LoginResponseSchema.parse(res.json()).accessToken;
}

const get = (
  app: NestFastifyApplication,
  token: string,
  url: string,
): Promise<LightMyRequestResponse> =>
  app.inject({
    method: 'GET',
    url: `/api/v1${url}`,
    headers: { authorization: `Bearer ${token}` },
  });
describe('seedDatabase', () => {
  it('lets every seeded User log in with the shared password', async () => {
    await withPool(seedDatabase);
    await withApp({}, async (app) => {
      for (const username of SEED_USERNAMES) await loginAs(app, username);
    });
  });

  it('can run twice without failing or duplicating anything', async () => {
    await withPool(seedDatabase);
    await withPool(seedDatabase);
    const counts = await withPool(async (pool) => {
      const count = async (table: string): Promise<number> =>
        Number((await pool.query(`select count(*) from ${table}`)).rows[0].count);
      return { users: await count('users'), conversations: await count('conversations') };
    });
    expect(counts).toEqual({ users: 5, conversations: 2 });
  });
  it('gives the Group a Former Member and history windows that follow the membership periods', async () => {
    await withPool(seedDatabase);
    await withApp({}, async (app) => {
      const alice = await loginAs(app, 'alice');
      const carol = await loginAs(app, 'carol');
      const dave = await loginAs(app, 'dave');

      const listed = ListConversationsResponseSchema.parse(
        (await get(app, alice, '/conversations')).json(),
      ).conversations;
      expect(listed.map((c) => c.kind).sort()).toEqual(['direct', 'group']);
      const group = listed.find((c) => c.kind === 'group');
      if (group?.kind !== 'group') throw new Error('Expected the seeded Group');
      expect(group.members.map((m) => m.username).sort()).toEqual(['alice', 'bob', 'carol']);
      const detail = GetConversationResponseSchema.parse(
        (await get(app, alice, `/conversations/${group.id}`)).json(),
      ).conversation;
      expect(detail.kind === 'group' && detail.ownerId).toBe(
        group.members.find((m) => m.username === 'alice')?.id,
      );

      const read = async (
        token: string,
      ): Promise<
        {
          id: string;
          conversationId: string;
          senderId: string;
          sequence: number;
          clientMessageId: string;
          kind: 'text' | 'member_added' | 'member_removed' | 'member_left' | 'owner_changed';
          body: string;
          createdAt: string;
          subject?: { id: string; username: string; nickname: string | null } | undefined;
        }[]
      > =>
        GetMessagesResponseSchema.parse(
          (await get(app, token, `/conversations/${group.id}/messages?limit=100`)).json(),
        ).messages;
      const aliceView = await read(alice);
      const daveView = await read(dave);
      const carolView = await read(carol);

      // Dave sees up to the System Message that removed him, never what followed.
      expect(daveView.at(0)?.kind).toBe('member_removed');
      expect(daveView.at(0)?.subject?.username).toBe('dave');
      expect(daveView.some((m) => m.kind === 'text')).toBe(true);
      expect(daveView.length).toBeLessThan(aliceView.length);
      // Carol joined later: nothing from before her member_added System Message.
      expect(carolView.length).toBeLessThan(aliceView.length);
      expect(carolView.map((m) => m.sequence)).not.toContain(1);
      expect(
        carolView.some((m) => m.kind === 'member_added' && m.subject?.username === 'carol'),
      ).toBe(true);
    });
  });
});

describe('assertNotProduction', () => {
  it('refuses to run in production', () => {
    expect(() => assertNotProduction({ NODE_ENV: 'production' })).toThrow(/production/);
    expect(() => assertNotProduction({ NODE_ENV: 'development' })).not.toThrow();
    expect(() => assertNotProduction({})).not.toThrow();
  });
});
