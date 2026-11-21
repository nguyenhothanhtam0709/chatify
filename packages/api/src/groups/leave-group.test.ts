import type { LightMyRequestResponse } from 'fastify';
import { randomUUID } from 'node:crypto';
import {
  ErrorCode,
  ErrorResponseSchema,
  GetConversationResponseSchema,
  GetMessagesResponseSchema,
  GroupClosedEventSchema,
  GroupMemberLeftEventSchema,
  GroupMembershipResponseSchema,
  GroupOwnerChangedEventSchema,
  ListConversationsResponseSchema,
} from '@chat/contracts';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { withApp } from '../../test/app-harness.js';
import { bearer, createGroup, signUp, type Person } from '../../test/people.js';
import { closeAllSockets, connectSocket, listenOnRandomPort } from '../../test/socket-client.js';

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

const ownerOf = async (
  app: NestFastifyApplication,
  as: Person,
  groupId: string,
): Promise<string | undefined> => {
  const res = await app.inject({
    method: 'GET',
    url: `/api/v1/conversations/${groupId}`,
    headers: bearer(as),
  });
  const { conversation } = GetConversationResponseSchema.parse(res.json());
  return conversation.kind === 'group' ? conversation.ownerId : undefined;
};

const readBodies = async (
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
    .map((m) => m.body)
    .sort();

const settle = (): Promise<unknown> => new Promise((resolve) => setTimeout(resolve, 100));

afterEach(closeAllSockets);

describe('POST /groups/:id/leave', () => {
  it('lets a Member leave: they become a Former Member who can read but not post', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const bob = await signUp(app, 'Bob');
      const group = await createGroup(app, alice, [bob.id]);
      await post(app, bob, group.id, 'before');

      const res = await leave(app, bob, group.id);

      expect(res.statusCode).toBe(200);
      const left = GroupMembershipResponseSchema.parse(res.json()).conversation;
      // The leaver is a Former Member now: the response shows them no Members and no Owner.
      expect(left.members).toEqual([]);
      expect(left.ownerId).toBeUndefined();
      expect(left.closed).toBe(false);
      const posted = await post(app, bob, group.id);
      expect(posted.statusCode).toBe(403);
      expect(errorCode(posted)).toBe(ErrorCode.NOT_A_MEMBER);
      await post(app, alice, group.id, 'after');
      expect(await readBodies(app, bob, group.id)).toEqual(['before']);
    });
  });

  it('answers 404 to a never-Member and an unknown ID, and NOT_A_MEMBER to a Former Member', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const bob = await signUp(app, 'Bob');
      const dave = await signUp(app, 'Dave');
      const group = await createGroup(app, alice, [bob.id]);
      await leave(app, bob, group.id);

      for (const id of [group.id, randomUUID()]) {
        const res = await leave(app, dave, id);
        expect(res.statusCode).toBe(404);
        expect(errorCode(res)).toBe(ErrorCode.CONVERSATION_NOT_FOUND);
      }
      const again = await leave(app, bob, group.id);
      expect(again.statusCode).toBe(403);
      expect(errorCode(again)).toBe(ErrorCode.NOT_A_MEMBER);
    });
  });

  it('passes ownership to the Member with the longest current period when the Owner leaves', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const bob = await signUp(app, 'Bob');
      const carol = await signUp(app, 'Carol');
      const dave = await signUp(app, 'Dave');
      const group = await createGroup(app, alice, [dave.id]);
      await addMember(app, alice, group.id, carol.id);
      await addMember(app, alice, group.id, bob.id);
      // Dave leaves and is added again: his current period is now the newest, so the
      // longest-standing Member is Carol, not Dave (who has the oldest first period).
      await leave(app, dave, group.id);
      await addMember(app, alice, group.id, dave.id);

      const res = await leave(app, alice, group.id);

      expect(res.statusCode).toBe(200);
      expect(await ownerOf(app, bob, group.id)).toBe(carol.id);
      // The new Owner can manage Members.
      expect((await addMember(app, carol, group.id, alice.id)).statusCode).toBe(201);
    });
  });

  it('pushes group.member_left and group.owner_changed to the remaining Members only', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const bob = await signUp(app, 'Bob');
      const carol = await signUp(app, 'Carol');
      const group = await createGroup(app, alice, [bob.id, carol.id]);
      const url = await listenOnRandomPort(app);
      const sockets = {
        alice: await connectSocket(url, alice.token),
        bob: await connectSocket(url, bob.token),
        carol: await connectSocket(url, carol.token),
      };
      const left = [sockets.bob, sockets.carol].map((s) => s.next('group.member_left'));
      const changed = [sockets.bob, sockets.carol].map((s) => s.next('group.owner_changed'));

      await leave(app, alice, group.id);

      for (const payload of await Promise.all(left)) {
        expect(GroupMemberLeftEventSchema.parse(payload)).toEqual({
          conversationId: group.id,
          member: { id: alice.id, username: 'Alice', nickname: null },
        });
      }
      const ownerId = await ownerOf(app, bob, group.id);
      expect([bob.id, carol.id]).toContain(ownerId);
      for (const payload of await Promise.all(changed)) {
        expect(GroupOwnerChangedEventSchema.parse(payload)).toEqual({
          conversationId: group.id,
          ownerId,
        });
      }
      await settle();
      expect(sockets.alice.received.map(([name]) => name)).toEqual(['group.membership_ended']);
    });
  });

  it('does not push owner_changed when a non-Owner leaves', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const bob = await signUp(app, 'Bob');
      const group = await createGroup(app, alice, [bob.id]);
      const url = await listenOnRandomPort(app);
      const aliceSocket = await connectSocket(url, alice.token);
      const left = aliceSocket.next('group.member_left');

      await leave(app, bob, group.id);
      await left;
      await settle();

      expect(aliceSocket.received.map(([name]) => name)).toEqual([
        'group.member_left',
        'message.created',
      ]);
    });
  });

  it('closes the Group when the last Member leaves and pushes group.closed to them', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const bob = await signUp(app, 'Bob');
      const group = await createGroup(app, alice, [bob.id]);
      await leave(app, bob, group.id);
      const url = await listenOnRandomPort(app);
      const aliceSocket = await connectSocket(url, alice.token);
      const closed = aliceSocket.next('group.closed');

      const res = await leave(app, alice, group.id);

      expect(res.statusCode).toBe(200);
      expect(GroupMembershipResponseSchema.parse(res.json()).conversation.members).toEqual([]);
      expect(GroupClosedEventSchema.parse(await closed)).toEqual({ conversationId: group.id });
      await settle();
      expect(aliceSocket.received.map(([name]) => name)).toEqual(['group.closed']);
    });
  });

  it('pushes group.closed to Former Members, who left or were removed earlier', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const bob = await signUp(app, 'Bob');
      const carol = await signUp(app, 'Carol');
      const group = await createGroup(app, alice, [bob.id, carol.id]);
      await app.inject({
        method: 'DELETE',
        url: `/api/v1/groups/${group.id}/members/${bob.id}`,
        headers: bearer(alice),
      });
      await leave(app, carol, group.id);
      const url = await listenOnRandomPort(app);
      const bobSocket = await connectSocket(url, bob.token);
      const carolSocket = await connectSocket(url, carol.token);
      const bobClosed = bobSocket.next('group.closed');
      const carolClosed = carolSocket.next('group.closed');

      await leave(app, alice, group.id);

      expect(GroupClosedEventSchema.parse(await bobClosed)).toEqual({ conversationId: group.id });
      expect(GroupClosedEventSchema.parse(await carolClosed)).toEqual({
        conversationId: group.id,
      });
      await settle();
      expect(bobSocket.received.map(([name]) => name)).toEqual(['group.closed']);
      expect(carolSocket.received.map(([name]) => name)).toEqual(['group.closed']);
    });
  });

  it('rejects sending to, adding to and leaving a Closed Group with GROUP_CLOSED', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const bob = await signUp(app, 'Bob');
      const dave = await signUp(app, 'Dave');
      const group = await createGroup(app, alice, [bob.id]);
      await leave(app, bob, group.id);
      await leave(app, alice, group.id);

      for (const res of [
        await post(app, alice, group.id),
        await post(app, bob, group.id),
        await addMember(app, alice, group.id, dave.id),
        await leave(app, bob, group.id),
      ]) {
        expect(res.statusCode).toBe(409);
        expect(errorCode(res)).toBe(ErrorCode.GROUP_CLOSED);
      }
      const outsider = await post(app, dave, group.id);
      expect(outsider.statusCode).toBe(404);
    });
  });

  it('lets Former Members read their windows of a Closed Group', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const bob = await signUp(app, 'Bob');
      const group = await createGroup(app, alice, [bob.id]);
      await post(app, bob, group.id, 'one');
      await leave(app, bob, group.id);
      await post(app, alice, group.id, 'two');
      await leave(app, alice, group.id);

      expect(await readBodies(app, bob, group.id)).toEqual(['one']);
      expect(await readBodies(app, alice, group.id)).toEqual(['one', 'two']);
      const list = await app.inject({
        method: 'GET',
        url: '/api/v1/conversations',
        headers: bearer(alice),
      });
      expect(ListConversationsResponseSchema.parse(list.json()).conversations[0]).toMatchObject({
        id: group.id,
        isMember: false,
        members: [],
      });
    });
  });
});

describe('the closed flag', () => {
  const getGroup = async (
    app: NestFastifyApplication,
    as: Person,
    groupId: string,
  ): Promise<
    | {
        id: string;
        kind: 'direct';
        members: { id: string; username: string; nickname: string | null }[];
        readUpToSequence?: number | undefined;
      }
    | {
        id: string;
        kind: 'group';
        name: string;
        members: { id: string; username: string; nickname: string | null }[];
        closed: boolean;
        isMember: boolean;
        ownerId?: string | undefined;
      }
  > => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/conversations/${groupId}`,
      headers: bearer(as),
    });
    return GetConversationResponseSchema.parse(res.json()).conversation;
  };
  const listed = async (
    app: NestFastifyApplication,
    as: Person,
    groupId: string,
  ): Promise<
    | {
        id: string;
        kind: 'direct' | 'group';
        name: string;
        members: { id: string; username: string; nickname: string | null }[];
        isMember: boolean;
        closed: boolean;
        lastMessage: {
          senderId: string;
          sequence: number;
          preview: string;
          createdAt: string;
        } | null;
        unreadCount: number;
      }
    | undefined
  > => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/conversations',
      headers: bearer(as),
    });
    return ListConversationsResponseSchema.parse(res.json()).conversations.find(
      (c) => c.id === groupId,
    );
  };

  it('tells the caller whether they are a current Member on GET /conversations/:id', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const bob = await signUp(app, 'Bob');
      const group = await createGroup(app, alice, [bob.id]);
      expect(await getGroup(app, alice, group.id)).toMatchObject({ isMember: true });
      expect(await getGroup(app, bob, group.id)).toMatchObject({ isMember: true });

      await leave(app, bob, group.id);

      expect(await getGroup(app, bob, group.id)).toMatchObject({ isMember: false, members: [] });
      expect(await getGroup(app, alice, group.id)).toMatchObject({ isMember: true });
    });
  });

  it('is false while a Group has Members and true once the last one left, everywhere', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const bob = await signUp(app, 'Bob');
      const group = await createGroup(app, alice, [bob.id]);
      expect(group.closed).toBe(false);
      await leave(app, bob, group.id);

      expect(await getGroup(app, alice, group.id)).toMatchObject({ closed: false });
      expect(await listed(app, alice, group.id)).toMatchObject({ closed: false });
      expect(await listed(app, bob, group.id)).toMatchObject({ closed: false, isMember: false });

      const last = await leave(app, alice, group.id);
      expect(GroupMembershipResponseSchema.parse(last.json()).conversation.closed).toBe(true);
      for (const person of [alice, bob]) {
        expect(await getGroup(app, person, group.id)).toMatchObject({ closed: true });
        expect(await listed(app, person, group.id)).toMatchObject({ closed: true });
      }
    });
  });

  it('is false for a Direct Conversation in the list', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const bob = await signUp(app, 'Bob');
      const sent = await app.inject({
        method: 'POST',
        url: '/api/v1/direct-messages',
        headers: bearer(alice),
        payload: { recipientId: bob.id, clientMessageId: randomUUID(), body: 'hi' },
      });
      expect(sent.statusCode).toBe(201);
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/conversations',
        headers: bearer(alice),
      });
      const [direct] = ListConversationsResponseSchema.parse(res.json()).conversations;
      expect(direct).toMatchObject({ kind: 'direct', closed: false });
    });
  });
});
