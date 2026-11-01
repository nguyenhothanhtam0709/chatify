import { Inject } from '@nestjs/common';
import {
  WebSocketGateway,
  WebSocketServer,
  type OnGatewayConnection,
  type OnGatewayInit,
} from '@nestjs/websockets';
import { RealtimeEvent, type RealtimeEventName } from '@chat/contracts';
import type { Logger } from 'pino';
import type { IoServer as Server, IoSocket as Socket } from './socket-types.js';
import { AccessTokenAuthenticator } from '../auth/access-token-authenticator.js';
import { GroupMemberships } from '../memberships/group-memberships.js';
import { PINO } from '../logging/logging.module.js';

export const userRoom = (userId: string) => `user:${userId}`;
export const conversationRoom = (conversationId: string) => `conversation:${conversationId}`;
export const sessionRoom = (sessionId: string) => `session:${sessionId}`;

/**
 * Server-push only (ADR-0001): no `@SubscribeMessage` handlers exist, so anything a client
 * emits is ignored. Authentication happens once, in the handshake; a token that expires later
 * does not close the socket.
 */
@WebSocketGateway()
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection {
  @WebSocketServer() server!: Server;

  constructor(
    private readonly authenticator: AccessTokenAuthenticator,
    private readonly memberships: GroupMemberships,
    @Inject(PINO) private readonly logger: Logger,
  ) {}

  afterInit(server: Server): void {
    server.use((socket, next) => {
      void this.authenticate(socket).then((error) => {
        next(error);
        if (!error) return;
        // Socket.IO sends the `connect_error` packet on the next tick after `next(error)`, and
        // skips it if the connection is no longer open. So close afterwards. `close()` without
        // discarding waits for the write buffer to drain, so the client still gets the error.
        // `socket.disconnect(true)` is a no-op here: the socket never connected.
        setImmediate(() => socket.client.conn.close());
      });
    });
  }

  private async authenticate(socket: Socket): Promise<Error | undefined> {
    const token: unknown = (socket.handshake.auth as { token?: unknown } | undefined)?.token;
    const result = await this.authenticator.check(typeof token === 'string' ? token : undefined);
    if (!result.ok) {
      this.logger.warn({ socketId: socket.id, code: result.code }, 'socket auth failed');
      return new Error(result.code);
    }
    try {
      // Read in the handshake so the rooms are joined before the client sees `connect`.
      const groupRooms = await this.groupRoomsOf(result.auth.userId);
      socket.data = { userId: result.auth.userId, sessionId: result.auth.sessionId, groupRooms };
    } catch (error) {
      this.logger.error({ err: error, socketId: socket.id }, 'socket group rooms lookup failed');
      return new Error('INTERNAL');
    }
    return undefined;
  }

  /** The Group rooms of the Groups the User is a current Member of. */
  private async groupRoomsOf(userId: string): Promise<string[]> {
    return (await this.memberships.groupIdsOf(userId)).map(conversationRoom);
  }

  /**
   * Join first, then check against the database, so a change that committed between the
   * handshake read and the join is not lost: leave rooms the User no longer belongs to and
   * join those they now do. Those new joins are checked once more after joining, because a
   * removal that committed between the read and the join already ran its leave. A change
   * committing after a read finds the socket already in its User room (and so in the rooms it
   * joins or leaves).
   */
  private async reconcileGroupRooms(
    socket: Socket,
    userId: string,
    joined: string[],
  ): Promise<void> {
    try {
      const current = new Set(await this.groupRoomsOf(userId));
      for (const room of joined) if (!current.has(room)) void socket.leave(room);
      const added = [...current].filter((room) => !joined.includes(room));
      if (added.length === 0) return;
      void socket.join(added);
      const stillCurrent = new Set(await this.groupRoomsOf(userId));
      for (const room of added) if (!stillCurrent.has(room)) void socket.leave(room);
    } catch (error) {
      this.logger.error({ err: error, socketId: socket.id }, 'socket group rooms recheck failed');
    }
  }

  handleConnection(socket: Socket): void {
    const { userId, sessionId, groupRooms } = socket.data as {
      userId: string;
      sessionId: string;
      groupRooms: string[];
    };
    // The User room first, so an add or removal from here on reaches this socket. The Group
    // rooms read in the handshake may be stale by now, so they are checked again below.
    void socket.join([userRoom(userId), sessionRoom(sessionId), ...groupRooms]);
    void this.reconcileGroupRooms(socket, userId, groupRooms);
    this.logger.info({ socketId: socket.id, userId, sessionId }, 'socket connected');
    socket.on('disconnect', (reason) => {
      this.logger.info({ socketId: socket.id, userId, sessionId, reason }, 'socket disconnected');
    });
  }

  /** Pushes to every socket of the given Users; logs the event, User count and Conversation. */
  push(
    event: RealtimeEventName,
    userIds: string[],
    payload: unknown,
    conversationId: string,
  ): void {
    this.server.to(userIds.map(userRoom)).emit(event, payload);
    // Typing is frequent, so it is logged at debug: a deliberate exception to "every push is info".
    const level = event === RealtimeEvent.TYPING_UPDATED ? 'debug' : 'info';
    this.logger[level]({ event, targetUsers: userIds.length, conversationId }, 'socket push');
  }

  /**
   * Pushes to every socket in the Group's room, i.e. those of its current Members, except every
   * socket of `exceptUserId` when given.
   */
  pushToGroup(
    event: RealtimeEventName,
    conversationId: string,
    payload: unknown,
    exceptUserId?: string,
  ): void {
    const room = this.server.to(conversationRoom(conversationId));
    (exceptUserId ? room.except(userRoom(exceptUserId)) : room).emit(event, payload);
    const level = event === RealtimeEvent.TYPING_UPDATED ? 'debug' : 'info';
    this.logger[level]({ event, conversationId }, 'socket push');
  }

  /** Puts every socket of the User in the Group's room (they became a Member). */
  joinGroupRoom(userId: string, conversationId: string): void {
    this.server.in(userRoom(userId)).socketsJoin(conversationRoom(conversationId));
  }

  /** Takes every socket of the User out of the Group's room (they stopped being a Member). */
  leaveGroupRoom(userId: string, conversationId: string): void {
    this.server.in(userRoom(userId)).socketsLeave(conversationRoom(conversationId));
  }

  /** Tells every socket of the session it is over, then disconnects them. Other sessions stay. */
  revokeSession(sessionId: string): void {
    const room = sessionRoom(sessionId);
    this.server.to(room).emit(RealtimeEvent.SESSION_REVOKED, {});
    this.server.in(room).disconnectSockets(true);
    this.logger.info({ event: RealtimeEvent.SESSION_REVOKED, sessionId }, 'socket session revoked');
  }
}
