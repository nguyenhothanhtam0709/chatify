import { describe, expect, it } from 'vitest';
import {
  ConversationSummarySchema,
  GetConversationResponseSchema,
  GetDirectConversationResponseSchema,
  GetMessagesQuerySchema,
  MarkReadRequestSchema,
  TypingRequestSchema,
  MarkReadResponseSchema,
  UNREAD_COUNT_MAX,
  MessageBodySchema,
  SendDirectMessageRequestSchema,
  SendMessageRequestSchema,
} from './message.js';

const id = '0198a2b4-7c3e-7a52-9f31-5d2f4c1e8b60';

describe('MessageBodySchema', () => {
  it.each([
    ['plain text', 'hello'],
    ['angle brackets', '<b>hi</b> a < b > c'],
    ['newlines and tabs', 'one\ntwo\r\n\tthree'],
    ['surrounding whitespace, kept as typed', '  hi  \n'],
    ['exactly 4000 characters', 'a'.repeat(4000)],
    ['4000 astral characters', '😀'.repeat(4000)],
  ])('accepts %s unchanged', (_name, body) => {
    expect(MessageBodySchema.parse(body)).toBe(body);
  });

  it.each([
    ['empty', ''],
    ['whitespace only', ' \n\t  '],
    ['4001 characters', 'a'.repeat(4001)],
    ['NUL', 'a\u0000b'],
    ['a C0 control character', 'a\u0007b'],
    ['a C1 control character', 'a\u0085b'],
  ])('rejects %s', (_name, body) => {
    expect(MessageBodySchema.safeParse(body).success).toBe(false);
  });
});

describe('send requests', () => {
  it('requires a UUID client message ID, and a recipient ID for a direct send', () => {
    const direct = { recipientId: id, clientMessageId: id, body: 'x' };
    expect(SendDirectMessageRequestSchema.safeParse(direct).success).toBe(true);
    expect(
      SendDirectMessageRequestSchema.safeParse({ ...direct, clientMessageId: 'nope' }).success,
    ).toBe(false);
    expect(SendMessageRequestSchema.safeParse({ clientMessageId: id, body: 'x' }).success).toBe(
      true,
    );
    expect(SendMessageRequestSchema.safeParse({ body: 'x' }).success).toBe(false);
  });
});

describe('GetMessagesQuerySchema', () => {
  it('defaults the limit to 10 and coerces query strings', () => {
    expect(GetMessagesQuerySchema.parse({})).toEqual({ limit: 10 });
    expect(GetMessagesQuerySchema.parse({ limit: '25', before: '7' })).toEqual({
      limit: 25,
      before: 7,
    });
  });

  it.each([
    { limit: '0' },
    { limit: '101' },
    { limit: 'x' },
    { before: '0' },
    { before: '-1' },
    { after: '0' },
    { before: '2147483648' },
    { before: '1', after: '2' },
    { befor: '5' },
    { limit: '5', extra: '1' },
  ])('rejects %j', (query) => {
    expect(GetMessagesQuerySchema.safeParse(query).success).toBe(false);
  });
});

describe('ConversationSummarySchema', () => {
  const summary = {
    id,
    kind: 'direct',
    name: 'Bob',
    members: [],
    isMember: true,
    closed: false,
    lastMessage: null,
  };

  it.each([
    [1, true],
    [0, false],
    [1.5, false],
    [undefined, false],
  ])('lastMessage with sequence %s parses: %s', (sequence, valid) => {
    const lastMessage = {
      senderId: id,
      sequence,
      preview: 'hi',
      createdAt: '2020-03-04T10:00:00.000Z',
    };
    expect(
      ConversationSummarySchema.safeParse({ ...summary, unreadCount: 0, lastMessage }).success,
    ).toBe(valid);
  });

  it('carries an Unread Count from 0 up to the cap of 100', () => {
    expect(UNREAD_COUNT_MAX).toBe(100);
    for (const unreadCount of [0, 1, 100]) {
      expect(ConversationSummarySchema.parse({ ...summary, unreadCount }).unreadCount).toBe(
        unreadCount,
      );
    }
  });

  it.each([[-1], [101], [1.5], [undefined]])('rejects an Unread Count of %j', (unreadCount) => {
    expect(ConversationSummarySchema.safeParse({ ...summary, unreadCount }).success).toBe(false);
  });
});

describe('mark-read schemas', () => {
  it.each([[0], [1], [2_147_483_647]])('accepts upToSequence %j', (upToSequence) => {
    expect(MarkReadRequestSchema.parse({ upToSequence })).toEqual({ upToSequence });
    expect(MarkReadResponseSchema.parse({ upToSequence })).toEqual({ upToSequence });
  });

  it.each([[-1], [1.5], ['3'], [2_147_483_648], [undefined], [null]])(
    'rejects upToSequence %j',
    (upToSequence) => {
      expect(MarkReadRequestSchema.safeParse({ upToSequence }).success).toBe(false);
      expect(MarkReadResponseSchema.safeParse({ upToSequence }).success).toBe(false);
    },
  );
});

describe('GetConversationResponseSchema', () => {
  const member = { id, username: 'Bob', nickname: null };
  const direct = { id, kind: 'direct', members: [member] };

  it("lets a Direct Conversation carry the other User's Read Marker, or omit it", () => {
    expect(
      GetConversationResponseSchema.parse({ conversation: { ...direct, readUpToSequence: 3 } }),
    ).toEqual({ conversation: { ...direct, readUpToSequence: 3 } });
    expect(GetConversationResponseSchema.parse({ conversation: direct })).toEqual({
      conversation: direct,
    });
  });

  it.each([[-1], [1.5], ['3'], [null]])('rejects readUpToSequence %j', (readUpToSequence) => {
    expect(
      GetConversationResponseSchema.safeParse({ conversation: { ...direct, readUpToSequence } })
        .success,
    ).toBe(false);
  });

  it('never gives a Group a readUpToSequence', () => {
    const group = {
      id,
      kind: 'group',
      name: 'Team',
      ownerId: id,
      members: [member],
      closed: false,
      isMember: true,
    };
    expect(GetConversationResponseSchema.parse({ conversation: group })).toEqual({
      conversation: group,
    });
    expect(
      GetConversationResponseSchema.parse({ conversation: { ...group, readUpToSequence: 3 } }),
    ).not.toHaveProperty('conversation.readUpToSequence');
  });
});

describe('GetDirectConversationResponseSchema', () => {
  const peer = { id, username: 'Bob', nickname: null };

  it('carries the Conversation ID when there is one, or omits it', () => {
    expect(GetDirectConversationResponseSchema.parse({ peer, conversationId: id })).toEqual({
      peer,
      conversationId: id,
    });
    expect(GetDirectConversationResponseSchema.parse({ peer })).toEqual({ peer });
  });

  it('rejects a conversationId that is not a UUID', () => {
    expect(
      GetDirectConversationResponseSchema.safeParse({ peer, conversationId: 'nope' }).success,
    ).toBe(false);
  });

  it('rejects a peer with more than the User search result fields', () => {
    expect(
      GetDirectConversationResponseSchema.safeParse({
        peer: { ...peer, email: 'bob@example.com' },
      }).success,
    ).toBe(false);
  });

  it('rejects a response without a peer', () => {
    expect(GetDirectConversationResponseSchema.safeParse({ conversationId: id }).success).toBe(
      false,
    );
  });
});

describe('TypingRequestSchema', () => {
  it.each(['typing', 'stopped'])('accepts state %s', (state) => {
    expect(TypingRequestSchema.parse({ state })).toEqual({ state });
  });

  it.each([{}, { state: 'idle' }, { state: '' }, { state: 1 }])('rejects %j', (body) => {
    expect(TypingRequestSchema.safeParse(body).success).toBe(false);
  });
});
