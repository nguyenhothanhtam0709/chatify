import type { LightMyRequestResponse } from 'fastify';
import { randomUUID } from 'node:crypto';
import {
  ConversationCreatedEventSchema,
  GetMessagesResponseSchema,
  LoginResponseSchema,
  MessageCreatedEventSchema,
  SendDirectMessageResponseSchema,
  type LoginResponse,
} from '@chat/contracts';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { LEVEL } from '../../test/log-capture.js';
import { RealtimeGateway } from './realtime.gateway.js';
import { testClock } from '../../test/test-clock.js';
import { withApp } from '../../test/app-harness.js';
import {
  closeAllRawSockets,
  closeAllSockets,
  connectRawSocket,
  connectSocket,
  listenOnRandomPort,
} from '../../test/socket-client.js';

const ACCESS_TTL = 900;
const password = 'correct horse battery';

interface Person {
  id: string;
  token: string;
  sessionId: string;
}

async function signUp(app: NestFastifyApplication, username: string): Promise<Person> {
  await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: { username, email: `${username.toLowerCase()}@example.com`, password },
  });
  return logIn(app, username);
}

async function logIn(app: NestFastifyApplication, username: string): Promise<Person> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { identifier: username, password },
  });
  const login: LoginResponse = LoginResponseSchema.parse(res.json());
  const sessionId = JSON.parse(
    Buffer.from(login.accessToken.split('.')[1]!, 'base64url').toString(),
  ).sid as string;
  return { id: login.user.id, token: login.accessToken, sessionId };
}

afterEach(() => {
  closeAllSockets();
  closeAllRawSockets();
});
describe('socket handshake', () => {
  it('accepts a valid access token in the auth payload', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const url = await listenOnRandomPort(app);

      const client = await connectSocket(url, alice.token);

      expect(client.socket.connected).toBe(true);
    });
  });

  it('rejects a missing, malformed or forged token', async () => {
    await withApp({}, async (app) => {
      const url = await listenOnRandomPort(app);

      await expect(connectSocket(url, undefined)).rejects.toThrow('UNAUTHENTICATED');
      await expect(connectSocket(url, 'not-a-token')).rejects.toThrow('UNAUTHENTICATED');
    });
  });

  it('rejects an expired token', async () => {
    const time = testClock();
    await withApp({ clock: time.clock }, async (app) => {
      const alice = await signUp(app, 'Alice');
      const url = await listenOnRandomPort(app);
      time.advanceSeconds(ACCESS_TTL + 1);

      await expect(connectSocket(url, alice.token)).rejects.toThrow('UNAUTHENTICATED');
    });
  });

  it('rejects a token denied by logout', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const url = await listenOnRandomPort(app);
      await app.inject({
        method: 'POST',
        url: '/api/v1/auth/logout',
        headers: { authorization: `Bearer ${alice.token}` },
      });

      await expect(connectSocket(url, alice.token)).rejects.toThrow('SESSION_REVOKED');
    });
  });

  it('closes the connection after rejecting a missing, garbage or revoked-session handshake', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const url = await listenOnRandomPort(app);
      await app.inject({
        method: 'POST',
        url: '/api/v1/auth/logout',
        headers: { authorization: `Bearer ${alice.token}` },
      });
      const valid = await signUp(app, 'Bob');
      const stays = await connectSocket(url, valid.token);

      for (const [token, code] of [
        [undefined, 'UNAUTHENTICATED'],
        ['not-a-token', 'UNAUTHENTICATED'],
        [alice.token, 'SESSION_REVOKED'],
      ] as const) {
        const rejected = await connectRawSocket(url, token);
        expect(rejected.error).toBe(code);
        expect(await rejected.closedByServer(1000)).toBe('closed');
      }
      expect(stays.socket.connected).toBe(true);
    });
  });

  it('does not disconnect an open socket when its access token expires', async () => {
    const time = testClock();
    await withApp({ clock: time.clock }, async (app) => {
      const alice = await signUp(app, 'Alice');
      const url = await listenOnRandomPort(app);
      const client = await connectSocket(url, alice.token);

      time.advanceSeconds(ACCESS_TTL * 10);
      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(client.socket.connected).toBe(true);
    });
  });
});

const settle = (): Promise<unknown> => new Promise((resolve) => setTimeout(resolve, 150));

const bearer = (p: Person): { authorization: string } => ({ authorization: `Bearer ${p.token}` });

function sendDirect(
  app: NestFastifyApplication,
  from: Person,
  to: Person,
  body = 'hi',
): Promise<LightMyRequestResponse> {
  return app.inject({
    method: 'POST',
    url: '/api/v1/direct-messages',
    headers: bearer(from),
    payload: { recipientId: to.id, clientMessageId: randomUUID(), body },
  });
}
describe('real-time push', () => {
  it('pushes a first Direct Message to the recipient, who also gets the new Conversation', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const bob = await signUp(app, 'Bob');
      const url = await listenOnRandomPort(app);
      const bobSocket = await connectSocket(url, bob.token);
      const conversationCreated = bobSocket.next('conversation.created');
      const messageCreated = bobSocket.next('message.created');

      const res = await sendDirect(app, alice, bob, 'hello bob');

      const { message, conversation } = SendDirectMessageResponseSchema.parse(res.json());
      expect(MessageCreatedEventSchema.parse(await messageCreated)).toEqual({ message });
      const created = ConversationCreatedEventSchema.parse(await conversationCreated);
      expect(created.conversation).toMatchObject({
        id: conversation.id,
        kind: 'direct',
        name: 'Alice',
        lastMessage: {
          senderId: alice.id,
          sequence: message.sequence,
          preview: 'hello bob',
          createdAt: message.createdAt,
        },
      });
      expect(created.conversation.members.map((m) => m.id).sort()).toEqual(
        [alice.id, bob.id].sort(),
      );
      await settle();
      // Sending moved Alice's Read Marker, and both share read receipts: Bob gets it (spec 00006).
      expect(bobSocket.received.map(([event]) => event)).toEqual([
        'conversation.created',
        'message.created',
        'conversation.receipt',
      ]);
    });
  });

  it('pushes message.created to the sender, in every session, but not the new Conversation', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const aliceElsewhere = await logIn(app, 'Alice');
      const bob = await signUp(app, 'Bob');
      const url = await listenOnRandomPort(app);
      const tab1 = await connectSocket(url, alice.token);
      const tab2 = await connectSocket(url, aliceElsewhere.token);
      const seen1 = tab1.next('message.created');
      const seen2 = tab2.next('message.created');

      const res = await sendDirect(app, alice, bob);

      const { message } = SendDirectMessageResponseSchema.parse(res.json());
      expect(await seen1).toEqual({ message });
      expect(await seen2).toEqual({ message });
      await settle();
      // Sending also moved the sender's Read Marker: that syncs their tabs too (spec 00006).
      expect(tab1.received.map(([event]) => event)).toEqual([
        'message.created',
        'conversation.read',
      ]);
    });
  });

  it('pushes a Message to both Members of an existing Conversation and nobody else', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const bob = await signUp(app, 'Bob');
      const carol = await signUp(app, 'Carol');
      const { conversation } = SendDirectMessageResponseSchema.parse(
        (await sendDirect(app, alice, bob)).json(),
      );
      const url = await listenOnRandomPort(app);
      const aliceSocket = await connectSocket(url, alice.token);
      const bobSocket = await connectSocket(url, bob.token);
      const carolSocket = await connectSocket(url, carol.token);
      const toAlice = aliceSocket.next('message.created');
      const toBob = bobSocket.next('message.created');

      await app.inject({
        method: 'POST',
        url: `/api/v1/conversations/${conversation.id}/messages`,
        headers: bearer(bob),
        payload: { clientMessageId: randomUUID(), body: 'reply' },
      });

      const forAlice = MessageCreatedEventSchema.parse(await toAlice);
      expect(forAlice.message).toMatchObject({ body: 'reply', senderId: bob.id, sequence: 2 });
      expect(await toBob).toEqual(forAlice);
      await settle();
      expect(carolSocket.received).toEqual([]);
      // Bob's send moved his Read Marker, and both share read receipts (spec 00006).
      expect(aliceSocket.received.map(([event]) => event)).toEqual([
        'message.created',
        'conversation.receipt',
      ]);
    });
  });

  it('pushes only after the Message is persisted', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const bob = await signUp(app, 'Bob');
      const url = await listenOnRandomPort(app);
      const bobSocket = await connectSocket(url, bob.token);
      const pushed = bobSocket.next('message.created');

      await sendDirect(app, alice, bob, 'saved first');

      const { message } = MessageCreatedEventSchema.parse(await pushed);
      const history = await app.inject({
        method: 'GET',
        url: `/api/v1/conversations/${message.conversationId}/messages`,
        headers: bearer(bob),
      });
      expect(GetMessagesResponseSchema.parse(history.json()).messages[0]).toEqual(message);
    });
  });

  it('does not push again when a Message is resent with the same client message ID', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const bob = await signUp(app, 'Bob');
      const url = await listenOnRandomPort(app);
      const bobSocket = await connectSocket(url, bob.token);
      const payload = { recipientId: bob.id, clientMessageId: randomUUID(), body: 'once' };
      const send = (): Promise<LightMyRequestResponse> =>
        app.inject({
          method: 'POST',
          url: '/api/v1/direct-messages',
          headers: bearer(alice),
          payload,
        });

      await send();
      await send();
      await settle();

      expect(bobSocket.received.filter(([event]) => event === 'message.created')).toHaveLength(1);
    });
  });

  it('ignores every event a client emits', async () => {
    await withApp({}, async (app, logs) => {
      const alice = await signUp(app, 'Alice');
      const bob = await signUp(app, 'Bob');
      const url = await listenOnRandomPort(app);
      const aliceSocket = await connectSocket(url, alice.token);
      const bobSocket = await connectSocket(url, bob.token);

      aliceSocket.socket.emit('message.created', {
        message: { body: 'forged', conversationId: randomUUID() },
      });
      aliceSocket.socket.emit('conversation.created', { conversation: {} });
      aliceSocket.socket.emit('send', { recipientId: bob.id, body: 'forged' });
      await settle();

      expect(bobSocket.received).toEqual([]);
      expect(aliceSocket.socket.connected).toBe(true);
      const conversations = await app.inject({
        method: 'GET',
        url: '/api/v1/conversations',
        headers: bearer(bob),
      });
      expect(conversations.json()).toEqual({ conversations: [] });
      expect(logs.lines.filter((l) => l.level >= LEVEL.error)).toEqual([]);
    });
  });

  it('puts each socket in its User room and its session room', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const url = await listenOnRandomPort(app);
      const client = await connectSocket(url, alice.token);
      const gateway = app.get(RealtimeGateway);

      const rooms = await gateway.server.in(`session:${alice.sessionId}`).fetchSockets();

      expect(rooms.map((s) => s.id)).toEqual([client.socket.id]);
      expect([...rooms[0]!.rooms]).toEqual(
        expect.arrayContaining([`user:${alice.id}`, `session:${alice.sessionId}`]),
      );
    });
  });

  it('refuses the long-polling transport', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const url = await listenOnRandomPort(app);
      const polled = await fetch(`${url}/socket.io/?EIO=4&transport=polling`);

      expect(polled.status).toBeGreaterThanOrEqual(400);
      expect(alice.id).toBeDefined();
    });
  });
  it('logs connect, disconnect with reason, auth failure and each push, without payloads', async () => {
    await withApp({}, async (app, logs) => {
      const alice = await signUp(app, 'Alice');
      const bob = await signUp(app, 'Bob');
      const url = await listenOnRandomPort(app);
      await expect(connectSocket(url, 'bad')).rejects.toThrow();
      const bobSocket = await connectSocket(url, bob.token);
      const pushed = bobSocket.next('message.created');

      const res = await sendDirect(app, alice, bob, 'a secret message body');
      await pushed;
      bobSocket.socket.close();
      await settle();

      const { conversation } = SendDirectMessageResponseSchema.parse(res.json());
      const lines = logs.lines;
      expect(lines.find((l) => l.msg === 'socket connected')).toMatchObject({ userId: bob.id });
      expect(lines.find((l) => l.msg === 'socket auth failed')).toMatchObject({
        level: LEVEL.warn,
        code: 'UNAUTHENTICATED',
      });
      expect(lines.find((l) => l.msg === 'socket disconnected')).toMatchObject({
        userId: bob.id,
        reason: 'client namespace disconnect',
      });
      const pushes = lines.filter((l) => l.msg === 'socket push');
      expect(pushes).toEqual([
        expect.objectContaining({
          event: 'conversation.created',
          targetUsers: 1,
          conversationId: conversation.id,
        }),
        expect.objectContaining({
          event: 'message.created',
          targetUsers: 2,
          conversationId: conversation.id,
        }),
        expect.objectContaining({
          event: 'conversation.read',
          targetUsers: 1,
          conversationId: conversation.id,
        }),
        expect.objectContaining({
          event: 'conversation.receipt',
          targetUsers: 1,
          conversationId: conversation.id,
        }),
      ]);
      expect(logs.raw).not.toContain('a secret message body');
      expect(logs.raw).not.toContain(bob.token);
    });
  });
});
describe('session revocation over the socket', () => {
  const logOut = (app: NestFastifyApplication, who: Person): Promise<LightMyRequestResponse> =>
    app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers: bearer(who) });

  it('pushes session.revoked to every socket of the session, then disconnects them', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const url = await listenOnRandomPort(app);
      const tabOne = await connectSocket(url, alice.token);
      const tabTwo = await connectSocket(url, alice.token);
      const revoked = [tabOne.next('session.revoked'), tabTwo.next('session.revoked')];
      const closed = [tabOne, tabTwo].map(
        (tab) => new Promise((resolve) => tab.socket.once('disconnect', resolve)),
      );

      expect((await logOut(app, alice)).statusCode).toBe(204);

      expect(await Promise.all(revoked)).toEqual([{}, {}]);
      await Promise.all(closed);
      expect(tabOne.socket.connected).toBe(false);
      expect(tabTwo.socket.connected).toBe(false);
    });
  });

  it("keeps the same User's other sessions connected", async () => {
    await withApp({}, async (app) => {
      const first = await signUp(app, 'Alice');
      const second = await logIn(app, 'Alice');
      const url = await listenOnRandomPort(app);
      const firstSocket = await connectSocket(url, first.token);
      const secondSocket = await connectSocket(url, second.token);
      const closed = new Promise((resolve) => firstSocket.socket.once('disconnect', resolve));

      await logOut(app, first);
      await closed;
      await settle();

      expect(secondSocket.socket.connected).toBe(true);
      expect(secondSocket.received.map(([event]) => event)).not.toContain('session.revoked');
    });
  });

  it('refuses a new socket with the revoked token', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const url = await listenOnRandomPort(app);
      await logOut(app, alice);

      await expect(connectSocket(url, alice.token)).rejects.toThrow('SESSION_REVOKED');
    });
  });
});
