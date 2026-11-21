import type { LightMyRequestResponse } from 'fastify';
import { randomUUID } from 'node:crypto';
import {
  ConversationCreatedEventSchema,
  CreateGroupResponseSchema,
  ErrorCode,
  ErrorResponseSchema,
  GetConversationResponseSchema,
  ListConversationsResponseSchema,
  LoginResponseSchema,
  MessageCreatedEventSchema,
  SendMessageResponseSchema,
  type LoginResponse,
} from '@chat/contracts';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { Pool } from 'pg';
import { afterEach, describe, expect, it } from 'vitest';
import { withApp } from '../../test/app-harness.js';
import { closeAllSockets, connectSocket, listenOnRandomPort } from '../../test/socket-client.js';
import { PG_POOL } from '../db/database.module.js';

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

const bearer = (p: Person): { authorization: string } => ({ authorization: `Bearer ${p.token}` });

function createGroup(
  app: NestFastifyApplication,
  as: Person,
  payload: unknown,
): Promise<LightMyRequestResponse> {
  return app.inject({
    method: 'POST',
    url: '/api/v1/groups',
    headers: bearer(as),
    payload: payload as object,
  });
}

function errorCode(res: {
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
  | 'INTERNAL_ERROR' {
  return ErrorResponseSchema.parse(res.json()).error.code;
}

/** Inserts users straight into the database (registration is rate limited). */
async function insertUsers(app: NestFastifyApplication, count: number): Promise<string[]> {
  const { rows } = await app.get<Pool>(PG_POOL).query<{ id: string }>(
    `insert into users (username, email, password_hash)
     select 'bulk_' || n, 'bulk' || n || '@example.com', 'x' from generate_series(1, $1::int) n
     returning id`,
    [count],
  );
  return rows.map((r) => r.id);
}

afterEach(closeAllSockets);

describe('POST /groups', () => {
  it('requires authentication', async () => {
    await withApp({}, async (app) => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/groups',
        payload: { name: 'Club', memberIds: [] },
      });

      expect(res.statusCode).toBe(401);
      expect(errorCode(res)).toBe(ErrorCode.UNAUTHENTICATED);
    });
  });

  it('creates the Group with the caller as Owner and Member, plus the initial Members', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const bob = await signUp(app, 'Bob');
      const carol = await signUp(app, 'Carol');

      const res = await createGroup(app, alice, {
        name: '  Book Club  ',
        memberIds: [bob.id, carol.id],
      });

      expect(res.statusCode).toBe(201);
      const { conversation } = CreateGroupResponseSchema.parse(res.json());
      expect(conversation.id).toMatch(UUIDV7);
      expect(conversation).toMatchObject({ kind: 'group', name: 'Book Club', ownerId: alice.id });
      expect(conversation.members.map((m) => m.id).sort()).toEqual(
        [alice.id, bob.id, carol.id].sort(),
      );
      expect(conversation.members[0]).toEqual({
        id: expect.any(String),
        username: expect.any(String),
        nickname: null,
      });
    });
  });

  it('counts the caller and repeated IDs once', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const bob = await signUp(app, 'Bob');

      const res = await createGroup(app, alice, {
        name: 'Club',
        memberIds: [bob.id, alice.id, bob.id],
      });

      expect(res.statusCode).toBe(201);
      const { conversation } = CreateGroupResponseSchema.parse(res.json());
      expect(conversation.members.map((m) => m.id).sort()).toEqual([alice.id, bob.id].sort());
    });
  });

  it('allows a Group with only its Owner', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');

      const res = await createGroup(app, alice, { name: 'Notes', memberIds: [] });

      expect(res.statusCode).toBe(201);
      expect(CreateGroupResponseSchema.parse(res.json()).conversation.members).toHaveLength(1);
    });
  });

  it('rejects an invalid name or body with VALIDATION_FAILED and creates nothing', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');

      for (const payload of [
        { name: '   ', memberIds: [] },
        { name: 'x'.repeat(101), memberIds: [] },
        { name: 'Bad‮name', memberIds: [] },
        { name: 'Club' },
        { name: 'Club', memberIds: ['not-a-uuid'] },
      ]) {
        const res = await createGroup(app, alice, payload);
        expect(res.statusCode).toBe(400);
        expect(errorCode(res)).toBe(ErrorCode.VALIDATION_FAILED);
      }
      const list = await app.inject({
        method: 'GET',
        url: '/api/v1/conversations',
        headers: bearer(alice),
      });
      expect(list.json()).toEqual({ conversations: [] });
    });
  });

  it('answers USER_NOT_FOUND for an unknown User ID and creates nothing', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const bob = await signUp(app, 'Bob');

      const res = await createGroup(app, alice, {
        name: 'Club',
        memberIds: [bob.id, randomUUID()],
      });

      expect(res.statusCode).toBe(404);
      expect(errorCode(res)).toBe(ErrorCode.USER_NOT_FOUND);
      const list = await app.inject({
        method: 'GET',
        url: '/api/v1/conversations',
        headers: bearer(bob),
      });
      expect(list.json()).toEqual({ conversations: [] });
    });
  });

  it('allows 256 Members including the Owner and rejects more with GROUP_FULL', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const others = await insertUsers(app, 256);

      const full = await createGroup(app, alice, { name: 'Full', memberIds: others.slice(0, 255) });
      const over = await createGroup(app, alice, { name: 'Over', memberIds: others });

      expect(full.statusCode).toBe(201);
      expect(CreateGroupResponseSchema.parse(full.json()).conversation.members).toHaveLength(256);
      expect(over.statusCode).toBe(409);
      expect(errorCode(over)).toBe(ErrorCode.GROUP_FULL);
    });
  });
});

describe('Groups in the Conversation endpoints', () => {
  it('lists the Group for every Member with its name, before any Message', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const bob = await signUp(app, 'Bob');
      const { conversation } = CreateGroupResponseSchema.parse(
        (await createGroup(app, alice, { name: 'Club', memberIds: [bob.id] })).json(),
      );

      for (const member of [alice, bob]) {
        const res = await app.inject({
          method: 'GET',
          url: '/api/v1/conversations',
          headers: bearer(member),
        });
        const { conversations } = ListConversationsResponseSchema.parse(res.json());
        expect(conversations).toHaveLength(1);
        expect(conversations[0]).toMatchObject({
          id: conversation.id,
          kind: 'group',
          name: 'Club',
          lastMessage: null,
        });
        expect(conversations[0]!.members).toHaveLength(2);
      }
    });
  });

  it('sorts a Group with Messages among Direct Conversations by latest Message', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const bob = await signUp(app, 'Bob');
      await app.inject({
        method: 'POST',
        url: '/api/v1/direct-messages',
        headers: bearer(alice),
        payload: { recipientId: bob.id, clientMessageId: randomUUID(), body: 'direct' },
      });
      const { conversation } = CreateGroupResponseSchema.parse(
        (await createGroup(app, alice, { name: 'Club', memberIds: [bob.id] })).json(),
      );
      await app.inject({
        method: 'POST',
        url: `/api/v1/conversations/${conversation.id}/messages`,
        headers: bearer(alice),
        payload: { clientMessageId: randomUUID(), body: 'group hello' },
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/conversations',
        headers: bearer(bob),
      });

      const { conversations } = ListConversationsResponseSchema.parse(res.json());
      expect(conversations.map((c) => [c.kind, c.lastMessage?.preview])).toEqual([
        ['group', 'group hello'],
        ['direct', 'direct'],
      ]);
    });
  });

  it('returns the Members and the Owner for a Group, only to its Members', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const bob = await signUp(app, 'Bob');
      const dave = await signUp(app, 'Dave');
      const { conversation } = CreateGroupResponseSchema.parse(
        (await createGroup(app, alice, { name: 'Club', memberIds: [bob.id] })).json(),
      );

      const asBob = await app.inject({
        method: 'GET',
        url: `/api/v1/conversations/${conversation.id}`,
        headers: bearer(bob),
      });
      const asDave = await app.inject({
        method: 'GET',
        url: `/api/v1/conversations/${conversation.id}`,
        headers: bearer(dave),
      });

      expect(GetConversationResponseSchema.parse(asBob.json()).conversation).toEqual({
        ...conversation,
        isMember: true,
      });
      expect(asDave.statusCode).toBe(404);
      expect(errorCode(asDave)).toBe(ErrorCode.CONVERSATION_NOT_FOUND);
    });
  });

  it('lets every Member send and read Messages through the existing endpoints', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const bob = await signUp(app, 'Bob');
      const dave = await signUp(app, 'Dave');
      const { conversation } = CreateGroupResponseSchema.parse(
        (await createGroup(app, alice, { name: 'Club', memberIds: [bob.id] })).json(),
      );
      const send = (as: Person, body: string): Promise<LightMyRequestResponse> =>
        app.inject({
          method: 'POST',
          url: `/api/v1/conversations/${conversation.id}/messages`,
          headers: bearer(as),
          payload: { clientMessageId: randomUUID(), body },
        });

      const fromAlice = await send(alice, 'hi all');
      const fromBob = await send(bob, 'hi alice');
      const fromDave = await send(dave, 'let me in');

      expect(fromAlice.statusCode).toBe(201);
      expect(SendMessageResponseSchema.parse(fromBob.json()).message.sequence).toBe(2);
      expect(fromDave.statusCode).toBe(404);
      const history = await app.inject({
        method: 'GET',
        url: `/api/v1/conversations/${conversation.id}/messages`,
        headers: bearer(bob),
      });
      expect(history.json().messages.map((m: { body: string }) => m.body)).toEqual([
        'hi alice',
        'hi all',
      ]);
    });
  });
});

describe('Group push', () => {
  it('pushes conversation.created to every initial Member and nobody else', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const bob = await signUp(app, 'Bob');
      const carol = await signUp(app, 'Carol');
      const dave = await signUp(app, 'Dave');
      const url = await listenOnRandomPort(app);
      const sockets = {
        alice: await connectSocket(url, alice.token),
        bob: await connectSocket(url, bob.token),
        carol: await connectSocket(url, carol.token),
        dave: await connectSocket(url, dave.token),
      };
      const seen = [sockets.alice, sockets.bob, sockets.carol].map((s) =>
        s.next('conversation.created'),
      );

      const res = await createGroup(app, alice, { name: 'Club', memberIds: [bob.id, carol.id] });

      const { conversation } = CreateGroupResponseSchema.parse(res.json());
      for (const payload of await Promise.all(seen)) {
        expect(ConversationCreatedEventSchema.parse(payload).conversation).toMatchObject({
          id: conversation.id,
          kind: 'group',
          name: 'Club',
          lastMessage: null,
        });
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(sockets.dave.received).toEqual([]);
    });
  });

  it('pushes message.created for a Group Message to every Member', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const bob = await signUp(app, 'Bob');
      const carol = await signUp(app, 'Carol');
      const dave = await signUp(app, 'Dave');
      const { conversation } = CreateGroupResponseSchema.parse(
        (await createGroup(app, alice, { name: 'Club', memberIds: [bob.id, carol.id] })).json(),
      );
      const url = await listenOnRandomPort(app);
      const aliceSocket = await connectSocket(url, alice.token);
      const bobSocket = await connectSocket(url, bob.token);
      const carolSocket = await connectSocket(url, carol.token);
      const daveSocket = await connectSocket(url, dave.token);
      const seen = [aliceSocket, bobSocket, carolSocket].map((s) => s.next('message.created'));

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/conversations/${conversation.id}/messages`,
        headers: bearer(bob),
        payload: { clientMessageId: randomUUID(), body: 'hello group' },
      });

      const { message } = SendMessageResponseSchema.parse(res.json());
      for (const payload of await Promise.all(seen)) {
        expect(MessageCreatedEventSchema.parse(payload)).toEqual({ message });
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(daveSocket.received).toEqual([]);
    });
  });
});
