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
import { bearer, createGroup, signUp, type Person } from '../../test/people.js';

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

  it('throttles bad-token requests per IP before auth, without touching the generic budget', async () => {
    await withApp({ config: { THROTTLE_LIMIT: '7', THROTTLE_TTL_MS: '60000' } }, async (app) => {
      // Sign-ups and the first send use 5 of the 7 generic requests.
      const alice = await signUp(app, 'Alice');
      const bob = await signUp(app, 'Bob');
      await sendDirect(app, alice, bob);
      const statuses: number[] = [];
      for (let i = 0; i < 9; i++) {
        const res = await app.inject({
          method: 'POST',
          url: `/api/v1/conversations/${randomUUID()}/typing`,
          headers: { authorization: 'Bearer not-a-real-token' },
          payload: { state: 'typing' },
        });
        statuses.push(res.statusCode);
      }

      expect(statuses).toEqual([401, 401, 401, 401, 401, 401, 401, 429, 429]);
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

  it('shares one rate limit and one canonical ID across the casings of a Conversation ID', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const bob = await signUp(app, 'Bob');
      const direct = await sendDirect(app, alice, bob);
      const url = await listenOnRandomPort(app);
      const bobTab = await connectSocket(url, bob.token);
      const first = bobTab.next('typing.updated');

      const upper = direct.id.toUpperCase();
      expect((await typing(app, alice, upper, 'typing')).statusCode).toBe(204);
      expect(await first).toMatchObject({ conversationId: direct.id });
      expect((await typing(app, alice, direct.id, 'typing')).statusCode).toBe(204);
      const limited = await typing(
        app,
        alice,
        upper.replace(/^./, (c) => c.toLowerCase()),
        'stopped',
      );

      expect(limited.statusCode).toBe(429);
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

      expect(logs.lines.filter((l) => l['event'] === 'typing.updated')).toEqual([]);
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

      const lines = logs.lines.filter((l) => l['event'] === 'typing.updated');
      expect(lines).toEqual([
        expect.objectContaining({ level: 20, targetUsers: 1, conversationId: direct.id }),
      ]);
      expect(lines[0]).not.toHaveProperty('user');
    });
  });
});

const sendGroup = (app: NestFastifyApplication, as: Person, groupId: string) =>
  app.inject({
    method: 'POST',
    url: `/api/v1/conversations/${groupId}/messages`,
    headers: bearer(as),
    payload: { clientMessageId: randomUUID(), body: 'hi' },
  });

const leaveGroup = (app: NestFastifyApplication, as: Person, groupId: string) =>
  app.inject({ method: 'POST', url: `/api/v1/groups/${groupId}/leave`, headers: bearer(as) });

describe('POST /conversations/:id/typing in a Group', () => {
  it('pushes typing.updated to every socket of the other Members and to none of the typist', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const bob = await signUp(app, 'Bob');
      const carol = await signUp(app, 'Carol');
      const dave = await signUp(app, 'Dave');
      const group = await createGroup(app, alice, [bob.id, carol.id]);
      const url = await listenOnRandomPort(app);
      const aliceTab1 = await connectSocket(url, alice.token);
      const aliceTab2 = await connectSocket(url, alice.token);
      const bobTab1 = await connectSocket(url, bob.token);
      const bobTab2 = await connectSocket(url, bob.token);
      const carolTab = await connectSocket(url, carol.token);
      const daveTab = await connectSocket(url, dave.token);
      const arrivals = [bobTab1, bobTab2, carolTab].map((c) => c.next('typing.updated'));

      const res = await typing(app, alice, group.id, 'typing');

      expect(res.statusCode).toBe(204);
      const expected = {
        conversationId: group.id,
        state: 'typing',
        user: { id: alice.id, username: 'Alice', nickname: null },
      };
      for (const payload of await Promise.all(arrivals)) {
        expect(TypingUpdatedEventSchema.parse(payload)).toEqual(expected);
      }
      await settle();
      expect(typingEvents(aliceTab1)).toEqual([]);
      expect(typingEvents(aliceTab2)).toEqual([]);
      expect(typingEvents(daveTab)).toEqual([]);
    });
  });

  it('stops reaching a removed Member and a Member who left', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const bob = await signUp(app, 'Bob');
      const carol = await signUp(app, 'Carol');
      const dave = await signUp(app, 'Dave');
      const group = await createGroup(app, alice, [bob.id, carol.id, dave.id]);
      const url = await listenOnRandomPort(app);
      const bobTab = await connectSocket(url, bob.token);
      const carolTab = await connectSocket(url, carol.token);
      const ended = Promise.all([
        bobTab.next('group.membership_ended'),
        carolTab.next('group.membership_ended'),
      ]);

      await app.inject({
        method: 'DELETE',
        url: `/api/v1/groups/${group.id}/members/${bob.id}`,
        headers: bearer(alice),
      });
      await leaveGroup(app, carol, group.id);
      await ended;
      const daveTab = await connectSocket(url, dave.token);
      const arrival = daveTab.next('typing.updated');

      const res = await typing(app, alice, group.id, 'typing');

      expect(res.statusCode).toBe(204);
      expect(await arrival).toMatchObject({ conversationId: group.id, state: 'typing' });
      await settle();
      expect(typingEvents(bobTab)).toEqual([]);
      expect(typingEvents(carolTab)).toEqual([]);
    });
  });

  it('logs a Group push at debug level only, with the usual fields and no payload', async () => {
    let lines: Record<string, unknown>[] = [];
    let groupId = '';
    const run = (config: Record<string, string>) =>
      withApp({ config }, async (app, logs) => {
        const alice = await signUp(app, 'Alice');
        const bob = await signUp(app, 'Bob');
        const group = await createGroup(app, alice, [bob.id]);
        const url = await listenOnRandomPort(app);
        const bobTab = await connectSocket(url, bob.token);
        const pushed = bobTab.next('typing.updated');

        await typing(app, alice, group.id, 'typing');
        await pushed;

        lines = logs.lines.filter((l) => l['event'] === 'typing.updated');
        groupId = group.id;
      });

    await run({});
    expect(lines).toEqual([]);
    await run({ LOG_LEVEL: 'debug' });
    expect(lines).toEqual([expect.objectContaining({ level: 20, conversationId: groupId })]);
    expect(lines[0]).not.toHaveProperty('user');
  });

  it('answers 403 NOT_A_MEMBER to a Former Member, and 404 to a never-Member', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const bob = await signUp(app, 'Bob');
      const carol = await signUp(app, 'Carol');
      const group = await createGroup(app, alice, [bob.id]);
      await leaveGroup(app, bob, group.id);

      const former = await typing(app, bob, group.id, 'typing');
      const never = await typing(app, carol, group.id, 'typing');

      expect(former.statusCode).toBe(403);
      expect(errorCode(former)).toBe(ErrorCode.NOT_A_MEMBER);
      expect(never.statusCode).toBe(404);
      expect(errorCode(never)).toBe(ErrorCode.CONVERSATION_NOT_FOUND);
    });
  });

  it('rejects a Former Member of a Closed Group the way a send does', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const bob = await signUp(app, 'Bob');
      const group = await createGroup(app, alice, [bob.id]);
      await leaveGroup(app, bob, group.id);
      await leaveGroup(app, alice, group.id);

      const send = await sendGroup(app, bob, group.id);
      const res = await typing(app, bob, group.id, 'typing');

      expect(send.statusCode).toBe(409);
      expect(res.statusCode).toBe(send.statusCode);
      expect(errorCode(res)).toBe(errorCode(send));
    });
  });
});
