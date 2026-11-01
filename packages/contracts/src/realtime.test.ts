import { describe, expect, it } from 'vitest';
import {
  ConversationCreatedEventSchema,
  ConversationReadEventSchema,
  ConversationReceiptEventSchema,
  GroupMemberAddedEventSchema,
  GroupMemberRemovedEventSchema,
  SessionRevokedEventSchema,
  TypingUpdatedEventSchema,
  MessageCreatedEventSchema,
  RealtimeEvent,
  RealtimeEventSchemas,
} from './realtime.js';

const id = '0198a2b4-7c3e-7a52-9f31-5d2f4c1e8b60';
const message = {
  id,
  conversationId: id,
  senderId: id,
  sequence: 1,
  clientMessageId: id,
  body: 'hi',
  createdAt: '2030-01-01T00:00:00.000Z',
};

describe('realtime event contracts', () => {
  it('names the server-push events', () => {
    expect(RealtimeEvent).toEqual({
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
    });
    expect(Object.keys(RealtimeEventSchemas).sort()).toEqual([
      'conversation.created',
      'conversation.read',
      'conversation.receipt',
      'group.closed',
      'group.member_added',
      'group.member_left',
      'group.member_removed',
      'group.membership_ended',
      'group.owner_changed',
      'message.created',
      'session.revoked',
      'typing.updated',
    ]);
  });

  it('group.member_added and group.member_removed carry the Group and the Member', () => {
    const member = { id, username: 'Bob', nickname: null };
    for (const schema of [GroupMemberAddedEventSchema, GroupMemberRemovedEventSchema]) {
      expect(schema.safeParse({ conversationId: id, member }).success).toBe(true);
      expect(schema.safeParse({ conversationId: id }).success).toBe(false);
      expect(schema.safeParse({ member }).success).toBe(false);
    }
  });

  it('message.created carries the Message', () => {
    expect(MessageCreatedEventSchema.safeParse({ message }).success).toBe(true);
    expect(
      MessageCreatedEventSchema.safeParse({ message: { ...message, sequence: 0 } }).success,
    ).toBe(false);
    expect(MessageCreatedEventSchema.safeParse({}).success).toBe(false);
  });

  it('conversation.created carries the Conversation as the recipient sees it in the list', () => {
    const conversation = {
      id,
      kind: 'direct',
      name: 'Alice',
      members: [{ id, username: 'Alice', nickname: null }],
      isMember: true,
      closed: false,
      lastMessage: { senderId: id, sequence: 1, preview: 'hi', createdAt: message.createdAt },
      unreadCount: 1,
    };
    expect(ConversationCreatedEventSchema.safeParse({ conversation }).success).toBe(true);
    expect(ConversationCreatedEventSchema.safeParse({ conversation: { id } }).success).toBe(false);
  });

  it('conversation.read carries the Conversation and the Read Marker, no User', () => {
    expect(ConversationReadEventSchema.parse({ conversationId: id, upToSequence: 0 })).toEqual({
      conversationId: id,
      upToSequence: 0,
    });
    expect(ConversationReadEventSchema.safeParse({ conversationId: id }).success).toBe(false);
    expect(ConversationReadEventSchema.safeParse({ upToSequence: 3 }).success).toBe(false);
    expect(
      ConversationReadEventSchema.safeParse({ conversationId: id, upToSequence: -1 }).success,
    ).toBe(false);
  });

  it("conversation.receipt carries the Conversation and the other User's Read Marker, no User", () => {
    expect(ConversationReceiptEventSchema.parse({ conversationId: id, upToSequence: 4 })).toEqual({
      conversationId: id,
      upToSequence: 4,
    });
    expect(ConversationReceiptEventSchema.safeParse({ conversationId: id }).success).toBe(false);
    expect(ConversationReceiptEventSchema.safeParse({ upToSequence: 3 }).success).toBe(false);
    expect(
      ConversationReceiptEventSchema.safeParse({ conversationId: id, upToSequence: -1 }).success,
    ).toBe(false);
  });

  it('typing.updated carries the Conversation, the state and the typist', () => {
    const user = { id, username: 'Alice', nickname: null };
    for (const state of ['typing', 'stopped']) {
      expect(TypingUpdatedEventSchema.safeParse({ conversationId: id, state, user }).success).toBe(
        true,
      );
    }
    expect(
      TypingUpdatedEventSchema.safeParse({ conversationId: id, state: 'idle', user }).success,
    ).toBe(false);
    expect(
      TypingUpdatedEventSchema.safeParse({ conversationId: id, state: 'typing' }).success,
    ).toBe(false);
    expect(TypingUpdatedEventSchema.safeParse({ state: 'typing', user }).success).toBe(false);
  });

  it('session.revoked carries nothing', () => {
    expect(SessionRevokedEventSchema.safeParse({}).success).toBe(true);
  });
});
