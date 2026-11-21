import type { LightMyRequestResponse } from 'fastify';
import { randomUUID } from 'node:crypto';
import { GroupMembershipEndedEventSchema } from '@chat/contracts';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { withApp } from '../../test/app-harness.js';
import { bearer, createGroup, signUp, type Person } from '../../test/people.js';
import {
  closeAllSockets,
  connectSocket,
  listenOnRandomPort,
  type TestSocket,
} from '../../test/socket-client.js';
import { MessagesService } from '../messages/messages.service.js';
import { RealtimeGateway, conversationRoom } from '../realtime/realtime.gateway.js';

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

const leave = (
  app: NestFastifyApplication,
  as: Person,
  groupId: string,
): Promise<LightMyRequestResponse> =>
  app.inject({ method: 'POST', url: `/api/v1/groups/${groupId}/leave`, headers: bearer(as) });

const post = (
  app: NestFastifyApplication,
  as: Person,
  groupId: string,
  body = 'hello',
): Promise<LightMyRequestResponse> =>
  app.inject({
    method: 'POST',
    url: `/api/v1/conversations/${groupId}/messages`,
    headers: bearer(as),
    payload: { clientMessageId: randomUUID(), body },
  });

const settle = (): Promise<unknown> => new Promise((resolve) => setTimeout(resolve, 200));

const inRoom = async (app: NestFastifyApplication, groupId: string): Promise<string[]> => {
  const sockets = await app
    .get(RealtimeGateway)
    .server.in(conversationRoom(groupId))
    .fetchSockets();
  return sockets.map((s) => s.id).sort();
};

const ids = (...clients: TestSocket[]): string[] => clients.map((c) => c.socket.id!).sort();
const names = (client: TestSocket): string[] => client.received.map(([name]) => name);
const bothNext = (event: string, a: TestSocket, b: TestSocket): Promise<[unknown, unknown]> =>
  Promise.all([a.next(event), b.next(event)]);

afterEach(closeAllSockets);

// oxlint-disable-next-line max-lines-per-function -- a test suite or case keeps its setup and assertions in one block; splitting it would scatter them
describe('Group rooms', () => {
  it('puts the sockets of every Member, on connect, in the Group room and nobody else', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const bob = await signUp(app, 'Bob');
      const carol = await signUp(app, 'Carol');
      const group = await createGroup(app, alice, [bob.id]);
      const url = await listenOnRandomPort(app);

      const aliceTab = await connectSocket(url, alice.token);
      const bobTab1 = await connectSocket(url, bob.token);
      const bobTab2 = await connectSocket(url, bob.token);
      await connectSocket(url, carol.token);

      expect(await inRoom(app, group.id)).toEqual(ids(aliceTab, bobTab1, bobTab2));
    });
  });

  it('takes a removed User out of the room on every tab, with one event saying so, and nothing after', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const bob = await signUp(app, 'Bob');
      const group = await createGroup(app, alice, [bob.id]);
      const url = await listenOnRandomPort(app);
      const aliceTab = await connectSocket(url, alice.token);
      const bobTab1 = await connectSocket(url, bob.token);
      const bobTab2 = await connectSocket(url, bob.token);
      const ended = bothNext('group.membership_ended', bobTab1, bobTab2);

      await removeMember(app, alice, group.id, bob.id);

      for (const payload of await ended) {
        expect(GroupMembershipEndedEventSchema.parse(payload)).toEqual({
          conversationId: group.id,
        });
      }
      expect(await inRoom(app, group.id)).toEqual(ids(aliceTab));
      await post(app, alice, group.id, 'after removal');
      await settle();
      for (const tab of [bobTab1, bobTab2]) expect(names(tab)).toEqual(['group.membership_ended']);
      expect(names(aliceTab)).toContain('message.created');
    });
  });

  it('does not re-join a removed User on reconnect', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const bob = await signUp(app, 'Bob');
      const group = await createGroup(app, alice, [bob.id]);
      const url = await listenOnRandomPort(app);
      const aliceTab = await connectSocket(url, alice.token);
      const bobTab = await connectSocket(url, bob.token);
      await removeMember(app, alice, group.id, bob.id);
      bobTab.close();

      const bobAgain = await connectSocket(url, bob.token);
      await post(app, alice, group.id, 'after removal');
      await settle();

      expect(await inRoom(app, group.id)).toEqual(ids(aliceTab));
      expect(names(bobAgain)).toEqual([]);
    });
  });

  it('re-joins every socket of a Former Member who is added back', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const bob = await signUp(app, 'Bob');
      const group = await createGroup(app, alice, [bob.id]);
      const url = await listenOnRandomPort(app);
      const aliceTab = await connectSocket(url, alice.token);
      const bobTab1 = await connectSocket(url, bob.token);
      const bobTab2 = await connectSocket(url, bob.token);
      await removeMember(app, alice, group.id, bob.id);
      await settle();
      expect(await inRoom(app, group.id)).toEqual(ids(aliceTab));

      await addMember(app, alice, group.id, bob.id);
      const received = bothNext('message.created', bobTab1, bobTab2);
      await post(app, alice, group.id, 'welcome back');

      expect(await inRoom(app, group.id)).toEqual(ids(aliceTab, bobTab1, bobTab2));
      expect(await received).toHaveLength(2);
    });
  });

  it('takes a leaver out of the room on every tab, with one event saying so', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const bob = await signUp(app, 'Bob');
      const group = await createGroup(app, alice, [bob.id]);
      const url = await listenOnRandomPort(app);
      const aliceTab = await connectSocket(url, alice.token);
      const bobTab1 = await connectSocket(url, bob.token);
      const bobTab2 = await connectSocket(url, bob.token);
      const ended = bothNext('group.membership_ended', bobTab1, bobTab2);

      await leave(app, bob, group.id);
      await ended;
      await post(app, alice, group.id, 'after leaving');
      await settle();

      expect(await inRoom(app, group.id)).toEqual(ids(aliceTab));
      for (const tab of [bobTab1, bobTab2]) expect(names(tab)).toEqual(['group.membership_ended']);
    });
  });

  it('tells the last Member who leaves only that the Group closed', async () => {
    await withApp({}, async (app) => {
      const alice = await signUp(app, 'Alice');
      const group = await createGroup(app, alice);
      const url = await listenOnRandomPort(app);
      const tab = await connectSocket(url, alice.token);
      const closed = tab.next('group.closed');

      await leave(app, alice, group.id);
      await closed;
      await settle();

      expect(names(tab)).toEqual(['group.closed']);
      expect(await inRoom(app, group.id)).toEqual([]);
    });
  });

  // oxlint-disable-next-line max-lines-per-function -- a test suite or case keeps its setup and assertions in one block; splitting it would scatter them
  describe('leak windows', () => {
    type Rooms = { groupRoomsOf(userId: string): Promise<string[]> };

    it('does not keep a socket in the room when its handshake read lost a race with a removal', async () => {
      await withApp({}, async (app) => {
        const alice = await signUp(app, 'Alice');
        const bob = await signUp(app, 'Bob');
        const group = await createGroup(app, alice, [bob.id]);
        const url = await listenOnRandomPort(app);
        const aliceTab = await connectSocket(url, alice.token);
        // The handshake reads Bob's Groups, then Bob is removed before the socket joins them.
        const gateway = app.get(RealtimeGateway) as unknown as Rooms;
        const read = gateway.groupRoomsOf.bind(gateway);
        vi.spyOn(gateway, 'groupRoomsOf').mockImplementationOnce(async (userId) => {
          const rooms = await read(userId);
          await removeMember(app, alice, group.id, bob.id);
          return rooms;
        });

        await connectSocket(url, bob.token);

        await vi.waitFor(async () => expect(await inRoom(app, group.id)).toEqual(ids(aliceTab)));
      });
    });

    it('joins a socket that connected while it was being added to the Group', async () => {
      await withApp({}, async (app) => {
        const alice = await signUp(app, 'Alice');
        const bob = await signUp(app, 'Bob');
        const group = await createGroup(app, alice);
        const url = await listenOnRandomPort(app);
        await connectSocket(url, alice.token);
        // The handshake reads Bob's Groups, then Bob is added before the socket joins them.
        const gateway = app.get(RealtimeGateway) as unknown as Rooms;
        const read = gateway.groupRoomsOf.bind(gateway);
        vi.spyOn(gateway, 'groupRoomsOf').mockImplementationOnce(async (userId) => {
          const rooms = await read(userId);
          await addMember(app, alice, group.id, bob.id);
          return rooms;
        });

        const bobTab = await connectSocket(url, bob.token);

        await vi.waitFor(async () =>
          expect(await inRoom(app, group.id)).toContain(bobTab.socket.id),
        );
      });
    });

    it('keeps an added User in the room when a read after the commit fails', async () => {
      await withApp({}, async (app) => {
        const alice = await signUp(app, 'Alice');
        const bob = await signUp(app, 'Bob');
        const group = await createGroup(app, alice);
        const url = await listenOnRandomPort(app);
        const aliceTab = await connectSocket(url, alice.token);
        const bobTab = await connectSocket(url, bob.token);
        vi.spyOn(app.get(MessagesService), 'get').mockRejectedValueOnce(new Error('read failed'));

        await addMember(app, alice, group.id, bob.id);

        expect(await inRoom(app, group.id)).toEqual(ids(aliceTab, bobTab));
      });
    });

    it('does not put a User back in the room when a removal commits between the recheck read and its join', async () => {
      await withApp({}, async (app) => {
        const alice = await signUp(app, 'Alice');
        const bob = await signUp(app, 'Bob');
        const group = await createGroup(app, alice);
        const url = await listenOnRandomPort(app);
        const aliceTab = await connectSocket(url, alice.token);
        const gateway = app.get(RealtimeGateway) as unknown as Rooms & {
          reconcileGroupRooms(...args: unknown[]): Promise<void>;
        };
        const read = gateway.groupRoomsOf.bind(gateway);
        // Handshake read: Bob is not a Member yet, then he is added. Recheck read: he is a
        // Member, then he is removed before the socket joins. Later reads are real.
        vi.spyOn(gateway, 'groupRoomsOf')
          .mockImplementationOnce(async (userId) => {
            const rooms = await read(userId);
            await addMember(app, alice, group.id, bob.id);
            return rooms;
          })
          .mockImplementationOnce(async (userId) => {
            const rooms = await read(userId);
            await removeMember(app, alice, group.id, bob.id);
            return rooms;
          });
        const reconcile = gateway.reconcileGroupRooms.bind(gateway);
        let reconciled: Promise<void> = Promise.resolve();
        vi.spyOn(gateway, 'reconcileGroupRooms').mockImplementation((...args) => {
          reconciled = reconcile(...args);
          return reconciled;
        });

        await connectSocket(url, bob.token);
        await reconciled;

        expect(await inRoom(app, group.id)).toEqual(ids(aliceTab));
      });
    });

    it('delivers the first Message after an add to the added User, even when the add is slow to finish', async () => {
      await withApp({}, async (app) => {
        const alice = await signUp(app, 'Alice');
        const bob = await signUp(app, 'Bob');
        const group = await createGroup(app, alice);
        const url = await listenOnRandomPort(app);
        await connectSocket(url, alice.token);
        const bobTab = await connectSocket(url, bob.token);
        // Hold the add right after its commit, then send a Message while it is held.
        const service = app.get(MessagesService);
        const get = service.get.bind(service);
        let release!: () => void;
        const held = new Promise<void>((resolve) => (release = resolve));
        let reached!: () => void;
        const afterCommit = new Promise<void>((resolve) => (reached = resolve));
        vi.spyOn(service, 'get').mockImplementationOnce(async (userId, conversationId) => {
          reached();
          await held;
          return get(userId, conversationId);
        });
        const adding = addMember(app, alice, group.id, bob.id);
        await afterCommit;
        const sending = post(app, alice, group.id, 'first after add');
        release();
        await Promise.all([adding, sending]);

        await vi.waitFor(() => {
          const bodies = bobTab.received
            .filter(([name]) => name === 'message.created')
            .map(([, payload]) => (payload as { message: { body: string | null } }).message.body);
          expect(bodies).toContain('first after add');
        });
      });
    });

    it('sends nothing past their last Message to a User removed while Messages are being sent', async () => {
      await withApp({}, async (app) => {
        const alice = await signUp(app, 'Alice');
        const bob = await signUp(app, 'Bob');
        const group = await createGroup(app, alice, [bob.id]);
        const url = await listenOnRandomPort(app);
        await connectSocket(url, alice.token);
        const bobTab = await connectSocket(url, bob.token);

        await Promise.all([
          removeMember(app, alice, group.id, bob.id),
          ...Array.from({ length: 20 }, (_, i) => post(app, alice, group.id, `m${i}`)),
        ]);

        const history = await app.inject({
          method: 'GET',
          url: `/api/v1/conversations/${group.id}/messages?limit=100`,
          headers: bearer(alice),
        });
        const all = (history.json() as { messages: Array<{ kind: string; sequence: number }> })
          .messages;
        const removedAt = all.find((m) => m.kind === 'member_removed')!.sequence;
        const pushed = bobTab.received
          .filter(([name]) => name === 'message.created')
          .map(([, payload]) => (payload as { message: { sequence: number } }).message.sequence);
        for (const sequence of pushed) expect(sequence).toBeLessThan(removedAt);
      });
    });
  });
});
