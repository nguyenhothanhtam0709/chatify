import { HttpStatus } from '@nestjs/common';
import { ErrorCode, type ConversationMember } from '@chat/contracts';
import { and, eq } from 'drizzle-orm';
import { DomainException } from '../common/all-exceptions.filter.js';
import { conversationMembers, groups, membershipPeriods, users } from '../db/schema.js';
import type { Reader } from './message-rows.js';

/**
 * The access rules of a Conversation, each checked against a `Reader`. Pass the transaction
 * when the check must hold under the Conversation lock (take the lock first, then check).
 */

export const conversationNotFound = () =>
  new DomainException(
    ErrorCode.CONVERSATION_NOT_FOUND,
    HttpStatus.NOT_FOUND,
    'Conversation not found',
  );

/** `userIds`: the unknown Users, when more than one may be named. */
export const userNotFound = (userIds?: string[]) =>
  new DomainException(
    ErrorCode.USER_NOT_FOUND,
    HttpStatus.NOT_FOUND,
    'User not found',
    userIds && { userIds },
  );

/** The two Users of a Direct Conversation as its unique pair `[low, high]`. */
export const directPair = (a: string, b: string): [string, string] => (a < b ? [a, b] : [b, a]);

/** Anyone with a membership period, current or past, may read; else 404 (never a Member). */
export async function requireReader(
  q: Reader,
  conversationId: string,
  userId: string,
): Promise<void> {
  const [period] = await q
    .select({ id: membershipPeriods.id })
    .from(membershipPeriods)
    .where(
      and(
        eq(membershipPeriods.conversationId, conversationId),
        eq(membershipPeriods.userId, userId),
      ),
    )
    .limit(1);
  if (!period) throw conversationNotFound();
}

/** A Group with no Members left is a Closed Group: read-only, for ever. */
export async function rejectIfClosed(q: Reader, conversationId: string): Promise<void> {
  const [member] = await q
    .select({ userId: conversationMembers.userId })
    .from(conversationMembers)
    .where(eq(conversationMembers.conversationId, conversationId))
    .limit(1);
  if (!member) {
    throw new DomainException(ErrorCode.GROUP_CLOSED, HttpStatus.CONFLICT, 'This Group is closed');
  }
}

/**
 * With `forPosting`, a Former Member is told so (`NOT_A_MEMBER`); otherwise, and for a
 * never-Member, the Conversation is not found.
 */
export async function requireMember(
  q: Reader,
  conversationId: string,
  userId: string,
  forPosting = false,
): Promise<void> {
  const [member] = await q
    .select({ userId: conversationMembers.userId })
    .from(conversationMembers)
    .where(
      and(
        eq(conversationMembers.conversationId, conversationId),
        eq(conversationMembers.userId, userId),
      ),
    );
  if (member) return;
  if (forPosting) {
    await requireReader(q, conversationId, userId);
    await rejectIfClosed(q, conversationId);
    throw new DomainException(
      ErrorCode.NOT_A_MEMBER,
      HttpStatus.FORBIDDEN,
      'You are no longer a Member of this Group',
    );
  }
  throw conversationNotFound();
}

/**
 * Passes only when `callerId` is the current Owner of an open Group; throws otherwise: 404 if
 * it is not a Group or the caller was never a Member (or is a Former Member), `GROUP_CLOSED`
 * (409) if it is closed, `NOT_GROUP_OWNER` (403) if the caller is a Member but not the Owner.
 */
export async function requireOwner(q: Reader, callerId: string, groupId: string): Promise<void> {
  const [group] = await q
    .select({ ownerId: groups.ownerId })
    .from(groups)
    .where(eq(groups.conversationId, groupId));
  if (!group) throw conversationNotFound();
  await requireReader(q, groupId, callerId);
  await rejectIfClosed(q, groupId);
  await requireMember(q, groupId, callerId);
  if (group.ownerId !== callerId) {
    throw new DomainException(
      ErrorCode.NOT_GROUP_OWNER,
      HttpStatus.FORBIDDEN,
      'Only the Owner can change the Members',
    );
  }
}

/** The Group's current Owner ID; 404 when the Conversation is not a Group. */
export async function requireGroup(q: Reader, groupId: string): Promise<{ ownerId: string }> {
  const [group] = await q
    .select({ ownerId: groups.ownerId })
    .from(groups)
    .where(eq(groups.conversationId, groupId));
  if (!group) throw conversationNotFound();
  return group;
}

export async function findMember(
  q: Reader,
  userId: string,
): Promise<ConversationMember | undefined> {
  const [row] = await q
    .select({ id: users.id, username: users.username, nickname: users.nickname })
    .from(users)
    .where(eq(users.id, userId));
  return row;
}
