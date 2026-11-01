import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  ErrorCode,
  RealtimeEvent,
  type Conversation,
  type GetConversationResponse,
  type GetMessagesQuery,
  type GetMessagesResponse,
  type ListConversationsResponse,
  type MarkReadResponse,
  type Message,
  type SendDirectMessageRequest,
  type SendMessageRequest,
  type TypingState,
  type GroupMembershipResponse,
} from '@chat/contracts';
import { and, asc, desc, eq, exists, gt, lt, lte, ne, sql } from 'drizzle-orm';
import type { Logger } from 'pino';
import { PINO } from '../logging/logging.module.js';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';
import { DomainException } from '../common/all-exceptions.filter.js';
import { InjectDrizzle } from '@nestjs/drizzle';
import type { Database } from '../db/database.module.js';
import {
  conversationMembers,
  conversations,
  directConversations,
  groups,
  systemMessages,
  membershipPeriods,
  messages,
  users,
} from '../db/schema.js';
import { CommitOrder, lockConversation } from './commit-order.js';
import { ConversationQueries } from './conversation-queries.js';
import { conversationNotFound, requireMember, requireReader } from './conversation-rules.js';
import { nextSequence, exactlyOne, toMessage, type Tx } from './message-rows.js';

export interface SentMessage {
  message: Message;
  /** False when the client message ID had been used before and the original is returned. */
  created: boolean;
}

interface InsertedMessage {
  message: Message;
  /** Whether the send moved the sender's own Read Marker (it is pushed as `conversation.read`). */
  readMoved: boolean;
}

/** Thrown inside a transaction to undo it (including its sequence bump) on a resend. */
class DuplicateClientMessage extends Error {}

/** Direct sending, history, and the Conversation read side. Group lifecycle is `GroupsService`. */
@Injectable()
export class MessagesService {
  constructor(
    @InjectDrizzle() private readonly db: Database,
    private readonly realtime: RealtimeGateway,
    private readonly commitOrder: CommitOrder,
    private readonly queries: ConversationQueries,
    @Inject(PINO) private readonly logger: Logger,
  ) {}

  /** Sends to a User, creating the Direct Conversation with the first Message. */
  async sendDirect(
    senderId: string,
    request: SendDirectMessageRequest,
  ): Promise<SentMessage & { conversation: Conversation }> {
    const { recipientId, clientMessageId, body } = request;
    if (recipientId === senderId) {
      throw new DomainException(
        ErrorCode.CANNOT_MESSAGE_SELF,
        HttpStatus.BAD_REQUEST,
        'You cannot message yourself',
      );
    }
    const [recipient] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, recipientId));
    if (!recipient) {
      throw new DomainException(ErrorCode.USER_NOT_FOUND, HttpStatus.NOT_FOUND, 'User not found');
    }

    const original = await this.findByClientMessageId(senderId, clientMessageId);
    if (original) return this.asDirectResult(original);

    try {
      const { inserted, newConversation } = await this.db.transaction(async (tx) => {
        const direct = await this.findOrCreateDirect(tx, senderId, recipientId);
        const inserted = await this.insertMessage(tx, direct.id, senderId, {
          clientMessageId,
          body,
        });
        return { inserted, newConversation: direct.created };
      });
      await this.pushCreated(inserted, newConversation ? recipientId : undefined);
      return this.asDirectResult({ message: inserted.message, created: true });
    } catch (error) {
      if (!(error instanceof DuplicateClientMessage)) throw error;
      const raced = await this.findByClientMessageId(senderId, clientMessageId);
      if (!raced) throw error;
      return this.asDirectResult(raced);
    }
  }

  /** Sends to a Conversation the caller is a Member of. */
  async send(
    senderId: string,
    conversationId: string,
    request: SendMessageRequest,
  ): Promise<SentMessage> {
    try {
      return await this.commitOrder.run(
        conversationId,
        async (queue) => {
          return this.db.transaction(async (tx) => {
            await lockConversation(tx, conversationId);
            queue();
            await requireMember(tx, conversationId, senderId, true);
            return this.insertMessage(tx, conversationId, senderId, request);
          });
        },
        async (inserted) => {
          await this.pushCreated(inserted, undefined);
          return { message: inserted.message, created: true };
        },
      );
    } catch (error) {
      if (!(error instanceof DuplicateClientMessage)) throw error;
      const original = await this.findByClientMessageId(senderId, request.clientMessageId);
      if (!original) throw error;
      return original;
    }
  }

  /**
   * Newest first by default, or only those `before` a sequence number; with `after`, the
   * Messages following it, oldest first.
   */
  async history(
    userId: string,
    conversationId: string,
    { limit, before, after }: GetMessagesQuery,
  ): Promise<GetMessagesResponse> {
    await requireReader(this.db, conversationId, userId);
    const forward = after !== undefined;
    const rows = await this.db
      .select({
        message: messages,
        subjectId: users.id,
        subjectUsername: users.username,
        subjectNickname: users.nickname,
      })
      .from(messages)
      .leftJoin(systemMessages, eq(systemMessages.messageId, messages.id))
      .leftJoin(users, eq(users.id, systemMessages.subjectId))
      .where(
        and(
          eq(messages.conversationId, conversationId),
          exists(
            this.db
              .select({ one: sql`1` })
              .from(membershipPeriods)
              .where(
                and(
                  eq(membershipPeriods.conversationId, messages.conversationId),
                  eq(membershipPeriods.userId, userId),
                  gt(messages.sequence, membershipPeriods.startSequence),
                  lte(messages.sequence, membershipPeriods.endSequence),
                ),
              ),
          ),
          before === undefined ? undefined : lt(messages.sequence, before),
          forward ? gt(messages.sequence, after) : undefined,
        ),
      )
      .orderBy(forward ? asc(messages.sequence) : desc(messages.sequence))
      .limit(limit + 1);
    return {
      messages: rows
        .slice(0, limit)
        .map((r) =>
          toMessage(
            r.message,
            r.subjectId === null || r.subjectUsername === null
              ? null
              : { id: r.subjectId, username: r.subjectUsername, nickname: r.subjectNickname },
          ),
        ),
      hasMore: rows.length > limit,
    };
  }

  /**
   * Moves the caller's Read Marker forward to `upToSequence`, clamped to the Conversation's last
   * sequence, in one conditional update of their membership row: no Conversation lock and no
   * commit-order serializer, since no Message and no other Member is touched. A concurrent
   * removal that commits first leaves no row to match. Pushes `conversation.read` to the
   * caller's own sockets (and `conversation.receipt` to the other User of a Direct Conversation
   * when both share read receipts) only when the marker moved.
   */
  async markRead(
    userId: string,
    conversationId: string,
    upToSequence: number,
  ): Promise<MarkReadResponse> {
    const target = sql`least(${upToSequence}::integer, (select ${conversations.lastSequence} from ${conversations} where ${conversations.id} = ${conversationId}))`;
    const member = and(
      eq(conversationMembers.conversationId, conversationId),
      eq(conversationMembers.userId, userId),
    );
    const [moved] = await this.db
      .update(conversationMembers)
      .set({ readMarker: target })
      .where(and(member, lt(conversationMembers.readMarker, target)))
      .returning({ upToSequence: conversationMembers.readMarker });
    if (moved) {
      await this.pushMarkerMoved(userId, conversationId, moved.upToSequence);
      return moved;
    }
    const [unchanged] = await this.db
      .select({ upToSequence: conversationMembers.readMarker })
      .from(conversationMembers)
      .where(member);
    if (unchanged) return unchanged;
    // A Former Member, or a reader of a Closed Group: they read, but have no Read Marker.
    await requireReader(this.db, conversationId, userId);
    throw new DomainException(
      ErrorCode.NOT_A_MEMBER,
      HttpStatus.FORBIDDEN,
      'You are no longer a Member of this Conversation',
    );
  }

  /**
   * After `userId`'s Read Marker moved: `conversation.read` syncs their other tabs and devices,
   * and in a Direct Conversation where both Users share read receipts, `conversation.receipt`
   * tells the other User. The setting is read now, after the commit. Best-effort (ADR-0001),
   * like every push.
   */
  private async pushMarkerMoved(
    userId: string,
    conversationId: string,
    upToSequence: number,
  ): Promise<void> {
    const payload = { conversationId, upToSequence };
    try {
      this.realtime.push(RealtimeEvent.CONVERSATION_READ, [userId], payload, conversationId);
      const receipt = await this.sharedReceipt(userId, conversationId);
      if (!receipt) return;
      this.realtime.push(
        RealtimeEvent.CONVERSATION_RECEIPT,
        [receipt.otherId],
        payload,
        conversationId,
      );
    } catch (error) {
      this.logger.error({ err: error, conversationId }, 'socket push failed');
    }
  }

  /**
   * Relays a Typing Indicator signal to the other Members of the Conversation: the other User of a
   * Direct Conversation, or the Group room minus the typist's own sockets. Nothing is
   * stored, and there is no Conversation lock or commit-order serializer: a late signal just
   * expires on the receiver (ADR-0009). Access is the same as for sending a Message. Push is
   * best-effort, like every push.
   */
  async signalTyping(userId: string, rawConversationId: string, state: TypingState): Promise<void> {
    // The route accepts any casing of a UUID; the payload and the rooms use the canonical one.
    const conversationId = rawConversationId.toLowerCase();
    await requireMember(this.db, conversationId, userId, true);
    try {
      const [typist] = await this.db
        .select({ id: users.id, username: users.username, nickname: users.nickname })
        .from(users)
        .where(eq(users.id, userId));
      const others = await this.db
        .select({ userId: conversationMembers.userId })
        .from(conversationMembers)
        .innerJoin(
          directConversations,
          eq(directConversations.conversationId, conversationMembers.conversationId),
        )
        .where(
          and(
            eq(conversationMembers.conversationId, conversationId),
            ne(conversationMembers.userId, userId),
          ),
        );
      if (!typist) return;
      const payload = { conversationId, state, user: typist };
      if (others.length === 0) {
        const [group] = await this.db
          .select({ id: groups.conversationId })
          .from(groups)
          .where(eq(groups.conversationId, conversationId));
        if (group) {
          this.realtime.pushToGroup(RealtimeEvent.TYPING_UPDATED, conversationId, payload, userId);
        }
        return;
      }
      this.realtime.push(
        RealtimeEvent.TYPING_UPDATED,
        others.map((m) => m.userId),
        payload,
        conversationId,
      );
    } catch (error) {
      this.logger.error({ err: error, conversationId }, 'socket push failed');
    }
  }

  /** The caller's Conversations, newest last Message first. */
  async list(userId: string): Promise<ListConversationsResponse> {
    return { conversations: await this.queries.summaries(userId) };
  }

  /**
   * Pushes a saved Message to every Member (the sender's other tabs too). When the Direct
   * Conversation was just created, its recipient first gets the Conversation itself. Then, when
   * the send moved the sender's Read Marker, the sender gets `conversation.read` (and the other
   * User of a Direct Conversation `conversation.receipt`, when both share read receipts). Push is
   * best-effort (ADR-0001): a failure is logged and never fails the send.
   */
  private async pushCreated(
    { message, readMoved }: InsertedMessage,
    newConversationRecipient: string | undefined,
  ) {
    await this.pushMessage(message, newConversationRecipient);
    if (readMoved) {
      await this.pushMarkerMoved(message.senderId, message.conversationId, message.sequence);
    }
  }

  private async pushMessage(message: Message, newConversationRecipient: string | undefined) {
    try {
      const members = await this.db
        .select({ userId: conversationMembers.userId })
        .from(conversationMembers)
        .where(eq(conversationMembers.conversationId, message.conversationId));
      const [group] = await this.db
        .select({ id: groups.conversationId })
        .from(groups)
        .where(eq(groups.conversationId, message.conversationId));
      if (newConversationRecipient) {
        const conversation = exactlyOne(
          await this.queries.summaries(newConversationRecipient, message.conversationId),
          'the new Conversation summary',
        );
        this.realtime.push(
          RealtimeEvent.CONVERSATION_CREATED,
          [newConversationRecipient],
          { conversation },
          message.conversationId,
        );
      }
      if (group) {
        this.realtime.pushToGroup(RealtimeEvent.MESSAGE_CREATED, message.conversationId, {
          message,
        });
        return;
      }
      this.realtime.push(
        RealtimeEvent.MESSAGE_CREATED,
        members.map((m) => m.userId),
        { message },
        message.conversationId,
      );
    } catch (error) {
      this.logger.error(
        { err: error, conversationId: message.conversationId },
        'socket push failed',
      );
    }
  }

  async get(userId: string, conversationId: string): Promise<GetConversationResponse> {
    await requireReader(this.db, conversationId, userId);
    const members = (await this.queries.membersOf([conversationId])).get(conversationId) ?? [];
    const [group] = await this.db
      .select({ name: groups.name, ownerId: groups.ownerId })
      .from(groups)
      .where(eq(groups.conversationId, conversationId));
    if (!group) {
      const receipt = await this.sharedReceipt(userId, conversationId);
      return {
        conversation: {
          id: conversationId,
          kind: 'direct',
          members,
          ...(receipt && { readUpToSequence: receipt.readMarker }),
        },
      };
    }
    const closed = members.length === 0;
    // A Former Member sees no Members and no Owner (who joined later is not theirs to know).
    if (!members.some((m) => m.id === userId)) {
      return {
        conversation: {
          id: conversationId,
          kind: 'group',
          name: group.name,
          members: [],
          closed,
          isMember: false,
        },
      };
    }
    return {
      conversation: {
        id: conversationId,
        kind: 'group',
        ...group,
        members,
        closed,
        isMember: true,
      },
    };
  }

  /**
   * The other User of a Direct Conversation and their Read Marker, when both Users share read
   * receipts; undefined otherwise, and always for a Group.
   */
  private async sharedReceipt(
    userId: string,
    conversationId: string,
  ): Promise<{ otherId: string; readMarker: number } | undefined> {
    const both = await this.db
      .select({
        userId: conversationMembers.userId,
        readMarker: conversationMembers.readMarker,
        shares: users.shareReadReceipts,
      })
      .from(conversationMembers)
      .innerJoin(
        directConversations,
        eq(directConversations.conversationId, conversationMembers.conversationId),
      )
      .innerJoin(users, eq(users.id, conversationMembers.userId))
      .where(eq(conversationMembers.conversationId, conversationId));
    const other = both.find((m) => m.userId !== userId);
    if (!other || !both.every((m) => m.shares)) return undefined;
    return { otherId: other.userId, readMarker: other.readMarker };
  }

  /** The Group as `userId` sees it now; 404 when the Conversation is not a Group. */
  async getGroup(userId: string, groupId: string): Promise<GroupMembershipResponse> {
    const { conversation } = await this.get(userId, groupId);
    if (conversation.kind !== 'group') throw conversationNotFound();
    return { conversation };
  }

  private async findByClientMessageId(
    senderId: string,
    clientMessageId: string,
  ): Promise<SentMessage | undefined> {
    const [row] = await this.db
      .select()
      .from(messages)
      .where(and(eq(messages.senderId, senderId), eq(messages.clientMessageId, clientMessageId)));
    return row && { message: toMessage(row), created: false };
  }

  private async asDirectResult(
    sent: SentMessage,
  ): Promise<SentMessage & { conversation: Conversation }> {
    const members = await this.db
      .select({ userId: conversationMembers.userId })
      .from(conversationMembers)
      .where(eq(conversationMembers.conversationId, sent.message.conversationId));
    return {
      ...sent,
      conversation: {
        id: sent.message.conversationId,
        kind: 'direct',
        memberIds: members.map((m) => m.userId),
      },
    };
  }

  /**
   * The pair's unique index decides the winner of concurrent first sends: the loser's insert
   * waits for the winner to commit, does nothing, and the loser discards its own Conversation.
   */
  private async findOrCreateDirect(
    tx: Tx,
    a: string,
    b: string,
  ): Promise<{ id: string; created: boolean }> {
    const [low, high] = a < b ? [a, b] : [b, a];
    const pair = and(
      eq(directConversations.lowUserId, low),
      eq(directConversations.highUserId, high),
    );
    const [existing] = await tx
      .select({ id: directConversations.conversationId })
      .from(directConversations)
      .where(pair);
    if (existing) return { id: existing.id, created: false };

    const created = exactlyOne(
      await tx.insert(conversations).values({ kind: 'direct' }).returning({ id: conversations.id }),
      'the new Conversation',
    );
    const [won] = await tx
      .insert(directConversations)
      .values({ conversationId: created.id, lowUserId: low, highUserId: high })
      .onConflictDoNothing()
      .returning({ id: directConversations.conversationId });
    if (won) {
      await tx.insert(conversationMembers).values([
        { conversationId: created.id, userId: low },
        { conversationId: created.id, userId: high },
      ]);
      await tx.insert(membershipPeriods).values([
        { conversationId: created.id, userId: low, startSequence: 0 },
        { conversationId: created.id, userId: high, startSequence: 0 },
      ]);
      return { id: created.id, created: true };
    }
    await tx.delete(conversations).where(eq(conversations.id, created.id));
    const winner = exactlyOne(
      await tx
        .select({ id: directConversations.conversationId })
        .from(directConversations)
        .where(pair),
      'the winning Direct Conversation',
    );
    return { id: winner.id, created: false };
  }

  /**
   * Bumps the Conversation's counter (taking its row lock until commit) and inserts the Message
   * with the new value, so sequences are strictly increasing in commit order.
   */
  private async insertMessage(
    tx: Tx,
    conversationId: string,
    senderId: string,
    request: SendMessageRequest,
  ): Promise<InsertedMessage> {
    const [row] = await tx
      .insert(messages)
      .values({
        conversationId,
        senderId,
        sequence: await nextSequence(tx, conversationId),
        clientMessageId: request.clientMessageId,
        body: request.body,
      })
      .onConflictDoNothing({ target: [messages.senderId, messages.clientMessageId] })
      .returning();
    if (!row) throw new DuplicateClientMessage();
    // Sending reads everything up to it: the sender's own Read Marker moves to the Message.
    const moved = await tx
      .update(conversationMembers)
      .set({ readMarker: row.sequence })
      .where(
        and(
          eq(conversationMembers.conversationId, conversationId),
          eq(conversationMembers.userId, senderId),
          lt(conversationMembers.readMarker, row.sequence),
        ),
      )
      .returning({ userId: conversationMembers.userId });
    return { message: toMessage(row), readMoved: moved.length > 0 };
  }
}
