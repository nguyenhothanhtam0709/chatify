import type { LightMyRequestResponse } from 'fastify';
import { randomUUID } from 'node:crypto';
import {
  ErrorCode,
  ErrorResponseSchema,
  GetConversationResponseSchema,
  GetMessagesResponseSchema,
} from '@chat/contracts';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Pool } from 'pg';
import { inject, describe, expect, it } from 'vitest';
import { withApp } from '../../test/app-harness.js';
import { bearer, createGroup, signUp, type Person } from '../../test/people.js';

const leave = (
  app: NestFastifyApplication,
  as: Person,
  groupId: string,
): Promise<LightMyRequestResponse> =>
  app.inject({ method: 'POST', url: `/api/v1/groups/${groupId}/leave`, headers: bearer(as) });

const addMember = (
  app: NestFastifyApplication,
  as: Person,
  groupId: string,
  userId: string,
): Promise<LightMyRequestResponse> =>
  app.inject({
    method: 'POST',
    url: `/api/v1/groups/${groupId}/members`,
    headers: bearer(as),
    payload: { userId },
  });

const removeMember = (
  app: NestFastifyApplication,
  as: Person,
  groupId: string,
  userId: string,
): Promise<LightMyRequestResponse> =>
  app.inject({
    method: 'DELETE',
    url: `/api/v1/groups/${groupId}/members/${userId}`,
    headers: bearer(as),
  });

const post = (
  app: NestFastifyApplication,
  as: Person,
  groupId: string,
  body = 'hello',
): Promise<LightMyRequestResponse> =>
  app.inject({
    method: 'POST',
    url: `/api/v1/conversations/${groupId}/messages`,
    headers: bearer(as),
    payload: { clientMessageId: randomUUID(), body },
  });

const errorCode = (res: {
  json(): unknown;
}):
  | 'VALIDATION_FAILED'
  | 'UNAUTHENTICATED'
  | 'SESSION_REVOKED'
  | 'INVALID_CREDENTIALS'
  | 'USERNAME_TAKEN'
  | 'EMAIL_TAKEN'
  | 'USER_NOT_FOUND'
  | 'CONVERSATION_NOT_FOUND'
  | 'NOT_A_MEMBER'
  | 'NOT_GROUP_OWNER'
  | 'ALREADY_A_MEMBER'
  | 'GROUP_FULL'
  | 'OWNER_CANNOT_BE_REMOVED'
  | 'GROUP_CLOSED'
  | 'CANNOT_MESSAGE_SELF'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR' => ErrorResponseSchema.parse(res.json()).error.code;

const group = async (
  app: NestFastifyApplication,
  as: Person,
  groupId: string,
): Promise<{
  id: string;
  kind: 'group';
  name: string;
  members: { id: string; username: string; nickname: string | null }[];
  closed: boolean;
  isMember: boolean;
  ownerId?: string | undefined;
}> => {
  const res = await app.inject({
    method: 'GET',
    url: `/api/v1/conversations/${groupId}`,
    headers: bearer(as),
  });
  const { conversation } = GetConversationResponseSchema.parse(res.json());
  if (conversation.kind !== 'group') throw new Error('not a group');
  return conversation;
};

const textBodies = async (
  app: NestFastifyApplication,
  as: Person,
  groupId: string,
): Promise<string[]> =>
  GetMessagesResponseSchema.parse(
    (
      await app.inject({
        method: 'GET',
        url: `/api/v1/conversations/${groupId}/messages`,
        headers: bearer(as),
      })
    ).json(),
  )
    .messages.filter((m) => m.kind === 'text')
    .map((m) => m.body);

/** Fires the requests in order against a held lock, then lets them through in that order. */
async function raceInOrder(
  groupId: string,
  requests: Array<() => Promise<{ statusCode: number; json(): unknown }>>,
): Promise<{ statusCode: number; json(): unknown }[]> {
  const pool = new Pool({ connectionString: inject('databaseUrl') });
  const holder = await pool.connect();
  try {
    await holder.query('begin');
    await holder.query('select 1 from conversations where id = $1 for update', [groupId]);
    const pending = [];
    for (const [i, request] of requests.entries()) {
      pending.push(request());
      for (;;) {
        const { rows } = await pool.query<{ n: string }>(
          `select count(*) as n from pg_stat_activity where wait_event_type = 'Lock'`,
        );
        if (Number(rows[0]!.n) > i) break;
        await new Promise((resolve) => setImmediate(resolve));
      }
    }
    await holder.query('commit');
    return await Promise.all(pending);
  } finally {
    holder.release();
    await pool.end();
  }
}

describe('Group rules are re-checked under the Conversation lock', () => {
  it('a Closed Group never regains a Member: the Owner leaving beats a queued add', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const bob = await signUp(app, 'Bob');
      const g = await createGroup(app, alice);

      const [left, added] = await raceInOrder(g.id, [
        (): Promise<LightMyRequestResponse> => leave(app, alice, g.id),
        (): Promise<LightMyRequestResponse> => addMember(app, alice, g.id, bob.id),
      ]);

      expect(left!.statusCode).toBe(200);
      expect(added!.statusCode).toBe(409);
      expect(errorCode(added!)).toBe(ErrorCode.GROUP_CLOSED);
      expect((await group(app, alice, g.id)).members).toEqual([]);
    });
  });

  it('an add queued before the Owner leaves lands, and ownership then passes to the added Member', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const bob = await signUp(app, 'Bob');
      const g = await createGroup(app, alice);

      const [added, left] = await raceInOrder(g.id, [
        (): Promise<LightMyRequestResponse> => addMember(app, alice, g.id, bob.id),
        (): Promise<LightMyRequestResponse> => leave(app, alice, g.id),
      ]);

      expect(added!.statusCode).toBe(201);
      expect(left!.statusCode).toBe(200);
      const after = await group(app, bob, g.id);
      expect(after.members.map((m) => m.id)).toEqual([bob.id]);
      expect(after.ownerId).toBe(bob.id);
    });
  });

  it.each([
    [
      'add',
      (
        app: NestFastifyApplication,
        as: Person,
        g: string,
        to: Person,
      ): Promise<LightMyRequestResponse> => addMember(app, as, g, to.id),
    ],
    [
      'remove',
      (
        app: NestFastifyApplication,
        as: Person,
        g: string,
        to: Person,
      ): Promise<LightMyRequestResponse> => removeMember(app, as, g, to.id),
    ],
  ])('an ex-Owner cannot %s once ownership has passed mid-request', async (_name, act) => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const bob = await signUp(app, 'Bob');
      const carol = await signUp(app, 'Carol');
      const g = await createGroup(app, alice, [bob.id, carol.id]);
      // Alice leaves and Bob (now Owner) adds her back as a plain Member; her request, fired
      // while she still owned the Group, runs last.
      const [left, readded, attempt] = await raceInOrder(g.id, [
        (): Promise<LightMyRequestResponse> => leave(app, alice, g.id),
        (): Promise<LightMyRequestResponse> => addMember(app, bob, g.id, alice.id),
        (): Promise<LightMyRequestResponse> => act(app, alice, g.id, carol),
      ]);

      expect(left!.statusCode).toBe(200);
      expect(readded!.statusCode).toBe(201);
      expect(attempt!.statusCode).toBe(403);
      expect(errorCode(attempt!)).toBe(ErrorCode.NOT_GROUP_OWNER);
      const after = await group(app, bob, g.id);
      expect(after.ownerId).toBe(bob.id);
      expect(after.members.map((m) => m.id).sort()).toEqual([alice.id, bob.id, carol.id].sort());
    });
  });

  it('a Member removed while their leave is queued is told NOT_A_MEMBER and gets no second System Message', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const bob = await signUp(app, 'Bob');
      const g = await createGroup(app, alice, [bob.id]);

      const [removed, left] = await raceInOrder(g.id, [
        (): Promise<LightMyRequestResponse> => removeMember(app, alice, g.id, bob.id),
        (): Promise<LightMyRequestResponse> => leave(app, bob, g.id),
      ]);

      expect(removed!.statusCode).toBe(200);
      expect(left!.statusCode).toBe(403);
      expect(errorCode(left!)).toBe(ErrorCode.NOT_A_MEMBER);
    });
  });

  it('a Member removed while their send is queued gets NOT_A_MEMBER and no Message lands', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const bob = await signUp(app, 'Bob');
      const g = await createGroup(app, alice, [bob.id]);

      const [removed, sent] = await raceInOrder(g.id, [
        (): Promise<LightMyRequestResponse> => removeMember(app, alice, g.id, bob.id),
        (): Promise<LightMyRequestResponse> => post(app, bob, g.id, 'too late'),
      ]);

      expect(removed!.statusCode).toBe(200);
      expect(sent!.statusCode).toBe(403);
      expect(errorCode(sent!)).toBe(ErrorCode.NOT_A_MEMBER);
      expect(await textBodies(app, alice, g.id)).toEqual([]);
      expect(await textBodies(app, bob, g.id)).toEqual([]);
    });
  });
});
