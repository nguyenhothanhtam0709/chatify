import type {
  ConversationMember,
  ConversationSummary,
  GetConversationResponse,
  User,
  UserSearchResult,
} from '@chat/contracts';

/** What a view is showing: a Direct Conversation with a peer, or an existing Group. */
export type ConversationTarget =
  | { kind: 'direct'; peer: UserSearchResult }
  /** `isMember` is false for a Former Member, who can read their windows but not post. */
  | { kind: 'group'; name: string; memberCount: number; closed: boolean; isMember: boolean };

/** The name to show for a person: their nickname, else their username. */
export const displayName = (user: { nickname: string | null; username: string }): string =>
  user.nickname ?? user.username;

/** The Group target for anything that names a Group and lists its current Members. */
export const groupTarget = (
  group: { name: string; members: ConversationMember[]; closed: boolean },
  isMember: boolean,
): Extract<ConversationTarget, { kind: 'group' }> => ({
  kind: 'group',
  name: group.name,
  memberCount: group.members.length,
  closed: group.closed,
  isMember,
});

/**
 * The target for a Conversation, from its list entry or fetched by id, or undefined for a Direct
 * one with no other User.
 */
export function targetOf(
  conversation: ConversationSummary | GetConversationResponse['conversation'],
  user: User,
): ConversationTarget | undefined {
  if (conversation.kind === 'group') return groupTarget(conversation, conversation.isMember);
  const peer = conversation.members.find((m) => m.id !== user.id);
  return peer && { kind: 'direct', peer };
}
