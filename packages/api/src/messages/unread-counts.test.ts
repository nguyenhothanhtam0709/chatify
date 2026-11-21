import type { LightMyRequestResponse } from 'fastify';
import { randomUUID } from 'node:crypto';
import { ListConversationsResponseSchema, SendDirectMessageResponseSchema } from '@chat/contracts';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { describe, expect, it } from 'vitest';
import { withApp } from '../../test/app-harness.js';
import { bearer, createGroup, signUp, type Person } from '../../test/people.js';

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

const leave = (
  app: NestFastifyApplication,
  as: Person,
  groupId: string,
): Promise<LightMyRequestResponse> =>
  app.inject({ method: 'POST', url: `/api/v1/groups/${groupId}/leave`, headers: bearer(as) });

const sendDirect = async (
  app: NestFastifyApplication,
  as: Person,
  to: Person,
  body: string,
): Promise<{ id: string; kind: 'direct'; memberIds: string[] }> =>
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

const post = (
  app: NestFastifyApplication,
  as: Person,
  conversationId: string,
  body: string,
): Promise<LightMyRequestResponse> =>
  app.inject({
    method: 'POST',
    url: `/api/v1/conversations/${conversationId}/messages`,
    headers: bearer(as),
    payload: { clientMessageId: randomUUID(), body },
  });

/** The caller's Unread Count for one Conversation, read from the Conversation list. */
async function unreadCount(
  app: NestFastifyApplication,
  as: Person,
  conversationId: string,
): Promise<number> {
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

describe('Unread Counts in the Conversation list', () => {
  it('counts the first Message of a new Direct Conversation for the recipient only, and a reply clears the replier’s', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const bob = await signUp(app, 'Bob');

      const direct = await sendDirect(app, bob, alice, 'hi alice');

      expect(await unreadCount(app, alice, direct.id)).toBe(1);
      expect(await unreadCount(app, bob, direct.id)).toBe(0);

      await post(app, alice, direct.id, 'hi bob');

      expect(await unreadCount(app, alice, direct.id)).toBe(0);
      expect(await unreadCount(app, bob, direct.id)).toBe(1);
    });
  });

  it('starts a Group’s Members with nothing unread, ignores what came before a Member joined, and never counts System Messages', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const bob = await signUp(app, 'Bob');
      const carol = await signUp(app, 'Carol');
      const group = await createGroup(app, alice, [bob.id]);

      expect(await unreadCount(app, bob, group.id)).toBe(0);

      await post(app, alice, group.id, 'before carol');
      await post(app, bob, group.id, 'also before carol');
      await addMember(app, alice, group.id, carol.id);

      expect(await unreadCount(app, carol, group.id)).toBe(0);
      // Bob's own send read Alice's earlier Message; the "added" System Message does not count.
      expect(await unreadCount(app, bob, group.id)).toBe(0);
      expect(await unreadCount(app, alice, group.id)).toBe(1);

      await post(app, alice, group.id, 'welcome carol');

      expect(await unreadCount(app, carol, group.id)).toBe(1);
      expect(await unreadCount(app, bob, group.id)).toBe(1);
      expect(await unreadCount(app, alice, group.id)).toBe(0);
    });
  });

  it('has no Unread Count for a Former Member, and a re-added Former Member starts fresh', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const bob = await signUp(app, 'Bob');
      const group = await createGroup(app, alice, [bob.id]);
      await post(app, alice, group.id, 'bob reads this later, maybe');
      expect(await unreadCount(app, bob, group.id)).toBe(1);
      await removeMember(app, alice, group.id, bob.id);

      expect(await unreadCount(app, bob, group.id)).toBe(0);

      await post(app, alice, group.id, 'while bob is away');
      await addMember(app, alice, group.id, bob.id);

      expect(await unreadCount(app, bob, group.id)).toBe(0);

      await post(app, alice, group.id, 'welcome back');

      expect(await unreadCount(app, bob, group.id)).toBe(1);
    });
  });

  it('has no Unread Count in a Closed Group', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const bob = await signUp(app, 'Bob');
      const group = await createGroup(app, alice, [bob.id]);
      await post(app, alice, group.id, 'bye');
      await leave(app, alice, group.id);
      await leave(app, bob, group.id);

      expect(await unreadCount(app, alice, group.id)).toBe(0);
      expect(await unreadCount(app, bob, group.id)).toBe(0);
    });
  });

  it('caps the Unread Count at 100', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      // Four senders, so no one hits the 30 / 10 s send limit.
      const senders = await Promise.all(
        ['Bob', 'Carol', 'Dave', 'Erin'].map((n) => signUp(app, n)),
      );
      const group = await createGroup(
        app,
        alice,
        senders.map((s) => s.id),
      );
      for (let i = 0; i < 25; i++) {
        for (const sender of senders) await post(app, sender, group.id, `message ${i}`);
      }

      expect(await unreadCount(app, alice, group.id)).toBe(100);

      await post(app, senders[0]!, group.id, 'one more');

      expect(await unreadCount(app, alice, group.id)).toBe(100);
    });
  });
});
