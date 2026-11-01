import { randomUUID } from 'node:crypto';
import {
  ErrorCode,
  ErrorResponseSchema,
  SendDirectMessageResponseSchema,
  TypingUpdatedEventSchema,
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
import { bearer, signUp, type Person } from '../../test/people.js';

const sendDirect = async (app: NestFastifyApplication, as: Person, to: Person) =>
  SendDirectMessageResponseSchema.parse(
    (
      await app.inject({
        method: 'POST',
        url: '/api/v1/direct-messages',
        headers: bearer(as),
        payload: { recipientId: to.id, clientMessageId: randomUUID(), body: 'hi' },
      })
    ).json(),
  ).conversation;

const typing = (app: NestFastifyApplication, as: Person, conversationId: string, state: unknown) =>
  app.inject({
    method: 'POST',
    url: `/api/v1/conversations/${conversationId}/typing`,
    headers: bearer(as),
    payload: { state },
  });

const errorCode = (res: { json(): unknown }) => ErrorResponseSchema.parse(res.json()).error.code;

/** Lets pushes that would have been sent arrive, before asserting none came. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 150));

const typingEvents = (client: TestSocket) =>
  client.received.filter(([name]) => name === 'typing.updated').map(([, payload]) => payload);

afterEach(() => closeAllSockets());

describe('POST /conversations/:id/typing in a Direct Conversation', () => {
  it('answers 204 and pushes typing.updated to every socket of the other User, not the typist', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const bob = await signUp(app, 'Bob');
      const direct = await sendDirect(app, alice, bob);
      const url = await listenOnRandomPort(app);
      const bobTab1 = await connectSocket(url, bob.token);
      const bobTab2 = await connectSocket(url, bob.token);
      const aliceTab = await connectSocket(url, alice.token);
      const first = bobTab1.next('typing.updated');
      const second = bobTab2.next('typing.updated');

      const res = await typing(app, alice, direct.id, 'typing');

      expect(res.statusCode).toBe(204);
      const expected = {
        conversationId: direct.id,
        state: 'typing',
        user: { id: alice.id, username: 'Alice', nickname: null },
      };
      expect(TypingUpdatedEventSchema.parse(await first)).toEqual(expected);
      expect(await second).toEqual(expected);

      const stopped = bobTab1.next('typing.updated');
      await typing(app, alice, direct.id, 'stopped');
      expect(await stopped).toMatchObject({ state: 'stopped' });
      await settle();
      expect(typingEvents(aliceTab)).toEqual([]);
    });
  });

  it('answers 404 CONVERSATION_NOT_FOUND to a never-Member and pushes nothing', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const bob = await signUp(app, 'Bob');
      const carol = await signUp(app, 'Carol');
      const direct = await sendDirect(app, alice, bob);
      const url = await listenOnRandomPort(app);
      const bobTab = await connectSocket(url, bob.token);

      const res = await typing(app, carol, direct.id, 'typing');

      expect(res.statusCode).toBe(404);
      expect(errorCode(res)).toBe(ErrorCode.CONVERSATION_NOT_FOUND);
      await settle();
      expect(typingEvents(bobTab)).toEqual([]);
    });
  });

  it.each(['idle', '', 1, undefined])(
    'answers 400 VALIDATION_FAILED for state %j',
    async (state) => {
      await withApp({}, async (app) => {
        const alice = await signUp(app, 'Alice');
        const bob = await signUp(app, 'Bob');
        const direct = await sendDirect(app, alice, bob);

        const res = await typing(app, alice, direct.id, state);

        expect(res.statusCode).toBe(400);
        expect(errorCode(res)).toBe(ErrorCode.VALIDATION_FAILED);
      });
    },
  );

  it('answers 401 without a token', async () => {
    await withApp({}, async (app) => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/conversations/${randomUUID()}/typing`,
        payload: { state: 'typing' },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  it('allows 2 requests per 2 seconds per User and Conversation, then 429 RATE_LIMITED', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const bob = await signUp(app, 'Bob');
      const carol = await signUp(app, 'Carol');
      const direct = await sendDirect(app, alice, bob);
      const other = await sendDirect(app, alice, carol);

      expect((await typing(app, alice, direct.id, 'typing')).statusCode).toBe(204);
      expect((await typing(app, alice, direct.id, 'typing')).statusCode).toBe(204);
      const limited = await typing(app, alice, direct.id, 'stopped');

      expect(limited.statusCode).toBe(429);
      expect(errorCode(limited)).toBe(ErrorCode.RATE_LIMITED);
      expect((await typing(app, alice, other.id, 'typing')).statusCode).toBe(204);
      expect((await typing(app, bob, direct.id, 'typing')).statusCode).toBe(204);
    });
  });

  it('does not consume the generic rate limit', async () => {
    await withApp({ config: { THROTTLE_LIMIT: '7', THROTTLE_TTL_MS: '60000' } }, async (app) => {
      // Sign-ups and the first send use 5 of the 7 generic requests.
      const alice = await signUp(app, 'Alice');
      const bob = await signUp(app, 'Bob');
      const direct = await sendDirect(app, alice, bob);

      await typing(app, alice, direct.id, 'typing');
      await typing(app, alice, direct.id, 'stopped');

      for (let i = 0; i < 2; i++) {
        const list = await app.inject({
          method: 'GET',
          url: '/api/v1/conversations',
          headers: bearer(alice),
        });
        expect(list.statusCode).toBe(200);
      }
    });
  });

  it('logs the push at debug level only, with the usual fields and no payload', async () => {
    await withApp({}, async (app, logs) => {
      const alice = await signUp(app, 'Alice');
      const bob = await signUp(app, 'Bob');
      const direct = await sendDirect(app, alice, bob);
      const url = await listenOnRandomPort(app);
      const bobTab = await connectSocket(url, bob.token);
      const pushed = bobTab.next('typing.updated');

      await typing(app, alice, direct.id, 'typing');
      await pushed;

      expect(logs.lines.filter((l) => l.event === 'typing.updated')).toEqual([]);
    });
    await withApp({ config: { LOG_LEVEL: 'debug' } }, async (app, logs) => {
      const alice = await signUp(app, 'Alice');
      const bob = await signUp(app, 'Bob');
      const direct = await sendDirect(app, alice, bob);
      const url = await listenOnRandomPort(app);
      const bobTab = await connectSocket(url, bob.token);
      const pushed = bobTab.next('typing.updated');

      await typing(app, alice, direct.id, 'typing');
      await pushed;

      const lines = logs.lines.filter((l) => l.event === 'typing.updated');
      expect(lines).toEqual([
        expect.objectContaining({ level: 20, targetUsers: 1, conversationId: direct.id }),
      ]);
      expect(lines[0]).not.toHaveProperty('user');
    });
  });
});
