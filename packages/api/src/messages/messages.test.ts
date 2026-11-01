import { randomUUID } from 'node:crypto';
import {
  ErrorCode,
  ErrorResponseSchema,
  GetConversationResponseSchema,
  GetMessagesResponseSchema,
  ListConversationsResponseSchema,
  LoginResponseSchema,
  SendDirectMessageResponseSchema,
  SendMessageResponseSchema,
  type LoginResponse,
} from '@chat/contracts';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import { PG_POOL } from '../db/database.module.js';
import { withApp } from '../../test/app-harness.js';

const password = 'correct horse battery';
const UUIDV7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

interface Person {
  id: string;
  token: string;
}

async function signUp(app: NestFastifyApplication, username: string): Promise<Person> {
  await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: { username, email: `${username.toLowerCase()}@example.com`, password },
  });
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { identifier: username, password },
  });
  const login: LoginResponse = LoginResponseSchema.parse(res.json());
  return { id: login.user.id, token: login.accessToken };
}

const bearer = (p: Person) => ({ authorization: `Bearer ${p.token}` });

function sendDirect(
  app: NestFastifyApplication,
  from: Person,
  payload: { recipientId: string; body?: string; clientMessageId?: string },
) {
  return app.inject({
    method: 'POST',
    url: '/api/v1/direct-messages',
    headers: bearer(from),
    payload: { clientMessageId: randomUUID(), body: 'hi', ...payload },
  });
}

function sendTo(
  app: NestFastifyApplication,
  from: Person,
  conversationId: string,
  payload: { body?: string; clientMessageId?: string } = {},
) {
  return app.inject({
    method: 'POST',
    url: `/api/v1/conversations/${conversationId}/messages`,
    headers: bearer(from),
    payload: { clientMessageId: randomUUID(), body: 'hi', ...payload },
  });
}

function history(
  app: NestFastifyApplication,
  as: Person,
  conversationId: string,
  query: Record<string, string> = {},
) {
  return app.inject({
    method: 'GET',
    url: `/api/v1/conversations/${conversationId}/messages`,
    headers: bearer(as),
    query,
  });
}

function errorCode(res: { json(): unknown }) {
  return ErrorResponseSchema.parse(res.json()).error.code;
}

describe('POST /direct-messages', () => {
  it('requires authentication', async () => {
    await withApp({}, async (app) => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/direct-messages',
        payload: { recipientId: randomUUID(), clientMessageId: randomUUID(), body: 'hi' },
      });

      expect(res.statusCode).toBe(401);
      expect(errorCode(res)).toBe(ErrorCode.UNAUTHENTICATED);
    });
  });

  it('creates the Direct Conversation with the first Message, with UUIDv7 IDs and sequence 1', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const bob = await signUp(app, 'Bob');
      const clientMessageId = randomUUID();

      const res = await sendDirect(app, alice, {
        recipientId: bob.id,
        clientMessageId,
        body: 'hello bob',
      });

      expect(res.statusCode).toBe(201);
      const { message, conversation } = SendDirectMessageResponseSchema.parse(res.json());
      expect(conversation.id).toMatch(UUIDV7);
      expect(message.id).toMatch(UUIDV7);
      expect(conversation.kind).toBe('direct');
      expect(conversation.memberIds.sort()).toEqual([alice.id, bob.id].sort());
      expect(message).toMatchObject({
        conversationId: conversation.id,
        senderId: alice.id,
        sequence: 1,
        clientMessageId,
        body: 'hello bob',
      });
    });
  });

  it('reuses the one Direct Conversation for the pair, whoever sends', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const bob = await signUp(app, 'Bob');

      const first = SendDirectMessageResponseSchema.parse(
        (await sendDirect(app, alice, { recipientId: bob.id })).json(),
      );
      const reply = await sendDirect(app, bob, { recipientId: alice.id, body: 'hey' });

      expect(reply.statusCode).toBe(201);
      const second = SendDirectMessageResponseSchema.parse(reply.json());
      expect(second.conversation.id).toBe(first.conversation.id);
      expect(second.message.sequence).toBe(2);
    });
  });

  it('creates exactly one Direct Conversation when both Users send first at the same time', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const bob = await signUp(app, 'Bob');

      const results = await Promise.all(
        Array.from({ length: 6 }, (_, i) =>
          sendDirect(app, i % 2 === 0 ? alice : bob, {
            recipientId: i % 2 === 0 ? bob.id : alice.id,
          }),
        ),
      );

      expect(results.map((r) => r.statusCode)).toEqual(Array(6).fill(201));
      const parsed = results.map((r) => SendDirectMessageResponseSchema.parse(r.json()));
      expect(new Set(parsed.map((p) => p.conversation.id)).size).toBe(1);
      expect(parsed.map((p) => p.message.sequence).sort((a, b) => a - b)).toEqual([
        1, 2, 3, 4, 5, 6,
      ]);
    });
  });

  it('rejects messaging yourself with CANNOT_MESSAGE_SELF', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');

      const res = await sendDirect(app, alice, { recipientId: alice.id });

      expect(res.statusCode).toBe(400);
      expect(errorCode(res)).toBe(ErrorCode.CANNOT_MESSAGE_SELF);
    });
  });

  it('rejects an unknown recipient with USER_NOT_FOUND', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');

      const res = await sendDirect(app, alice, { recipientId: randomUUID() });

      expect(res.statusCode).toBe(404);
      expect(errorCode(res)).toBe(ErrorCode.USER_NOT_FOUND);
    });
  });

  it('answers a resend with the same client message ID with 200 and the original Message', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const bob = await signUp(app, 'Bob');
      const clientMessageId = randomUUID();
      const first = await sendDirect(app, alice, { recipientId: bob.id, clientMessageId });

      const again = await sendDirect(app, alice, {
        recipientId: bob.id,
        clientMessageId,
        body: 'different text',
      });

      expect(first.statusCode).toBe(201);
      expect(again.statusCode).toBe(200);
      const original = SendDirectMessageResponseSchema.parse(first.json());
      const repeated = SendDirectMessageResponseSchema.parse(again.json());
      expect(repeated).toEqual(original);
      const all = GetMessagesResponseSchema.parse(
        (await history(app, alice, original.conversation.id)).json(),
      );
      expect(all.messages).toHaveLength(1);
    });
  });

  it('rejects an invalid body with VALIDATION_FAILED', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const bob = await signUp(app, 'Bob');

      const res = await sendDirect(app, alice, { recipientId: bob.id, body: '  \n ' });

      expect(res.statusCode).toBe(400);
      expect(errorCode(res)).toBe(ErrorCode.VALIDATION_FAILED);
    });
  });

  it('allows 30 sends per 10 seconds per User, then 429 RATE_LIMITED; other Users are unaffected', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const bob = await signUp(app, 'Bob');

      for (let i = 0; i < 30; i++) {
        expect((await sendDirect(app, alice, { recipientId: bob.id })).statusCode).toBe(201);
      }
      const limited = await sendDirect(app, alice, { recipientId: bob.id });

      expect(limited.statusCode).toBe(429);
      expect(errorCode(limited)).toBe(ErrorCode.RATE_LIMITED);
      expect((await sendDirect(app, bob, { recipientId: alice.id })).statusCode).toBe(201);
    });
  });
});

describe('POST /conversations/:id/messages', () => {
  it('sends to an existing Conversation with the next sequence', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const bob = await signUp(app, 'Bob');
      const { conversation } = SendDirectMessageResponseSchema.parse(
        (await sendDirect(app, alice, { recipientId: bob.id })).json(),
      );

      const res = await sendTo(app, bob, conversation.id, { body: 'second' });

      expect(res.statusCode).toBe(201);
      expect(SendMessageResponseSchema.parse(res.json()).message).toMatchObject({
        conversationId: conversation.id,
        senderId: bob.id,
        sequence: 2,
        body: 'second',
      });
    });
  });

  it('gives concurrent sends distinct, increasing sequences', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const bob = await signUp(app, 'Bob');
      const { conversation } = SendDirectMessageResponseSchema.parse(
        (await sendDirect(app, alice, { recipientId: bob.id })).json(),
      );

      const results = await Promise.all(
        Array.from({ length: 20 }, (_, i) =>
          sendTo(app, i % 2 === 0 ? alice : bob, conversation.id),
        ),
      );

      expect(results.map((r) => r.statusCode)).toEqual(Array(20).fill(201));
      const sequences = results
        .map((r) => SendMessageResponseSchema.parse(r.json()).message.sequence)
        .sort((a, b) => a - b);
      expect(sequences).toEqual(Array.from({ length: 20 }, (_, i) => i + 2));
    });
  });

  it('answers a resend with the same client message ID with 200 and the original Message', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const bob = await signUp(app, 'Bob');
      const { conversation } = SendDirectMessageResponseSchema.parse(
        (await sendDirect(app, alice, { recipientId: bob.id })).json(),
      );
      const clientMessageId = randomUUID();

      const first = await sendTo(app, alice, conversation.id, { clientMessageId });
      const again = await sendTo(app, alice, conversation.id, { clientMessageId });

      expect(first.statusCode).toBe(201);
      expect(again.statusCode).toBe(200);
      expect(again.json()).toEqual(first.json());
    });
  });

  it('answers a never-Member with 404 CONVERSATION_NOT_FOUND', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const bob = await signUp(app, 'Bob');
      const mallory = await signUp(app, 'Mallory');
      const { conversation } = SendDirectMessageResponseSchema.parse(
        (await sendDirect(app, alice, { recipientId: bob.id })).json(),
      );

      for (const res of [
        await sendTo(app, mallory, conversation.id),
        await sendTo(app, mallory, randomUUID()),
      ]) {
        expect(res.statusCode).toBe(404);
        expect(errorCode(res)).toBe(ErrorCode.CONVERSATION_NOT_FOUND);
      }
    });
  });

  it('answers a malformed Conversation ID with VALIDATION_FAILED', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');

      const res = await sendTo(app, alice, 'not-a-uuid');

      expect(res.statusCode).toBe(400);
      expect(errorCode(res)).toBe(ErrorCode.VALIDATION_FAILED);
    });
  });

  it('shares the 30 / 10 s send limit with direct sends', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const bob = await signUp(app, 'Bob');
      const { conversation } = SendDirectMessageResponseSchema.parse(
        (await sendDirect(app, alice, { recipientId: bob.id })).json(),
      );

      for (let i = 0; i < 29; i++) {
        expect((await sendTo(app, alice, conversation.id)).statusCode).toBe(201);
      }
      const limited = await sendTo(app, alice, conversation.id);

      expect(limited.statusCode).toBe(429);
      expect(errorCode(limited)).toBe(ErrorCode.RATE_LIMITED);
    });
  });
});

describe('GET /conversations/:id/messages', () => {
  it('returns the latest Messages, most recent first, to either Member', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const bob = await signUp(app, 'Bob');
      const { conversation } = SendDirectMessageResponseSchema.parse(
        (await sendDirect(app, alice, { recipientId: bob.id, body: 'one' })).json(),
      );
      await sendTo(app, bob, conversation.id, { body: 'two' });
      await sendTo(app, alice, conversation.id, { body: 'three' });

      const res = await history(app, bob, conversation.id);

      expect(res.statusCode).toBe(200);
      const page = GetMessagesResponseSchema.parse(res.json());
      expect(page.messages.map((m) => m.body)).toEqual(['three', 'two', 'one']);
      expect(page.messages.map((m) => m.sequence)).toEqual([3, 2, 1]);
      expect(page.hasMore).toBe(false);
    });
  });

  it('pages with limit and before, reporting hasMore', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const bob = await signUp(app, 'Bob');
      const { conversation } = SendDirectMessageResponseSchema.parse(
        (await sendDirect(app, alice, { recipientId: bob.id, body: 'm1' })).json(),
      );
      for (const n of [2, 3, 4]) await sendTo(app, alice, conversation.id, { body: `m${n}` });

      const newest = GetMessagesResponseSchema.parse(
        (await history(app, alice, conversation.id, { limit: '2' })).json(),
      );
      const older = GetMessagesResponseSchema.parse(
        (await history(app, alice, conversation.id, { limit: '2', before: '3' })).json(),
      );

      expect(newest.messages.map((m) => m.body)).toEqual(['m4', 'm3']);
      expect(newest.hasMore).toBe(true);
      expect(older.messages.map((m) => m.body)).toEqual(['m2', 'm1']);
      expect(older.hasMore).toBe(false);
    });
  });

  it('pages forward with after, oldest first, reporting hasMore', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const bob = await signUp(app, 'Bob');
      const { conversation } = SendDirectMessageResponseSchema.parse(
        (await sendDirect(app, alice, { recipientId: bob.id, body: 'm1' })).json(),
      );
      for (const n of [2, 3, 4, 5]) await sendTo(app, alice, conversation.id, { body: `m${n}` });

      const first = GetMessagesResponseSchema.parse(
        (await history(app, bob, conversation.id, { limit: '2', after: '1' })).json(),
      );
      const rest = GetMessagesResponseSchema.parse(
        (await history(app, bob, conversation.id, { limit: '5', after: '3' })).json(),
      );
      const none = GetMessagesResponseSchema.parse(
        (await history(app, bob, conversation.id, { after: '5' })).json(),
      );

      expect(first.messages.map((m) => m.body)).toEqual(['m2', 'm3']);
      expect(first.hasMore).toBe(true);
      expect(rest.messages.map((m) => m.body)).toEqual(['m4', 'm5']);
      expect(rest.hasMore).toBe(false);
      expect(none).toEqual({ messages: [], hasMore: false });
    });
  });

  it.each([
    { limit: '0' },
    { limit: '101' },
    { before: '0' },
    { before: 'abc' },
    { before: '2147483648' },
    { after: '-1' },
    { after: '1.5' },
    { after: '2147483648' },
    { before: '3', after: '1' },
    { befor: '5' },
  ] as Record<string, string>[])('rejects %j with 400 VALIDATION_FAILED', async (query) => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const bob = await signUp(app, 'Bob');
      const { conversation } = SendDirectMessageResponseSchema.parse(
        (await sendDirect(app, alice, { recipientId: bob.id })).json(),
      );

      const res = await history(app, alice, conversation.id, query);

      expect(res.statusCode).toBe(400);
      expect(errorCode(res)).toBe(ErrorCode.VALIDATION_FAILED);
    });
  });

  it('answers a never-Member with 404 CONVERSATION_NOT_FOUND', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const bob = await signUp(app, 'Bob');
      const mallory = await signUp(app, 'Mallory');
      const { conversation } = SendDirectMessageResponseSchema.parse(
        (await sendDirect(app, alice, { recipientId: bob.id })).json(),
      );

      for (const id of [conversation.id, randomUUID()]) {
        const res = await history(app, mallory, id);
        expect(res.statusCode).toBe(404);
        expect(errorCode(res)).toBe(ErrorCode.CONVERSATION_NOT_FOUND);
      }
    });
  });
});

describe('Message body handling', () => {
  it('round-trips newlines, < and > and surrounding whitespace exactly', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const bob = await signUp(app, 'Bob');
      const body = '  <b>hi</b>\nif a < b && b > c\n\ttabbed  ';

      const { conversation } = SendDirectMessageResponseSchema.parse(
        (await sendDirect(app, alice, { recipientId: bob.id, body })).json(),
      );
      const page = GetMessagesResponseSchema.parse(
        (await history(app, bob, conversation.id)).json(),
      );

      expect(page.messages[0]?.body).toBe(body);
    });
  });

  it('never logs the Message body', async () => {
    await withApp({}, async (app, logs) => {
      const alice = await signUp(app, 'Alice');
      const bob = await signUp(app, 'Bob');
      const secret = 'the-secret-message-body-7f3a';

      const { conversation } = SendDirectMessageResponseSchema.parse(
        (await sendDirect(app, alice, { recipientId: bob.id, body: secret })).json(),
      );
      await sendTo(app, bob, conversation.id, { body: secret });
      await history(app, alice, conversation.id);
      await sendDirect(app, alice, { recipientId: randomUUID(), body: secret });

      expect(logs.raw).not.toContain(secret);
    });
  });
});

const listConversations = (app: NestFastifyApplication, as: Person) =>
  app.inject({ method: 'GET', url: '/api/v1/conversations', headers: bearer(as) });

describe('GET /conversations', () => {
  it('requires authentication', async () => {
    await withApp({}, async (app) => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/conversations' });
      expect(res.statusCode).toBe(401);
    });
  });

  it('lists only my Conversations, most recently active first, named after the other User', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const bob = await signUp(app, 'Bob');
      const carol = await signUp(app, 'Carol');
      const dave = await signUp(app, 'Dave');
      await app.inject({
        method: 'PATCH',
        url: '/api/v1/users/me',
        headers: bearer(bob),
        payload: { nickname: 'Bobby B' },
      });
      await sendDirect(app, alice, { recipientId: bob.id, body: 'first to bob' });
      await sendDirect(app, carol, { recipientId: alice.id, body: 'carol here' });
      await sendDirect(app, carol, { recipientId: dave.id, body: 'not alice' });
      await sendDirect(app, bob, { recipientId: alice.id, body: 'line one\n\n  line two' });

      const res = await listConversations(app, alice);

      expect(res.statusCode).toBe(200);
      const { conversations } = ListConversationsResponseSchema.parse(res.json());
      expect(conversations.map((c) => c.name)).toEqual(['Bobby B', 'Carol']);
      expect(conversations[0]).toMatchObject({
        kind: 'direct',
        lastMessage: { senderId: bob.id, sequence: 2, preview: 'line one line two' },
      });
      expect(conversations[1]!.lastMessage?.preview).toBe('carol here');
      expect(conversations[0]!.members.map((m) => m.id).sort()).toEqual([alice.id, bob.id].sort());
      expect(JSON.stringify(res.json())).not.toContain('@example.com');
    });
  });

  it('fails loudly (500) instead of inventing a name when a Direct Conversation has no other Member', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const bob = await signUp(app, 'Bob');
      await sendDirect(app, alice, { recipientId: bob.id });
      // Impossible through the API: a Direct Conversation always has both Members.
      await app
        .get<Pool>(PG_POOL)
        .query('delete from conversation_members where user_id = $1', [bob.id]);

      const res = await listConversations(app, alice);

      expect(res.statusCode).toBe(500);
      expect(ErrorResponseSchema.parse(res.json()).error.code).toBe(ErrorCode.INTERNAL_ERROR);
    });
  });

  it('truncates the preview to 100 characters', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const bob = await signUp(app, 'Bob');
      await sendDirect(app, alice, { recipientId: bob.id, body: 'x'.repeat(500) });

      const { conversations } = ListConversationsResponseSchema.parse(
        (await listConversations(app, bob)).json(),
      );

      expect(conversations[0]!.lastMessage?.preview).toBe('x'.repeat(100));
    });
  });

  it('is empty for a User with no Conversations', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const res = await listConversations(app, alice);
      expect(ListConversationsResponseSchema.parse(res.json()).conversations).toEqual([]);
    });
  });
});

describe('GET /conversations/:id', () => {
  it('returns kind and Members to a Member', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const bob = await signUp(app, 'Bob');
      const { conversation } = SendDirectMessageResponseSchema.parse(
        (await sendDirect(app, alice, { recipientId: bob.id })).json(),
      );

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/conversations/${conversation.id}`,
        headers: bearer(bob),
      });

      expect(res.statusCode).toBe(200);
      const body = GetConversationResponseSchema.parse(res.json());
      expect(body.conversation.kind).toBe('direct');
      expect(body.conversation.members.map((m) => m.username).sort()).toEqual(['Alice', 'Bob']);
    });
  });

  it('answers 404 CONVERSATION_NOT_FOUND to a non-Member and for an unknown ID', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const bob = await signUp(app, 'Bob');
      const carol = await signUp(app, 'Carol');
      const { conversation } = SendDirectMessageResponseSchema.parse(
        (await sendDirect(app, alice, { recipientId: bob.id })).json(),
      );

      for (const id of [conversation.id, randomUUID()]) {
        const res = await app.inject({
          method: 'GET',
          url: `/api/v1/conversations/${id}`,
          headers: bearer(carol),
        });
        expect(res.statusCode).toBe(404);
        expect(errorCode(res)).toBe(ErrorCode.CONVERSATION_NOT_FOUND);
      }
    });
  });
});
