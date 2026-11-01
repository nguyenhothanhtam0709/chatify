import { z } from 'zod';
import { codePointOf } from './code-point.js';
import { UserSearchResultSchema } from './user.js';

export const MESSAGE_BODY_MAX = 4000;

/** NUL, C0 and C1 control characters, except newline, carriage return and tab. */
const isForbiddenControl = (cp: number): boolean =>
  (cp <= 0x1f && cp !== 0x09 && cp !== 0x0a && cp !== 0x0d) || (cp >= 0x7f && cp <= 0x9f);

/**
 * Plain text, 1-4000 characters (counted as characters, not UTF-16 units), not blank after
 * trimming. Parsed value is the input exactly: never trimmed, never HTML-touched (ADR-0002).
 */
export const MessageBodySchema = z.string().refine(
  (value) => {
    const chars = [...value];
    return (
      chars.length <= MESSAGE_BODY_MAX &&
      value.trim() !== '' &&
      !chars.some((char) => isForbiddenControl(codePointOf(char)))
    );
  },
  { message: `must be 1-${MESSAGE_BODY_MAX} characters of text, not blank` },
);

/** Chosen by the sender so that resending the same Message never duplicates it. */
export const ClientMessageIdSchema = z.uuid();

export const SendMessageRequestSchema = z.object({
  clientMessageId: ClientMessageIdSchema,
  body: MessageBodySchema,
});

export type SendMessageRequest = z.input<typeof SendMessageRequestSchema>;

export const SendDirectMessageRequestSchema = SendMessageRequestSchema.extend({
  recipientId: z.uuid(),
});

export type SendDirectMessageRequest = z.input<typeof SendDirectMessageRequestSchema>;

/** The kinds of Conversation; the one definition the API's SQL check and the schemas share. */
export const CONVERSATION_KINDS = ['direct', 'group'] as const;

export const ConversationKindSchema = z.enum(CONVERSATION_KINDS);

export type ConversationKind = z.infer<typeof ConversationKindSchema>;

/**
 * The kinds of System Message: Messages about a membership change. `owner_changed` is about the
 * new Owner, stored right after the "left" of the Owner who passed ownership on.
 */
export const SYSTEM_MESSAGE_KINDS = [
  'member_added',
  'member_removed',
  'member_left',
  'owner_changed',
] as const;

export type SystemMessageKind = (typeof SYSTEM_MESSAGE_KINDS)[number];

/** `text` is a Message a Member wrote; the rest are System Messages. */
export const MESSAGE_KINDS = ['text', ...SYSTEM_MESSAGE_KINDS] as const;

export const MessageKindSchema = z.enum(MESSAGE_KINDS);

export type MessageKind = z.infer<typeof MessageKindSchema>;

export const MessageSchema = z.object({
  id: z.uuid(),
  conversationId: z.uuid(),
  /** For a System Message: whoever made the change (the Owner, or the Member who left; for `owner_changed`, the Owner who left). */
  senderId: z.uuid(),
  sequence: z.number().int().positive(),
  clientMessageId: z.uuid(),
  /** Defaults to `text` when absent, so older payloads still parse. */
  kind: MessageKindSchema.default('text'),
  /** Empty for a System Message. */
  body: z.string(),
  /** For a System Message: the User it is about ("Bob was added"); absent for `text`. */
  subject: UserSearchResultSchema.optional(),
  createdAt: z.iso.datetime(),
});

export type Message = z.infer<typeof MessageSchema>;

export const ConversationSchema = z.object({
  id: z.uuid(),
  kind: z.literal('direct'),
  memberIds: z.array(z.uuid()),
});

export type Conversation = z.infer<typeof ConversationSchema>;

export const SendDirectMessageResponseSchema = z.object({
  message: MessageSchema,
  conversation: ConversationSchema,
});

export type SendDirectMessageResponse = z.infer<typeof SendDirectMessageResponseSchema>;

export const SendMessageResponseSchema = z.object({ message: MessageSchema });

export type SendMessageResponse = z.infer<typeof SendMessageResponseSchema>;

/** Sequence numbers are Postgres `integer`s. */
const SEQUENCE_MAX = 2_147_483_647;
const SequenceCursorSchema = z.coerce.number().int().positive().max(SEQUENCE_MAX);

/**
 * `GET /conversations/:id/messages`. `before=<sequence>` returns older Messages newest first;
 * `after=<sequence>` returns newer Messages oldest first (to fill a gap). Not both.
 */
export const GetMessagesQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(10),
    before: SequenceCursorSchema.optional(),
    after: SequenceCursorSchema.optional(),
  })
  .refine((q) => q.before === undefined || q.after === undefined, {
    message: 'before and after cannot be combined',
  });

export type GetMessagesQuery = z.infer<typeof GetMessagesQuerySchema>;

export const GetMessagesResponseSchema = z.object({
  messages: z.array(MessageSchema),
  hasMore: z.boolean(),
});

export type GetMessagesResponse = z.infer<typeof GetMessagesResponseSchema>;

/** A Read Marker: the sequence up to which a Member has read (0 before the first Message). */
export const ReadMarkerSchema = z.int().min(0).max(SEQUENCE_MAX);

/**
 * `PUT /conversations/:id/read`. Forward-only: the marker becomes the larger of the current
 * one and `upToSequence`, clamped to the Conversation's last sequence.
 */
export const MarkReadRequestSchema = z.object({ upToSequence: ReadMarkerSchema });

export type MarkReadRequest = z.input<typeof MarkReadRequestSchema>;

/** `PUT /conversations/:id/read`: the caller's Read Marker after the request. */
export const MarkReadResponseSchema = z.object({ upToSequence: ReadMarkerSchema });

export type MarkReadResponse = z.infer<typeof MarkReadResponseSchema>;

/** The states of a Typing Indicator signal; the one definition the request and the push share. */
export const TypingStateSchema = z.enum(['typing', 'stopped']);

export type TypingState = z.infer<typeof TypingStateSchema>;

/** `POST /conversations/:id/typing`. Relayed to the other Members, never stored. */
export const TypingRequestSchema = z.object({ state: TypingStateSchema });

export type TypingRequest = z.input<typeof TypingRequestSchema>;

/** A Member as other Members see them: never an email. */
export const ConversationMemberSchema = UserSearchResultSchema;

export type ConversationMember = z.infer<typeof ConversationMemberSchema>;

/** A Group with its Members and its single Owner. */
export const GroupSchema = z.object({
  id: z.uuid(),
  kind: z.literal('group'),
  name: z.string(),
  /** Omitted for a Former Member, who sees no Members and so not who owns the Group. */
  ownerId: z.uuid().optional(),
  /** Empty for a Former Member of the Group (see `closed` for a Group nobody is left in). */
  members: z.array(ConversationMemberSchema),
  /** Derived: true once no Member is left. A Closed Group is read-only, for ever. */
  closed: z.boolean(),
});

export type Group = z.infer<typeof GroupSchema>;

/** `GET /conversations/:id` */
export const GetConversationResponseSchema = z.object({
  conversation: z.discriminatedUnion('kind', [
    z.object({
      id: z.uuid(),
      kind: z.literal('direct'),
      members: z.array(ConversationMemberSchema),
      /**
       * The other User's Read Marker (their Read Receipt). Present only when both Users share
       * read receipts. Groups never carry it.
       */
      readUpToSequence: ReadMarkerSchema.optional(),
    }),
    GroupSchema.extend({
      /** Derived for the caller: false for a Former Member (and for a Closed Group). */
      isMember: z.boolean(),
    }),
  ]),
});

export type GetConversationResponse = z.infer<typeof GetConversationResponseSchema>;

export const LAST_MESSAGE_PREVIEW_MAX = 100;

/** The Unread Count stops counting here; the SPA shows it as "99+". */
export const UNREAD_COUNT_MAX = 100;

export const ConversationSummarySchema = z.object({
  id: z.uuid(),
  kind: ConversationKindSchema,
  /** For a Direct Conversation: the other User's Nickname, else their Username. */
  name: z.string(),
  members: z.array(ConversationMemberSchema),
  /** False for a Former Member: they can read their windows but not post. */
  isMember: z.boolean(),
  /** True for a Closed Group (no Members left); always false for a Direct Conversation. */
  closed: z.boolean(),
  /** Null until the first Message (a new Group has none). */
  lastMessage: z
    .object({
      senderId: z.uuid(),
      /** Where it sits in the Conversation: a pushed Message at or below this is already counted. */
      sequence: z.number().int().positive(),
      /** Whitespace collapsed, at most 100 characters. */
      preview: z.string().max(LAST_MESSAGE_PREVIEW_MAX),
      createdAt: z.iso.datetime(),
    })
    .nullable(),
  /**
   * Other Members' `text` Messages after the caller's Read Marker, capped at 100. Always 0 for
   * a Former Member and a Closed Group.
   */
  unreadCount: z.int().min(0).max(UNREAD_COUNT_MAX),
});

export type ConversationSummary = z.infer<typeof ConversationSummarySchema>;

/** `GET /conversations`: the caller's Conversations, most recently active first. */
export const ListConversationsResponseSchema = z.object({
  conversations: z.array(ConversationSummarySchema),
});

export type ListConversationsResponse = z.infer<typeof ListConversationsResponseSchema>;
