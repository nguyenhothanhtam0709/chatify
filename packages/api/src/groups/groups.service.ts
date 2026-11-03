import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import {
  ErrorCode,
  GROUP_MEMBERS_MAX,
  RealtimeEvent,
  type ConversationMember,
  type CreateGroupRequest,
  type CreateGroupResponse,
  type GroupMembershipResponse,
  type Message,
  type SystemMessageKind,
} from '@chat/contracts';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { Logger } from 'pino';
import { DomainException } from '../common/all-exceptions.filter.js';
import type { Database } from '../db/database.module.js';
import {
  conversationMembers,
  conversations,
  groups,
  systemMessages,
  membershipPeriods,
  messages,
  OPEN_PERIOD_END,
  users,
} from '../db/schema.js';
import { PINO } from '../logging/logging.module.js';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';
import { CommitOrder, lockConversation } from '../messages/commit-order.js';
import { ConversationQueries } from '../messages/conversation-queries.js';
import {
  conversationNotFound,
  findMember,
  rejectIfClosed,
  requireGroup,
  requireMember,
  requireOwner,
  requireReader,
  userNotFound,
} from '../messages/conversation-rules.js';
import { MessagesService } from '../messages/messages.service.js';
import { exactlyOne } from '../db/exactly-one.js';
import { nextSequence, toMessage, type Tx } from '../messages/message-rows.js';

/** What leaving did, for the pushes that follow the commit. */
type LeaveOutcome =
  | {
      kind: 'closed';
      systemMessage: Message;
      /** Everyone who was ever a Member, who all hear of the closing. */
      notify: string[];
    }
  | {
      kind: 'open';
      systemMessage: Message;
      /** Set when the leaver was the Owner: "<new Owner> is now the Owner". */
      ownerChange: { newOwnerId: string; systemMessage: Message } | undefined;
    };

/**
 * Group lifecycle: create, add, remove, leave. Add, remove and leave share one shape: lock the
 * Conversation, take a commit-order slot, check every rule under the lock, change membership,
 * write the System Message and the period, commit; then, in commit order, change rooms and push.
 */
@Injectable()
export class GroupsService {
  constructor(
    @InjectDrizzle() private readonly db: Database,
    private readonly realtime: RealtimeGateway,
    private readonly commitOrder: CommitOrder,
    private readonly queries: ConversationQueries,
    private readonly messagesService: MessagesService,
    @Inject(PINO) private readonly logger: Logger,
  ) {}

  /**
   * Creates a Group owned by `ownerId`, with the Owner and the distinct initial Members as
   * Members, and pushes the new Conversation to each of them. Push is best-effort (ADR-0001).
   */
  public async create(ownerId: string, request: CreateGroupRequest): Promise<CreateGroupResponse> {
    const name = request.name.trim();
    const memberIds = [...new Set([ownerId, ...request.memberIds])];
    if (memberIds.length > GROUP_MEMBERS_MAX) throw groupFull();
    const found = await this.db
      .select({ id: users.id })
      .from(users)
      .where(inArray(users.id, memberIds));
    const known = new Set(found.map((u) => u.id));
    const unknown = memberIds.filter((id) => !known.has(id));
    if (unknown.length > 0) {
      throw userNotFound(unknown);
    }

    const id = await this.db.transaction(async (tx) => {
      const created = exactlyOne(
        await tx
          .insert(conversations)
          .values({ kind: 'group' })
          .returning({ id: conversations.id }),
        'the new Conversation',
      );
      await tx.insert(groups).values({ conversationId: created.id, name, ownerId });
      // Every period, and so every Read Marker, starts at the Group's start.
      await tx
        .insert(conversationMembers)
        .values(memberIds.map((userId) => ({ conversationId: created.id, userId, readMarker: 0 })));
      await tx.insert(membershipPeriods).values(
        memberIds.map((userId) => ({
          conversationId: created.id,
          userId,
          startSequence: 0,
        })),
      );
      return created.id;
    });

    const members = (await this.queries.membersOf([id])).get(id) ?? [];
    await this.pushSafely(id, async () => {
      for (const userId of memberIds) this.realtime.joinGroupRoom(userId, id);
      const [conversation] = await this.queries.summaries(ownerId, id);
      this.realtime.push(RealtimeEvent.CONVERSATION_CREATED, memberIds, { conversation }, id);
    });
    return { conversation: { id, kind: 'group', name, ownerId, members, closed: false } };
  }

  /**
   * The Owner adds a User, who is a Member at once. The Conversation row is locked so that the
   * 256-Member cap holds under concurrent adds. Pushes are best-effort (ADR-0001).
   */
  public addMember(
    callerId: string,
    groupId: string,
    userId: string,
  ): Promise<GroupMembershipResponse> {
    return this.changeMembership(
      groupId,
      async (tx) => {
        await requireOwner(tx, callerId, groupId);
        const member = await findMember(tx, userId);
        if (!member) {
          throw userNotFound();
        }
        const current = await tx
          .select({ userId: conversationMembers.userId })
          .from(conversationMembers)
          .where(eq(conversationMembers.conversationId, groupId));
        if (current.some((m) => m.userId === userId)) {
          throw new DomainException(
            ErrorCode.ALREADY_A_MEMBER,
            HttpStatus.CONFLICT,
            'Already a Member of this Group',
          );
        }
        if (current.length >= GROUP_MEMBERS_MAX) throw groupFull();
        const systemMessage = await insertSystemMessage(
          tx,
          groupId,
          callerId,
          member,
          'member_added',
        );
        // Messages up to now stay out of reach; the new period starts just before its own System
        // Message, and so does the Read Marker (nothing from before joining is unread).
        const startSequence = systemMessage.sequence - 1;
        await tx
          .insert(conversationMembers)
          .values({ conversationId: groupId, userId, readMarker: startSequence });
        await tx
          .insert(membershipPeriods)
          .values({ conversationId: groupId, userId, startSequence });
        return { systemMessage, member };
      },
      async ({ systemMessage, member }) => {
        // The room join comes before any read that can throw, as in remove and leave.
        await this.pushSafely(groupId, () => {
          this.realtime.joinGroupRoom(userId, groupId);
        });
        const response = await this.messagesService.getGroup(callerId, groupId);
        await this.pushSafely(groupId, async () => {
          const [summary] = await this.queries.summaries(userId, groupId);
          this.realtime.push(
            RealtimeEvent.CONVERSATION_CREATED,
            [userId],
            { conversation: summary },
            groupId,
          );
          this.realtime.pushToGroup(RealtimeEvent.GROUP_MEMBER_ADDED, groupId, {
            conversationId: groupId,
            member,
          });
          this.realtime.pushToGroup(RealtimeEvent.MESSAGE_CREATED, groupId, {
            message: systemMessage,
          });
        });
        return response;
      },
    );
  }

  /** The Owner removes a Member (never themselves). The removed User gets no more pushes. */
  public removeMember(
    callerId: string,
    groupId: string,
    userId: string,
  ): Promise<GroupMembershipResponse> {
    return this.changeMembership(
      groupId,
      async (tx) => {
        await requireOwner(tx, callerId, groupId);
        if (userId === callerId) {
          throw new DomainException(
            ErrorCode.OWNER_CANNOT_BE_REMOVED,
            HttpStatus.CONFLICT,
            'The Owner cannot be removed from their Group',
          );
        }
        const member = await findMember(tx, userId);
        const wasMember = await dropMember(tx, groupId, userId);
        if (!wasMember || !member) return undefined;
        const systemMessage = await insertSystemMessage(
          tx,
          groupId,
          callerId,
          member,
          'member_removed',
        );
        await endPeriod(tx, groupId, userId, systemMessage.sequence);
        return { removed: systemMessage, member };
      },
      async (outcome) => {
        if (!outcome) {
          throw new DomainException(
            ErrorCode.NOT_A_MEMBER,
            HttpStatus.FORBIDDEN,
            'That User is not a Member of this Group',
          );
        }
        const { removed, member } = outcome;
        // The removed User's sockets leave the room first, so they only get the ended event.
        await this.pushSafely(groupId, () => {
          this.realtime.leaveGroupRoom(userId, groupId);
        });
        const response = await this.messagesService.getGroup(callerId, groupId);
        await this.pushSafely(groupId, () => {
          this.pushMembershipEnd(groupId, RealtimeEvent.GROUP_MEMBER_REMOVED, {
            member,
            systemMessage: removed,
            endedUserId: userId,
          });
        });
        return response;
      },
    );
  }

  /**
   * A Member leaves; their period ends at the newest Message. If they were the Owner,
   * ownership passes to the Member whose current period began first (ties: lowest User ID).
   * If they were the last Member, the Group is closed. Pushes are best-effort (ADR-0001).
   */
  public leave(callerId: string, groupId: string): Promise<GroupMembershipResponse> {
    return this.changeMembership(
      groupId,
      async (tx) => {
        const group = await requireGroup(tx, groupId);
        await requireReader(tx, groupId, callerId);
        await rejectIfClosed(tx, groupId);
        await requireMember(tx, groupId, callerId, true);
        const leaver = await findMember(tx, callerId);
        if (!leaver) throw new Error('Expected the leaving Member to exist');
        if (!(await dropMember(tx, groupId, callerId))) throw conversationNotFound();
        const systemMessage = await insertSystemMessage(
          tx,
          groupId,
          callerId,
          leaver,
          'member_left',
        );
        await endPeriod(tx, groupId, callerId, systemMessage.sequence);
        const successor = await successorOwner(tx, groupId);
        let outcome: LeaveOutcome;
        if (!successor) {
          outcome = { kind: 'closed', systemMessage, notify: await everMembers(tx, groupId) };
        } else if (group.ownerId !== callerId) {
          outcome = { kind: 'open', systemMessage, ownerChange: undefined };
        } else {
          await tx
            .update(groups)
            .set({ ownerId: successor })
            .where(eq(groups.conversationId, groupId));
          const newOwner = await findMember(tx, successor);
          if (!newOwner) throw new Error('Expected the new Owner to exist');
          const ownerMessage = await insertSystemMessage(
            tx,
            groupId,
            callerId,
            newOwner,
            'owner_changed',
          );
          outcome = {
            kind: 'open',
            systemMessage,
            ownerChange: { newOwnerId: successor, systemMessage: ownerMessage },
          };
        }
        return { leaver, outcome };
      },
      async ({ leaver, outcome }) => {
        await this.pushSafely(groupId, () => {
          this.realtime.leaveGroupRoom(callerId, groupId);
        });
        const response = await this.messagesService.getGroup(callerId, groupId);
        await this.pushSafely(groupId, () => {
          if (outcome.kind === 'closed') {
            // Former Members are no longer in the Group room, so this goes to their User rooms.
            this.realtime.push(
              RealtimeEvent.GROUP_CLOSED,
              outcome.notify,
              { conversationId: groupId },
              groupId,
            );
            return;
          }
          this.pushMembershipEnd(groupId, RealtimeEvent.GROUP_MEMBER_LEFT, {
            member: leaver,
            systemMessage: outcome.systemMessage,
            endedUserId: callerId,
            ownerChange: outcome.ownerChange,
          });
        });
        return response;
      },
    );
  }

  /**
   * The shared shape of a membership change. The lock comes first, then the commit-order slot,
   * then `applyChange` checks every rule against what is true now (so a concurrent change cannot
   * slip past it); `afterCommit` runs once every earlier change of the Group has finished its own.
   */
  private changeMembership<R>(
    groupId: string,
    applyChange: (tx: Tx) => Promise<R>,
    afterCommit: (result: R) => Promise<GroupMembershipResponse>,
  ): Promise<GroupMembershipResponse> {
    return this.commitOrder.run(
      groupId,
      (takeSlot) =>
        this.db.transaction(async (tx) => {
          await lockConversation(tx, groupId);
          takeSlot();
          return applyChange(tx);
        }),
      afterCommit,
    );
  }

  /**
   * The pushes that follow a Member's membership ending, in order: the member event, the System
   * Message, the new Owner's System Message and event (when ownership passed), and last the ended event to the User it ended for.
   */
  private pushMembershipEnd(
    groupId: string,
    event: typeof RealtimeEvent.GROUP_MEMBER_REMOVED | typeof RealtimeEvent.GROUP_MEMBER_LEFT,
    ended: {
      member: ConversationMember;
      systemMessage: Message;
      endedUserId: string;
      ownerChange?: { newOwnerId: string; systemMessage: Message } | undefined;
    },
  ): void {
    this.realtime.pushToGroup(event, groupId, { conversationId: groupId, member: ended.member });
    this.realtime.pushToGroup(RealtimeEvent.MESSAGE_CREATED, groupId, {
      message: ended.systemMessage,
    });
    if (ended.ownerChange) {
      this.realtime.pushToGroup(RealtimeEvent.MESSAGE_CREATED, groupId, {
        message: ended.ownerChange.systemMessage,
      });
      this.realtime.pushToGroup(RealtimeEvent.GROUP_OWNER_CHANGED, groupId, {
        conversationId: groupId,
        ownerId: ended.ownerChange.newOwnerId,
      });
    }
    this.realtime.push(
      RealtimeEvent.GROUP_MEMBERSHIP_ENDED,
      [ended.endedUserId],
      { conversationId: groupId },
      groupId,
    );
  }

  /** Pushes are best-effort (ADR-0001): a failure is logged, never surfaced. */
  private async pushSafely(groupId: string, push: () => void | Promise<void>): Promise<void> {
    try {
      await push();
    } catch (error) {
      this.logger.error({ err: error, conversationId: groupId }, 'socket push failed');
    }
  }
}

const groupFull = () =>
  new DomainException(
    ErrorCode.GROUP_FULL,
    HttpStatus.CONFLICT,
    `A Group has at most ${GROUP_MEMBERS_MAX} Members`,
  );

/** Deletes the User's current membership; false when they were not a Member. */
async function dropMember(tx: Tx, groupId: string, userId: string): Promise<boolean> {
  const deleted = await tx
    .delete(conversationMembers)
    .where(
      and(eq(conversationMembers.conversationId, groupId), eq(conversationMembers.userId, userId)),
    )
    .returning({ userId: conversationMembers.userId });
  return deleted.length > 0;
}

/** Ends the User's open period at the System Message that ended their membership. */
async function endPeriod(tx: Tx, groupId: string, userId: string, endSequence: number) {
  await tx
    .update(membershipPeriods)
    .set({ endSequence })
    .where(
      and(
        eq(membershipPeriods.conversationId, groupId),
        eq(membershipPeriods.userId, userId),
        eq(membershipPeriods.endSequence, OPEN_PERIOD_END),
      ),
    );
}

/** Every User who has a membership period in the Group, current or former (at most 256). */
async function everMembers(tx: Tx, groupId: string): Promise<string[]> {
  const rows = await tx
    .selectDistinct({ userId: membershipPeriods.userId })
    .from(membershipPeriods)
    .where(eq(membershipPeriods.conversationId, groupId));
  return rows.map((r) => r.userId);
}

/** The Member whose open period began first (ties: lowest User ID), if any is left. */
async function successorOwner(tx: Tx, groupId: string): Promise<string | undefined> {
  const [successor] = await tx
    .select({ userId: membershipPeriods.userId })
    .from(membershipPeriods)
    .where(
      and(
        eq(membershipPeriods.conversationId, groupId),
        eq(membershipPeriods.endSequence, OPEN_PERIOD_END),
      ),
    )
    .orderBy(asc(membershipPeriods.createdAt), asc(membershipPeriods.userId))
    .limit(1);
  return successor?.userId;
}

/**
 * Inserts a System Message at the next position of the Conversation's sequence, inside the
 * caller's transaction (the Conversation row must be locked). `actorId` made the change,
 * `subject` is who it is about.
 */
async function insertSystemMessage(
  tx: Tx,
  conversationId: string,
  actorId: string,
  subject: ConversationMember,
  kind: SystemMessageKind,
): Promise<Message> {
  const row = exactlyOne(
    await tx
      .insert(messages)
      .values({
        conversationId,
        senderId: actorId,
        sequence: await nextSequence(tx, conversationId),
        kind,
      })
      .returning(),
    'the new System Message',
  );
  await tx.insert(systemMessages).values({ messageId: row.id, kind, subjectId: subject.id });
  return toMessage(row, subject);
}
