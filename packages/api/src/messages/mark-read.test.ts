import { randomUUID } from 'node:crypto';
import {
  LoginResponseSchema,
  ConversationReadEventSchema,
  ListConversationsResponseSchema,
  MarkReadResponseSchema,
  SendDirectMessageResponseSchema,
} from '@chat/contracts';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { withApp } from '../../test/app-harness.js';
import {
  closeAllSockets,
  connectSocket,
  listenOnRandomPort,
  type TestSocket,
} from '../../test/socket-client.js';
import { bearer, createGroup, signUp, type Person } from '../../test/people.js';

const sendDirect = async (app: NestFastifyApplication, as: Person, to: Person, body: string) =>
  SendDirectMessageResponseSchema.parse(
    (
      await app.inject({
        method: 'POST',
        url: '/api/v1/direct-messages',
        headers: bearer(as),
        payload: { recipientId: to.id, clientMessageId: randomUUID(), body },
      })
    ).json(),
  ).conversation;

const post = (app: NestFastifyApplication, as: Person, conversationId: string, body: string) =>
  app.inject({
    method: 'POST',
    url: `/api/v1/conversations/${conversationId}/messages`,
    headers: bearer(as),
    payload: { clientMessageId: randomUUID(), body },
  });

const markRead = (
  app: NestFastifyApplication,
  as: Person,
  conversationId: string,
  payload: unknown,
) =>
  app.inject({
    method: 'PUT',
    url: `/api/v1/conversations/${conversationId}/read`,
    headers: bearer(as),
    payload: payload as Record<string, unknown>,
  });

const leave = (app: NestFastifyApplication, as: Person, groupId: string) =>
  app.inject({ method: 'POST', url: `/api/v1/groups/${groupId}/leave`, headers: bearer(as) });

const errorCode = (res: { json: () => unknown }) =>
  (res.json() as { error: { code: string } }).error.code;

/** A second session (another tab or device) of an existing User. */
async function logInAgain(app: NestFastifyApplication, username: string): Promise<Person> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { identifier: username, password: 'correct horse battery' },
  });
  const login = LoginResponseSchema.parse(res.json());
  return { id: login.user.id, token: login.accessToken };
}

/** Lets pushes that would have been sent arrive, before asserting none came. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 150));

const readEvents = (client: TestSocket) =>
  client.received.filter(([name]) => name === 'conversation.read').map(([, payload]) => payload);

afterEach(() => closeAllSockets());

/** The caller's Unread Count for one Conversation, read from the Conversation list. */
async function unreadCount(app: NestFastifyApplication, as: Person, conversationId: string) {
  const res = await app.inject({
    method: 'GET',
    url: '/api/v1/conversations',
    headers: bearer(as),
  });
  const summary = ListConversationsResponseSchema.parse(res.json()).conversations.find(
    (c) => c.id === conversationId,
  );
  if (!summary) throw new Error(`Conversation ${conversationId} is not in the list`);
  return summary.unreadCount;
}

describe('marking a Conversation as read', () => {
  it('moves the Member’s Read Marker forward only, clamped to the last Message, and returns it', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const bob = await signUp(app, 'Bob');
      const direct = await sendDirect(app, bob, alice, 'one');
      await post(app, bob, direct.id, 'two');
      await post(app, bob, direct.id, 'three');
      expect(await unreadCount(app, alice, direct.id)).toBe(3);

      const forward = await markRead(app, alice, direct.id, { upToSequence: 2 });

      expect(forward.statusCode).toBe(200);
      expect(MarkReadResponseSchema.parse(forward.json())).toEqual({ upToSequence: 2 });
      expect(await unreadCount(app, alice, direct.id)).toBe(1);

      const backward = await markRead(app, alice, direct.id, { upToSequence: 1 });

      expect(backward.statusCode).toBe(200);
      expect(backward.json()).toEqual({ upToSequence: 2 });
      expect(await unreadCount(app, alice, direct.id)).toBe(1);

      const same = await markRead(app, alice, direct.id, { upToSequence: 2 });

      expect(same.json()).toEqual({ upToSequence: 2 });

      const beyond = await markRead(app, alice, direct.id, { upToSequence: 1000 });

      expect(beyond.statusCode).toBe(200);
      expect(beyond.json()).toEqual({ upToSequence: 3 });
      expect(await unreadCount(app, alice, direct.id)).toBe(0);

      await post(app, bob, direct.id, 'four');

      expect(await unreadCount(app, alice, direct.id)).toBe(1);
    });
  });

  it('tells a never-Member the Conversation does not exist', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const bob = await signUp(app, 'Bob');
      const carol = await signUp(app, 'Carol');
      const direct = await sendDirect(app, alice, bob, 'private');

      const res = await markRead(app, carol, direct.id, { upToSequence: 1 });

      expect(res.statusCode).toBe(404);
      expect(errorCode(res)).toBe('CONVERSATION_NOT_FOUND');
    });
  });

  it('refuses a Former Member, including every reader of a Closed Group', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const bob = await signUp(app, 'Bob');
      const group = await createGroup(app, alice, [bob.id]);
      await post(app, alice, group.id, 'hello');
      await leave(app, bob, group.id);

      const former = await markRead(app, bob, group.id, { upToSequence: 1 });

      expect(former.statusCode).toBe(403);
      expect(errorCode(former)).toBe('NOT_A_MEMBER');

      await leave(app, alice, group.id);

      for (const reader of [alice, bob]) {
        const closed = await markRead(app, reader, group.id, { upToSequence: 1 });
        expect(closed.statusCode).toBe(403);
        expect(errorCode(closed)).toBe('NOT_A_MEMBER');
      }
    });
  });

  it.each([[{}], [{ upToSequence: -1 }], [{ upToSequence: 1.5 }], [{ upToSequence: '1' }]])(
    'rejects the body %j',
    async (payload) => {
      await withApp({}, async (app) => {
        const alice = await signUp(app, 'Alice');
        const bob = await signUp(app, 'Bob');
        const direct = await sendDirect(app, bob, alice, 'hi');

        const res = await markRead(app, alice, direct.id, payload);

        expect(res.statusCode).toBe(400);
        expect(errorCode(res)).toBe('VALIDATION_FAILED');
      });
    },
  );
});

describe('conversation.read', () => {
  it('reaches every socket of the reader and no socket of any other User, only when the marker moved', async () => {
    await withApp({}, async (app, logs) => {
      const alice = await signUp(app, 'Alice');
      const aliceElsewhere = await logInAgain(app, 'Alice');
      const bob = await signUp(app, 'Bob');
      const direct = await sendDirect(app, bob, alice, 'one');
      await post(app, bob, direct.id, 'two');
      const url = await listenOnRandomPort(app);
      const tab1 = await connectSocket(url, alice.token);
      const tab2 = await connectSocket(url, aliceElsewhere.token);
      const bobSocket = await connectSocket(url, bob.token);
      const toTab1 = tab1.next('conversation.read');
      const toTab2 = tab2.next('conversation.read');
      const logsBefore = logs.lines.length;

      await markRead(app, alice, direct.id, { upToSequence: 2 });

      const expected = { conversationId: direct.id, upToSequence: 2 };
      expect(ConversationReadEventSchema.parse(await toTab1)).toEqual(expected);
      expect(await toTab2).toEqual(expected);

      await markRead(app, alice, direct.id, { upToSequence: 2 });
      await markRead(app, alice, direct.id, { upToSequence: 1 });
      await settle();

      expect(readEvents(tab1)).toEqual([expected]);
      expect(readEvents(tab2)).toEqual([expected]);
      expect(readEvents(bobSocket)).toEqual([]);
      const pushes = logs.lines
        .slice(logsBefore)
        .filter((l) => l.msg === 'socket push' && l['event'] === 'conversation.read');
      expect(pushes).toEqual([
        expect.objectContaining({ targetUsers: 1, conversationId: direct.id }),
      ]);
      expect(pushes[0]).not.toHaveProperty('upToSequence');
    });
  });

  it('reaches every socket of the sender after a send, and not the other Members', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const aliceElsewhere = await logInAgain(app, 'Alice');
      const bob = await signUp(app, 'Bob');
      const carol = await signUp(app, 'Carol');
      const url = await listenOnRandomPort(app);
      const tab1 = await connectSocket(url, alice.token);
      const tab2 = await connectSocket(url, aliceElsewhere.token);
      const bobSocket = await connectSocket(url, bob.token);
      const carolSocket = await connectSocket(url, carol.token);
      const readByTab1 = tab1.next('conversation.read');

      const direct = await sendDirect(app, alice, bob, 'first');

      const first = { conversationId: direct.id, upToSequence: 1 };
      expect(await readByTab1).toEqual(first);

      const group = await createGroup(app, alice, [bob.id, carol.id]);
      await post(app, alice, group.id, 'hello club');
      await settle();

      const inGroup = { conversationId: group.id, upToSequence: 1 };
      expect(readEvents(tab1)).toEqual([first, inGroup]);
      expect(readEvents(tab2)).toEqual([first, inGroup]);
      expect(readEvents(bobSocket)).toEqual([]);
      expect(readEvents(carolSocket)).toEqual([]);
    });
  });
});
