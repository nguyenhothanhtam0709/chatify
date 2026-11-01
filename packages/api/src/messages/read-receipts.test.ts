import { randomUUID } from 'node:crypto';
import {
  ConversationReceiptEventSchema,
  GetConversationResponseSchema,
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
  upToSequence: number,
) =>
  app.inject({
    method: 'PUT',
    url: `/api/v1/conversations/${conversationId}/read`,
    headers: bearer(as),
    payload: { upToSequence },
  });

const shareReadReceipts = (app: NestFastifyApplication, as: Person, share: boolean) =>
  app.inject({
    method: 'PATCH',
    url: '/api/v1/users/me',
    headers: bearer(as),
    payload: { shareReadReceipts: share },
  });

/**
 * The Conversation as `as` opens it, validated against contracts but returned as sent, so a
 * field the schema would strip (a Group's `readUpToSequence`) still shows.
 */
async function open(app: NestFastifyApplication, as: Person, conversationId: string) {
  const res = await app.inject({
    method: 'GET',
    url: `/api/v1/conversations/${conversationId}`,
    headers: bearer(as),
  });
  GetConversationResponseSchema.parse(res.json());
  return (res.json() as { conversation: { readUpToSequence?: number } }).conversation;
}

/** Lets pushes that would have been sent arrive, before asserting none came. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 150));

const receipts = (client: TestSocket) =>
  client.received.filter(([name]) => name === 'conversation.receipt').map(([, payload]) => payload);

afterEach(() => closeAllSockets());

describe('readUpToSequence on a Direct Conversation', () => {
  it("is the other User's Read Marker while both Users share read receipts", async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const bob = await signUp(app, 'Bob');
      const direct = await sendDirect(app, alice, bob, 'one');
      await post(app, alice, direct.id, 'two');

      expect((await open(app, alice, direct.id)).readUpToSequence).toBe(0);
      expect((await open(app, bob, direct.id)).readUpToSequence).toBe(2);

      await markRead(app, bob, direct.id, 1);

      expect((await open(app, alice, direct.id)).readUpToSequence).toBe(1);
    });
  });

  it.each([['the reader'], ['the sender']])(
    'is omitted for both Users when %s stops sharing read receipts',
    async (who) => {
      await withApp({}, async (app) => {
        const alice = await signUp(app, 'Alice');
        const bob = await signUp(app, 'Bob');
        const direct = await sendDirect(app, alice, bob, 'one');
        await markRead(app, bob, direct.id, 1);

        await shareReadReceipts(app, who === 'the reader' ? bob : alice, false);

        expect(await open(app, alice, direct.id)).not.toHaveProperty('readUpToSequence');
        expect(await open(app, bob, direct.id)).not.toHaveProperty('readUpToSequence');

        await shareReadReceipts(app, who === 'the reader' ? bob : alice, true);

        expect((await open(app, alice, direct.id)).readUpToSequence).toBe(1);
      });
    },
  );

  it('is never on a Group', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const bob = await signUp(app, 'Bob');
      const group = await createGroup(app, alice, [bob.id]);
      await post(app, alice, group.id, 'hello');
      await markRead(app, bob, group.id, 1);

      expect(await open(app, alice, group.id)).not.toHaveProperty('readUpToSequence');
      expect(await open(app, bob, group.id)).not.toHaveProperty('readUpToSequence');
    });
  });
});

describe('conversation.receipt', () => {
  it("reaches every socket of the other User when a Member's marker moves, and not the reader", async () => {
    await withApp({}, async (app, logs) => {
      const alice = await signUp(app, 'Alice');
      const bob = await signUp(app, 'Bob');
      const direct = await sendDirect(app, alice, bob, 'one');
      await post(app, alice, direct.id, 'two');
      const url = await listenOnRandomPort(app);
      const aliceSocket = await connectSocket(url, alice.token);
      const bobSocket = await connectSocket(url, bob.token);
      const toAlice = aliceSocket.next('conversation.receipt');
      const readByBob = bobSocket.next('conversation.read');
      const logsBefore = logs.lines.length;

      await markRead(app, bob, direct.id, 2);

      const expected = { conversationId: direct.id, upToSequence: 2 };
      expect(ConversationReceiptEventSchema.parse(await toAlice)).toEqual(expected);
      expect(await readByBob).toEqual(expected);

      await markRead(app, bob, direct.id, 2);
      await settle();

      expect(receipts(aliceSocket)).toEqual([expected]);
      expect(receipts(bobSocket)).toEqual([]);
      const pushes = logs.lines
        .slice(logsBefore)
        .filter((l) => l.msg === 'socket push' && l['event'] === 'conversation.receipt');
      expect(pushes).toEqual([
        expect.objectContaining({ targetUsers: 1, conversationId: direct.id }),
      ]);
      expect(pushes[0]).not.toHaveProperty('upToSequence');
    });
  });

  it("reaches the other User when a send moves the sender's marker", async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const bob = await signUp(app, 'Bob');
      const direct = await sendDirect(app, alice, bob, 'one');
      const url = await listenOnRandomPort(app);
      const aliceSocket = await connectSocket(url, alice.token);
      const bobSocket = await connectSocket(url, bob.token);

      await post(app, bob, direct.id, 'reply');
      await settle();

      expect(receipts(aliceSocket)).toEqual([{ conversationId: direct.id, upToSequence: 2 }]);
      expect(receipts(bobSocket)).toEqual([]);
    });
  });

  it.each([['the reader'], ['the other User']])(
    'reaches nobody when %s does not share read receipts',
    async (who) => {
      await withApp({}, async (app) => {
        const alice = await signUp(app, 'Alice');
        const bob = await signUp(app, 'Bob');
        const direct = await sendDirect(app, alice, bob, 'one');
        await shareReadReceipts(app, who === 'the reader' ? bob : alice, false);
        const url = await listenOnRandomPort(app);
        const aliceSocket = await connectSocket(url, alice.token);
        const bobSocket = await connectSocket(url, bob.token);

        await markRead(app, bob, direct.id, 1);
        await post(app, bob, direct.id, 'reply');
        await settle();

        expect(receipts(aliceSocket)).toEqual([]);
        expect(receipts(bobSocket)).toEqual([]);
      });
    },
  );

  it('is never pushed in a Group', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const bob = await signUp(app, 'Bob');
      const group = await createGroup(app, alice, [bob.id]);
      await post(app, alice, group.id, 'hello');
      const url = await listenOnRandomPort(app);
      const aliceSocket = await connectSocket(url, alice.token);
      const bobSocket = await connectSocket(url, bob.token);

      await markRead(app, bob, group.id, 1);
      await post(app, bob, group.id, 'hi back');
      await settle();

      expect(receipts(aliceSocket)).toEqual([]);
      expect(receipts(bobSocket)).toEqual([]);
    });
  });
});
