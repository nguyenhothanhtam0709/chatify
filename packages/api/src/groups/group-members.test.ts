import type { LightMyRequestResponse } from 'fastify';
import { randomUUID } from 'node:crypto';
import {
  ConversationCreatedEventSchema,
  ErrorCode,
  ErrorResponseSchema,
  GetConversationResponseSchema,
  GroupMemberAddedEventSchema,
  GroupMemberRemovedEventSchema,
  GroupMembershipResponseSchema,
  SendDirectMessageResponseSchema,
} from '@chat/contracts';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { Pool } from 'pg';
import { afterEach, describe, expect, it } from 'vitest';
import { withApp } from '../../test/app-harness.js';
import { bearer, createGroup, signUp, type Person } from '../../test/people.js';
import { closeAllSockets, connectSocket, listenOnRandomPort } from '../../test/socket-client.js';
import { PG_POOL } from '../db/database.module.js';

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

const memberIdsOf = (res: { json(): unknown }): string[] =>
  GroupMembershipResponseSchema.parse(res.json())
    .conversation.members.map((m) => m.id)
    .sort();

const settle = (): Promise<unknown> => new Promise((resolve) => setTimeout(resolve, 100));

afterEach(closeAllSockets);

describe('POST /groups/:id/members', () => {
  it('requires authentication', async () => {
    await withApp({}, async (app) => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/groups/${randomUUID()}/members`,
        payload: { userId: randomUUID() },
      });

      expect(res.statusCode).toBe(401);
      expect(errorCode(res)).toBe(ErrorCode.UNAUTHENTICATED);
    });
  });

  it('lets the Owner add a User, who is a Member at once and can read and post', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const bob = await signUp(app, 'Bob');
      const group = await createGroup(app, alice);

      const res = await addMember(app, alice, group.id, bob.id);

      expect(res.statusCode).toBe(201);
      expect(memberIdsOf(res)).toEqual([alice.id, bob.id].sort());
      const asBob = await app.inject({
        method: 'GET',
        url: `/api/v1/conversations/${group.id}`,
        headers: bearer(bob),
      });
      expect(GetConversationResponseSchema.parse(asBob.json()).conversation).toMatchObject({
        kind: 'group',
        ownerId: alice.id,
      });
      expect((await post(app, bob, group.id)).statusCode).toBe(201);
    });
  });

  it('refuses a Member who is not the Owner with NOT_GROUP_OWNER', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const bob = await signUp(app, 'Bob');
      const carol = await signUp(app, 'Carol');
      const group = await createGroup(app, alice, [bob.id]);

      const res = await addMember(app, bob, group.id, carol.id);

      expect(res.statusCode).toBe(403);
      expect(errorCode(res)).toBe(ErrorCode.NOT_GROUP_OWNER);
      const check = await addMember(app, alice, group.id, carol.id);
      expect(memberIdsOf(check)).toContain(carol.id);
    });
  });

  it('answers CONVERSATION_NOT_FOUND for a non-Member, an unknown ID and a Direct Conversation', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const bob = await signUp(app, 'Bob');
      const dave = await signUp(app, 'Dave');
      const group = await createGroup(app, alice);
      const direct = SendDirectMessageResponseSchema.parse(
        (
          await app.inject({
            method: 'POST',
            url: '/api/v1/direct-messages',
            headers: bearer(alice),
            payload: { recipientId: bob.id, clientMessageId: randomUUID(), body: 'hi' },
          })
        ).json(),
      ).conversation;

      for (const id of [group.id, randomUUID(), direct.id]) {
        const as = id === group.id ? dave : alice;
        const res = await addMember(app, as, id, dave.id);
        expect(res.statusCode).toBe(404);
        expect(errorCode(res)).toBe(ErrorCode.CONVERSATION_NOT_FOUND);
      }
    });
  });

  it('answers ALREADY_A_MEMBER for an existing Member, the Owner included', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const bob = await signUp(app, 'Bob');
      const group = await createGroup(app, alice, [bob.id]);

      for (const userId of [bob.id, alice.id]) {
        const res = await addMember(app, alice, group.id, userId);
        expect(res.statusCode).toBe(409);
        expect(errorCode(res)).toBe(ErrorCode.ALREADY_A_MEMBER);
      }
    });
  });

  it('answers USER_NOT_FOUND for an unknown User and VALIDATION_FAILED for a malformed ID', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const group = await createGroup(app, alice);

      const unknown = await addMember(app, alice, group.id, randomUUID());
      const malformed = await addMember(app, alice, group.id, 'bob');

      expect(unknown.statusCode).toBe(404);
      expect(errorCode(unknown)).toBe(ErrorCode.USER_NOT_FOUND);
      expect(malformed.statusCode).toBe(400);
      expect(errorCode(malformed)).toBe(ErrorCode.VALIDATION_FAILED);
    });
  });

  it('allows up to 256 Members including the Owner and answers GROUP_FULL beyond', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const { rows } = await app.get<Pool>(PG_POOL).query<{ id: string }>(
        `insert into users (username, email, password_hash)
         select 'bulk_' || n, 'bulk' || n || '@example.com', 'x' from generate_series(1, 256) n
         returning id`,
      );
      const ids = rows.map((r) => r.id);
      const group = await createGroup(app, alice, ids.slice(0, 254));

      const last = await addMember(app, alice, group.id, ids[254]!);
      const over = await addMember(app, alice, group.id, ids[255]!);

      expect(last.statusCode).toBe(201);
      expect(memberIdsOf(last)).toHaveLength(256);
      expect(over.statusCode).toBe(409);
      expect(errorCode(over)).toBe(ErrorCode.GROUP_FULL);
    });
  });

  it('pushes group.member_added to every current Member and conversation.created to the added User only', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const bob = await signUp(app, 'Bob');
      const carol = await signUp(app, 'Carol');
      const dave = await signUp(app, 'Dave');
      const group = await createGroup(app, alice, [bob.id]);
      const url = await listenOnRandomPort(app);
      const sockets = {
        alice: await connectSocket(url, alice.token),
        bob: await connectSocket(url, bob.token),
        carol: await connectSocket(url, carol.token),
        dave: await connectSocket(url, dave.token),
      };
      const added = [sockets.alice, sockets.bob, sockets.carol].map((s) =>
        s.next('group.member_added'),
      );
      const created = sockets.carol.next('conversation.created');

      await addMember(app, alice, group.id, carol.id);

      for (const payload of await Promise.all(added)) {
        expect(GroupMemberAddedEventSchema.parse(payload)).toEqual({
          conversationId: group.id,
          member: { id: carol.id, username: 'Carol', nickname: null },
        });
      }
      expect(ConversationCreatedEventSchema.parse(await created).conversation).toMatchObject({
        id: group.id,
        kind: 'group',
        name: 'Club',
        lastMessage: null,
      });
      await settle();
      expect(sockets.dave.received).toEqual([]);
      for (const s of [sockets.alice, sockets.bob]) {
        expect(s.received.map(([name]) => name)).toEqual(['group.member_added', 'message.created']);
      }
    });
  });
});

describe('DELETE /groups/:id/members/:userId', () => {
  it('lets the Owner remove a Member, who can then no longer post', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const bob = await signUp(app, 'Bob');
      const group = await createGroup(app, alice, [bob.id]);

      const res = await removeMember(app, alice, group.id, bob.id);

      expect(res.statusCode).toBe(200);
      expect(memberIdsOf(res)).toEqual([alice.id]);
      const posted = await post(app, bob, group.id);
      expect(posted.statusCode).toBe(403);
      expect(errorCode(posted)).toBe(ErrorCode.NOT_A_MEMBER);
    });
  });

  it('still answers CONVERSATION_NOT_FOUND to a User who was never a Member', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const dave = await signUp(app, 'Dave');
      const group = await createGroup(app, alice);

      const posted = await post(app, dave, group.id);

      expect(posted.statusCode).toBe(404);
      expect(errorCode(posted)).toBe(ErrorCode.CONVERSATION_NOT_FOUND);
    });
  });

  it('refuses a Member who is not the Owner with NOT_GROUP_OWNER', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const bob = await signUp(app, 'Bob');
      const carol = await signUp(app, 'Carol');
      const group = await createGroup(app, alice, [bob.id, carol.id]);

      const res = await removeMember(app, bob, group.id, carol.id);

      expect(res.statusCode).toBe(403);
      expect(errorCode(res)).toBe(ErrorCode.NOT_GROUP_OWNER);
      expect((await post(app, carol, group.id)).statusCode).toBe(201);
    });
  });

  it('does not let the Owner remove themselves', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const group = await createGroup(app, alice);

      const res = await removeMember(app, alice, group.id, alice.id);

      expect(res.statusCode).toBe(409);
      expect(errorCode(res)).toBe(ErrorCode.OWNER_CANNOT_BE_REMOVED);
      expect((await post(app, alice, group.id)).statusCode).toBe(201);
    });
  });

  it('answers NOT_A_MEMBER when the User is not in the Group, and CONVERSATION_NOT_FOUND to outsiders', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const dave = await signUp(app, 'Dave');
      const group = await createGroup(app, alice);

      const notInGroup = await removeMember(app, alice, group.id, dave.id);
      const outsider = await removeMember(app, dave, group.id, alice.id);

      expect(notInGroup.statusCode).toBe(403);
      expect(errorCode(notInGroup)).toBe(ErrorCode.NOT_A_MEMBER);
      expect(outsider.statusCode).toBe(404);
      expect(errorCode(outsider)).toBe(ErrorCode.CONVERSATION_NOT_FOUND);
    });
  });

  it('pushes group.member_removed to the remaining Members, and the removed User gets no more pushes', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const bob = await signUp(app, 'Bob');
      const carol = await signUp(app, 'Carol');
      const group = await createGroup(app, alice, [bob.id, carol.id]);
      const url = await listenOnRandomPort(app);
      const aliceSocket = await connectSocket(url, alice.token);
      const bobSocket = await connectSocket(url, bob.token);
      const carolSocket = await connectSocket(url, carol.token);
      const removed = [aliceSocket, carolSocket].map((s) => s.next('group.member_removed'));

      await removeMember(app, alice, group.id, bob.id);

      for (const payload of await Promise.all(removed)) {
        expect(GroupMemberRemovedEventSchema.parse(payload)).toEqual({
          conversationId: group.id,
          member: { id: bob.id, username: 'Bob', nickname: null },
        });
      }
      const delivered = carolSocket.next('message.created');
      await post(app, alice, group.id, 'after bob left');
      await delivered;
      await settle();
      expect(bobSocket.received.map(([name]) => name)).toEqual(['group.membership_ended']);
    });
  });

  it('lets the Owner add a removed Member back', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const bob = await signUp(app, 'Bob');
      const group = await createGroup(app, alice, [bob.id]);
      await removeMember(app, alice, group.id, bob.id);

      const res = await addMember(app, alice, group.id, bob.id);

      expect(res.statusCode).toBe(201);
      expect((await post(app, bob, group.id)).statusCode).toBe(201);
    });
  });
});
