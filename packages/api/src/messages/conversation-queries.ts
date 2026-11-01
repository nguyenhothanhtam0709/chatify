import { Injectable } from '@nestjs/common';
import {
  LAST_MESSAGE_PREVIEW_MAX,
  UNREAD_COUNT_MAX,
  type ConversationMember,
  type ConversationSummary,
} from '@chat/contracts';
import { and, desc, eq, exists, inArray, sql } from 'drizzle-orm';
import { InjectDrizzle } from '@nestjs/drizzle';
import type { Database } from '../db/database.module.js';
import {
  conversationMembers,
  conversations,
  groups,
  membershipPeriods,
  messages,
  users,
} from '../db/schema.js';

/** Read models of Conversations, shared by the Message and Group services. */
@Injectable()
export class ConversationQueries {
  constructor(@InjectDrizzle() private readonly db: Database) {}

  public async summaries(
    userId: string,
    onlyConversationId?: string,
  ): Promise<ConversationSummary[]> {
    // The newest Message inside one of the caller's membership periods (Former Members must
    // not see a preview of anything said after they left).
    const lastVisibleSequence = sql`(
      select max(vm.sequence) from messages vm
      join membership_periods vp on vp.conversation_id = vm.conversation_id
      where vm.conversation_id = ${conversations.id} and vp.user_id = ${userId}
        and vm.kind = 'text'
        and vm.sequence > vp.start_sequence and vm.sequence <= vp.end_sequence
    )`;
    // Other Members' `text` Messages after the caller's Read Marker, counting at most the cap.
    // A Former Member (and so every reader of a Closed Group) has no Member row, so none.
    const unreadCount = sql<number>`(
      select count(*)::int from (
        select 1 from messages um
        join conversation_members ucm
          on ucm.conversation_id = um.conversation_id and ucm.user_id = ${userId}
        where um.conversation_id = ${conversations.id}
          and um.kind = 'text' and um.sender_id <> ${userId}
          and um.sequence > ucm.read_marker
        limit ${UNREAD_COUNT_MAX}
      ) unread
    )`;
    const rows = await this.db
      .select({
        id: conversations.id,
        unreadCount,
        isMember: sql<boolean>`exists (
          select 1 from conversation_members cm
          where cm.conversation_id = ${conversations.id} and cm.user_id = ${userId}
        )`,
        kind: conversations.kind,
        groupName: groups.name,
        senderId: messages.senderId,
        sequence: messages.sequence,
        preview: sql<
          string | null
        >`left(regexp_replace(trim(${messages.body}), '\\s+', ' ', 'g'), ${LAST_MESSAGE_PREVIEW_MAX})`,
        createdAt: messages.createdAt,
      })
      .from(conversations)
      .leftJoin(groups, eq(groups.conversationId, conversations.id))
      .leftJoin(
        messages,
        and(
          eq(messages.conversationId, conversations.id),
          eq(messages.sequence, lastVisibleSequence),
        ),
      )
      .where(
        and(
          exists(
            this.db
              .select({ one: sql`1` })
              .from(membershipPeriods)
              .where(
                and(
                  eq(membershipPeriods.conversationId, conversations.id),
                  eq(membershipPeriods.userId, userId),
                ),
              ),
          ),
          onlyConversationId === undefined ? undefined : eq(conversations.id, onlyConversationId),
        ),
      )
      .orderBy(
        desc(sql`coalesce(${messages.createdAt}, ${conversations.createdAt})`),
        desc(conversations.id),
      );
    const members = await this.membersOf(rows.map((r) => r.id));
    return rows.map((row) => {
      const all = members.get(row.id) ?? [];
      let name = row.groupName;
      if (name === null) {
        const other = all.find((m) => m.id !== userId);
        if (other === undefined) {
          throw new Error(`Invariant violated: Direct Conversation ${row.id} has no other Member`);
        }
        name = other.nickname ?? other.username;
      }
      return {
        id: row.id,
        kind: row.groupName === null ? ('direct' as const) : ('group' as const),
        name,
        // A Former Member of a Group sees no Members (who joined later is not theirs to know).
        members: row.groupName !== null && !row.isMember ? [] : all,
        isMember: row.isMember,
        closed: row.groupName !== null && all.length === 0,
        lastMessage:
          row.senderId === null ||
          row.sequence === null ||
          row.preview === null ||
          row.createdAt === null
            ? null
            : {
                senderId: row.senderId,
                sequence: row.sequence,
                preview: row.preview,
                createdAt: row.createdAt.toISOString(),
              },
        unreadCount: row.unreadCount,
      };
    });
  }

  public async membersOf(conversationIds: string[]): Promise<Map<string, ConversationMember[]>> {
    const byConversation = new Map<string, ConversationMember[]>();
    if (conversationIds.length === 0) return byConversation;
    const rows = await this.db
      .select({
        conversationId: conversationMembers.conversationId,
        id: users.id,
        username: users.username,
        nickname: users.nickname,
      })
      .from(conversationMembers)
      .innerJoin(users, eq(users.id, conversationMembers.userId))
      .where(inArray(conversationMembers.conversationId, conversationIds))
      .orderBy(users.id);
    for (const { conversationId, ...member } of rows) {
      byConversation.set(conversationId, [...(byConversation.get(conversationId) ?? []), member]);
    }
    return byConversation;
  }
}
