import type { LightMyRequestResponse } from 'fastify';
import { randomUUID } from 'node:crypto';
import {
  GetMessagesResponseSchema,
  ListConversationsResponseSchema,
  MessageCreatedEventSchema,
  SendMessageResponseSchema,
} from '@chat/contracts';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { withApp } from '../../test/app-harness.js';
import { bearer, createGroup, signUp, type Person } from '../../test/people.js';
import { closeAllSockets, connectSocket, listenOnRandomPort } from '../../test/socket-client.js';

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

const post = (
  app: NestFastifyApplication,
  as: Person,
  groupId: string,
  body: string,
): Promise<LightMyRequestResponse> =>
  app.inject({
    method: 'POST',
    url: `/api/v1/conversations/${groupId}/messages`,
    headers: bearer(as),
    payload: { clientMessageId: randomUUID(), body },
  });

const history = (
  app: NestFastifyApplication,
  as: Person,
  groupId: string,
  query = '',
): Promise<LightMyRequestResponse> =>
  app.inject({
    method: 'GET',
    url: `/api/v1/conversations/${groupId}/messages${query}`,
    headers: bearer(as),
  });

async function summaryOf(
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
> {
  const res = await app.inject({
    method: 'GET',
    url: '/api/v1/conversations',
    headers: bearer(as),
  });
  return ListConversationsResponseSchema.parse(res.json()).conversations.find(
    (c) => c.id === groupId,
  );
}

const leave = (
  app: NestFastifyApplication,
  as: Person,
  groupId: string,
): Promise<LightMyRequestResponse> =>
  app.inject({ method: 'POST', url: `/api/v1/groups/${groupId}/leave`, headers: bearer(as) });

/** Oldest first, as `[kind, body-or-subject-username]`. */
async function timeline(
  app: NestFastifyApplication,
  as: Person,
  groupId: string,
): Promise<
  (readonly [
    'text' | 'member_added' | 'member_removed' | 'member_left' | 'owner_changed',
    string | undefined,
  ])[]
> {
  const res = await history(app, as, groupId, '?limit=100');
  return GetMessagesResponseSchema.parse(res.json())
    .messages.reverse()
    .map((m) => [m.kind, m.kind === 'text' ? m.body : m.subject?.username] as const);
}

afterEach(closeAllSockets);
describe('stored system messages', () => {
  it('stores "added" in history at its place in the sequence, for Members and the added User', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const bob = await signUp(app, 'Bob');
      const group = await createGroup(app, alice);
      await post(app, alice, group.id, 'before');
      await addMember(app, alice, group.id, bob.id);
      await post(app, alice, group.id, 'after');

      expect(await timeline(app, alice, group.id)).toEqual([
        ['text', 'before'],
        ['member_added', 'Bob'],
        ['text', 'after'],
      ]);
      expect(await timeline(app, bob, group.id)).toEqual([
        ['member_added', 'Bob'],
        ['text', 'after'],
      ]);
      const res = await history(app, alice, group.id, '?limit=100');
      const systemMessage = GetMessagesResponseSchema.parse(res.json()).messages.find(
        (m) => m.kind === 'member_added',
      )!;
      expect(systemMessage.sequence).toBe(2);
      expect(systemMessage.senderId).toBe(alice.id);
    });
  });

  it('stores "removed" and "left", visible to the Former Member only up to their own System Message', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const bob = await signUp(app, 'Bob');
      const carol = await signUp(app, 'Carol');
      const group = await createGroup(app, alice, [bob.id, carol.id]);
      await removeMember(app, alice, group.id, bob.id);
      await post(app, alice, group.id, 'bob is gone');
      await leave(app, carol, group.id);
      await post(app, alice, group.id, 'carol is gone');

      expect(await timeline(app, alice, group.id)).toEqual([
        ['member_removed', 'Bob'],
        ['text', 'bob is gone'],
        ['member_left', 'Carol'],
        ['text', 'carol is gone'],
      ]);
      expect(await timeline(app, bob, group.id)).toEqual([['member_removed', 'Bob']]);
      expect(await timeline(app, carol, group.id)).toEqual([
        ['member_removed', 'Bob'],
        ['text', 'bob is gone'],
        ['member_left', 'Carol'],
      ]);
    });
  });

  it('keeps a Former Member who is added back from seeing the gap, system messages included', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const bob = await signUp(app, 'Bob');
      const carol = await signUp(app, 'Carol');
      const group = await createGroup(app, alice, [bob.id]);
      await removeMember(app, alice, group.id, bob.id);
      await addMember(app, alice, group.id, carol.id);
      await post(app, alice, group.id, 'gap');
      await addMember(app, alice, group.id, bob.id);

      expect(await timeline(app, bob, group.id)).toEqual([
        ['member_removed', 'Bob'],
        ['member_added', 'Bob'],
      ]);
    });
  });

  it('does not let system messages change the preview or the sequence of lastMessage', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const bob = await signUp(app, 'Bob');
      const group = await createGroup(app, alice);
      expect((await summaryOf(app, alice, group.id))?.lastMessage).toBeNull();
      const sent = SendMessageResponseSchema.parse(
        (await post(app, alice, group.id, 'hello there')).json(),
      );
      await addMember(app, alice, group.id, bob.id);

      expect((await summaryOf(app, alice, group.id))?.lastMessage).toMatchObject({
        preview: 'hello there',
        sequence: sent.message.sequence,
      });
      expect((await summaryOf(app, bob, group.id))?.lastMessage).toBeNull();
    });
  });

  it('pushes the System Message as message.created to the current Members and the added User, once each', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const bob = await signUp(app, 'Bob');
      const group = await createGroup(app, alice);
      const url = await listenOnRandomPort(app);
      const aliceTab = await connectSocket(url, alice.token);
      const bobTab = await connectSocket(url, bob.token);
      const pushed = aliceTab.next('message.created');

      await addMember(app, alice, group.id, bob.id);

      const { message } = MessageCreatedEventSchema.parse(await pushed);
      expect(message.kind).toBe('member_added');
      expect(message.subject?.username).toBe('Bob');
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(bobTab.received.filter(([name]) => name === 'message.created')).toHaveLength(1);
      expect(aliceTab.received.filter(([name]) => name === 'message.created')).toHaveLength(1);
    });
  });

  it('stores "owner changed" right after the Owner\'s "left", for the remaining Members and not the leaver', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const bob = await signUp(app, 'Bob');
      const group = await createGroup(app, alice, [bob.id]);
      await leave(app, alice, group.id);
      await post(app, bob, group.id, 'now I am in charge');

      expect(await timeline(app, bob, group.id)).toEqual([
        ['member_left', 'Alice'],
        ['owner_changed', 'Bob'],
        ['text', 'now I am in charge'],
      ]);
      expect(await timeline(app, alice, group.id)).toEqual([['member_left', 'Alice']]);
      const changed = GetMessagesResponseSchema.parse(
        (await history(app, bob, group.id)).json(),
      ).messages.find((m) => m.kind === 'owner_changed');
      expect(changed?.senderId).toBe(alice.id);
      expect(changed?.body).toBe('');
    });
  });

  it('stores no "owner changed" when a non-Owner leaves or the last Member closes the Group', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const bob = await signUp(app, 'Bob');
      const group = await createGroup(app, alice, [bob.id]);
      await leave(app, bob, group.id);
      await leave(app, alice, group.id);

      expect(await timeline(app, alice, group.id)).toEqual([
        ['member_left', 'Bob'],
        ['member_left', 'Alice'],
      ]);
    });
  });

  it('pushes the "owner changed" System Message to the remaining Members, after "left"', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const bob = await signUp(app, 'Bob');
      const group = await createGroup(app, alice, [bob.id]);
      const url = await listenOnRandomPort(app);
      const bobTab = await connectSocket(url, bob.token);
      const first = bobTab.next('message.created');

      await leave(app, alice, group.id);

      expect(MessageCreatedEventSchema.parse(await first).message.kind).toBe('member_left');
      const second = MessageCreatedEventSchema.parse(await bobTab.next('message.created'));
      expect(second.message.kind).toBe('owner_changed');
      expect(second.message.subject?.username).toBe('Bob');
    });
  });
});
