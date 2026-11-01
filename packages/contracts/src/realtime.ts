import { z } from 'zod';
import {
  ConversationMemberSchema,
  ConversationSummarySchema,
  MessageSchema,
  ReadMarkerSchema,
  TypingStateSchema,
} from './message.js';

/** Server-to-client Socket.IO events. The socket is push-only (ADR-0001). */
export const RealtimeEvent = {
  MESSAGE_CREATED: 'message.created',
  CONVERSATION_CREATED: 'conversation.created',
  CONVERSATION_READ: 'conversation.read',
  CONVERSATION_RECEIPT: 'conversation.receipt',
  GROUP_MEMBER_ADDED: 'group.member_added',
  GROUP_MEMBER_REMOVED: 'group.member_removed',
  GROUP_MEMBER_LEFT: 'group.member_left',
  GROUP_OWNER_CHANGED: 'group.owner_changed',
  GROUP_CLOSED: 'group.closed',
  GROUP_MEMBERSHIP_ENDED: 'group.membership_ended',
  SESSION_REVOKED: 'session.revoked',
  TYPING_UPDATED: 'typing.updated',
} as const;

export type RealtimeEventName = (typeof RealtimeEvent)[keyof typeof RealtimeEvent];

/** Pushed to every Member, the sender's included, after the Message is saved. */
export const MessageCreatedEventSchema = z.object({ message: MessageSchema });

export type MessageCreatedEvent = z.infer<typeof MessageCreatedEventSchema>;

/** Pushed to the recipient of a new Direct Conversation, shaped as in their Conversation list. */
export const ConversationCreatedEventSchema = z.object({ conversation: ConversationSummarySchema });

export type ConversationCreatedEvent = z.infer<typeof ConversationCreatedEventSchema>;

/**
 * Pushed to every socket of the reader (their own User room) after their Read Marker moved,
 * by a mark-read or by sending. Syncs their other tabs and devices.
 */
export const ConversationReadEventSchema = z.object({
  conversationId: z.uuid(),
  upToSequence: ReadMarkerSchema,
});

export type ConversationReadEvent = z.infer<typeof ConversationReadEventSchema>;

/**
 * Pushed to the other User's sockets (their own User room) in a Direct Conversation after a
 * Member's Read Marker moved, only when both Users share read receipts. Their Read Receipt.
 */
export const ConversationReceiptEventSchema = z.object({
  conversationId: z.uuid(),
  upToSequence: ReadMarkerSchema,
});

export type ConversationReceiptEvent = z.infer<typeof ConversationReceiptEventSchema>;

/** Pushed to every current Member of a Group (the added User included) when a User is added. */
export const GroupMemberAddedEventSchema = z.object({
  conversationId: z.uuid(),
  member: ConversationMemberSchema,
});

export type GroupMemberAddedEvent = z.infer<typeof GroupMemberAddedEventSchema>;

/** Pushed to the remaining Members of a Group when the Owner removes a Member. */
export const GroupMemberRemovedEventSchema = z.object({
  conversationId: z.uuid(),
  member: ConversationMemberSchema,
});

export type GroupMemberRemovedEvent = z.infer<typeof GroupMemberRemovedEventSchema>;

/** Pushed to the remaining Members of a Group when a Member leaves. */
export const GroupMemberLeftEventSchema = z.object({
  conversationId: z.uuid(),
  member: ConversationMemberSchema,
});

export type GroupMemberLeftEvent = z.infer<typeof GroupMemberLeftEventSchema>;

/** Pushed to the remaining Members of a Group when the Owner left and ownership passed on. */
export const GroupOwnerChangedEventSchema = z.object({
  conversationId: z.uuid(),
  ownerId: z.uuid(),
});

export type GroupOwnerChangedEvent = z.infer<typeof GroupOwnerChangedEventSchema>;

/** Pushed to the last Member (the one who left) when the Group becomes a Closed Group. */
export const GroupClosedEventSchema = z.object({ conversationId: z.uuid() });

export type GroupClosedEvent = z.infer<typeof GroupClosedEventSchema>;

/**
 * Pushed to every socket of a User who was removed from a Group or left it (not to a last
 * Member whose leaving closes it: that one gets `group.closed`). The sockets have already
 * left the Group's room, so this is the last Group push they receive.
 */
export const GroupMembershipEndedEventSchema = z.object({ conversationId: z.uuid() });

export type GroupMembershipEndedEvent = z.infer<typeof GroupMembershipEndedEventSchema>;

/** Pushed to every socket of a session that was ended (logout); the server then disconnects them. */
export const SessionRevokedEventSchema = z.object({});

/**
 * Pushed to the other current Members of a Conversation (never the typist's own sockets) when
 * a Member starts or stops typing. Ephemeral: never stored, and the receiver owns the expiry.
 */
export const TypingUpdatedEventSchema = z.object({
  conversationId: z.uuid(),
  state: TypingStateSchema,
  user: ConversationMemberSchema,
});

export type TypingUpdatedEvent = z.infer<typeof TypingUpdatedEventSchema>;

export const RealtimeEventSchemas = {
  [RealtimeEvent.MESSAGE_CREATED]: MessageCreatedEventSchema,
  [RealtimeEvent.CONVERSATION_CREATED]: ConversationCreatedEventSchema,
  [RealtimeEvent.CONVERSATION_READ]: ConversationReadEventSchema,
  [RealtimeEvent.CONVERSATION_RECEIPT]: ConversationReceiptEventSchema,
  [RealtimeEvent.GROUP_MEMBER_ADDED]: GroupMemberAddedEventSchema,
  [RealtimeEvent.GROUP_MEMBER_REMOVED]: GroupMemberRemovedEventSchema,
  [RealtimeEvent.GROUP_MEMBER_LEFT]: GroupMemberLeftEventSchema,
  [RealtimeEvent.GROUP_OWNER_CHANGED]: GroupOwnerChangedEventSchema,
  [RealtimeEvent.GROUP_CLOSED]: GroupClosedEventSchema,
  [RealtimeEvent.GROUP_MEMBERSHIP_ENDED]: GroupMembershipEndedEventSchema,
  [RealtimeEvent.SESSION_REVOKED]: SessionRevokedEventSchema,
  [RealtimeEvent.TYPING_UPDATED]: TypingUpdatedEventSchema,
} as const;
