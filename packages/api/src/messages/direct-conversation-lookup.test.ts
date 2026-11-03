import { randomUUID } from 'node:crypto';
import {
  ErrorCode,
  ErrorResponseSchema,
  GetDirectConversationResponseSchema,
  ListConversationsResponseSchema,
  SendDirectMessageResponseSchema,
} from '@chat/contracts';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { describe, expect, it } from 'vitest';
import { withApp } from '../../test/app-harness.js';
import { bearer, signUp, type Person } from '../../test/people.js';

function lookup(app: NestFastifyApplication, as: Person, userId: string) {
  return app.inject({
    method: 'GET',
    url: `/api/v1/direct-conversations/${userId}`,
    headers: bearer(as),
  });
}

function sendDirect(app: NestFastifyApplication, from: Person, recipientId: string) {
  return app.inject({
    method: 'POST',
    url: '/api/v1/direct-messages',
    headers: bearer(from),
    payload: { recipientId, clientMessageId: randomUUID(), body: 'hi' },
  });
}

const errorCode = (res: { json(): unknown }) => ErrorResponseSchema.parse(res.json()).error.code;

describe('GET /direct-conversations/:userId', () => {
  it('requires authentication', async () => {
    await withApp({}, async (app) => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/direct-conversations/${randomUUID()}`,
      });

      expect(res.statusCode).toBe(401);
      expect(errorCode(res)).toBe(ErrorCode.UNAUTHENTICATED);
    });
  });

  it('returns the peer and the conversationId when the Direct Conversation exists', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const bob = await signUp(app, 'Bob');
      const sent = SendDirectMessageResponseSchema.parse(
        (await sendDirect(app, alice, bob.id)).json(),
      );

      for (const [asUser, other] of [
        [alice, bob],
        [bob, alice],
      ] as const) {
        const res = await lookup(app, asUser, other.id);

        expect(res.statusCode).toBe(200);
        const body = GetDirectConversationResponseSchema.parse(res.json());
        expect(body.conversationId).toBe(sent.conversation.id);
        expect(body.peer.id).toBe(other.id);
      }
    });
  });

  it('returns the peer without conversationId, and creates nothing, when there is none', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const bob = await signUp(app, 'Bob');

      const res = await lookup(app, alice, bob.id);

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ peer: { id: bob.id, username: 'Bob', nickname: null } });
      const list = await app.inject({
        method: 'GET',
        url: '/api/v1/conversations',
        headers: bearer(alice),
      });
      expect(ListConversationsResponseSchema.parse(list.json()).conversations).toEqual([]);
    });
  });

  it.each([
    ['an unknown User', () => randomUUID()],
    ['the caller', (alice: Person) => alice.id],
  ])('returns 404 USER_NOT_FOUND for %s', async (_name, pick) => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');

      const res = await lookup(app, alice, pick(alice));

      expect(res.statusCode).toBe(404);
      expect(errorCode(res)).toBe(ErrorCode.USER_NOT_FOUND);
    });
  });

  it('returns 400 VALIDATION_FAILED for a malformed id', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');

      const res = await lookup(app, alice, 'not-a-uuid');

      expect(res.statusCode).toBe(400);
      expect(errorCode(res)).toBe(ErrorCode.VALIDATION_FAILED);
    });
  });
});
