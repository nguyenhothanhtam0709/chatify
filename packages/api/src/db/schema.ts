import { CONVERSATION_KINDS, MESSAGE_KINDS, MessageKindSchema } from '@chat/contracts';
import { sql, type SQL } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/** `'a', 'b'` for a SQL `in (...)` list, from the shared definition in contracts. */
const sqlList = (values: readonly string[]): SQL<unknown> =>
  sql.raw(values.map((v) => `'${v}'`).join(', '));

/** The `text` Message kind as a quoted SQL literal; a drizzle `check` cannot take a bound parameter. */
const TEXT_KIND = sqlList([MessageKindSchema.enum.text]);

/**
 * A registered person. Username and email are stored exactly as typed; the unique indexes
 * on their lowercased form make uniqueness case-insensitive.
 */
export const users = pgTable(
  'users',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    username: text('username').notNull(),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    nickname: text('nickname'),
    /** Share read receipts: on by default, reciprocal (off also hides the other User's). */
    shareReadReceipts: boolean('share_read_receipts').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('users_username_lower_unique').on(sql`lower(${t.username})`),
    uniqueIndex('users_email_lower_unique').on(sql`lower(${t.email})`),
  ],
);

/**
 * A signed-in device. The refresh token is an opaque random value; only its SHA-256 hash is
 * stored, and the hash is replaced on every rotation.
 */
export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    refreshTokenHash: text('refresh_token_hash').notNull(),
    /** The hash before the last rotation; presenting it again means the token was stolen. */
    previousRefreshTokenHash: text('previous_refresh_token_hash'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    rotatedAt: timestamp('rotated_at', { withTimezone: true }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex('sessions_refresh_token_hash_unique').on(t.refreshTokenHash),
    index('sessions_previous_refresh_token_hash_idx').on(t.previousRefreshTokenHash),
  ],
);

/**
 * Access-token IDs (`jti`) that must stop working before they expire (logout). Entries are
 * only useful until `expiresAt`, after which they are swept.
 */
export const tokenDenyList = pgTable('token_deny_list', {
  jti: text('jti').primaryKey(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

/** A container of Messages: a Direct Conversation or a Group. */
export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    kind: text('kind', { enum: CONVERSATION_KINDS }).notNull(),
    /** Sequence of the newest Message; bumped under the row lock when a Message is inserted. */
    lastSequence: integer('last_sequence').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check('conversations_kind_check', sql`${t.kind} in (${sqlList(CONVERSATION_KINDS)})`)],
);

export const conversationMembers = pgTable(
  'conversation_members',
  {
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /**
     * The Member's Read Marker: the sequence up to which they have read. Only moves forward.
     * Starts at their membership period's start; the row (and so the marker) is deleted on
     * leave or removal, so a re-added Member starts fresh.
     */
    readMarker: integer('read_marker').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.conversationId, t.userId] }),
    index('conversation_members_user_idx').on(t.userId),
  ],
);

/**
 * The normalized pair (lower ID first) of a Direct Conversation. The unique index is what
 * guarantees at most one Direct Conversation per pair, even under concurrent first sends.
 */
export const directConversations = pgTable(
  'direct_conversations',
  {
    conversationId: uuid('conversation_id')
      .primaryKey()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    lowUserId: uuid('low_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    highUserId: uuid('high_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (t) => [
    uniqueIndex('direct_conversations_pair_unique').on(t.lowUserId, t.highUserId),
    check('direct_conversations_ordered_check', sql`${t.lowUserId} < ${t.highUserId}`),
  ],
);

/** The name and the single Owner of a Group. */
export const groups = pgTable('groups', {
  conversationId: uuid('conversation_id')
    .primaryKey()
    .references(() => conversations.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  ownerId: uuid('owner_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
});

/** The `endSequence` of a period that has not ended: the largest `integer` value. */
export const OPEN_PERIOD_END = 2147483647;

/**
 * A stretch of a User's membership in a Conversation: they can read the Messages whose
 * sequence is greater than `startSequence` and at most `endSequence`. A User gets one period
 * per time they were a Member, so a Former Member who was added back has several. An open
 * period has `endSequence = OPEN_PERIOD_END` (a sentinel rather than a nullable column,
 * ADR-0005); a User has at most one open period per Conversation.
 */
export const membershipPeriods = pgTable(
  'membership_periods',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    startSequence: integer('start_sequence').notNull(),
    endSequence: integer('end_sequence').notNull().default(OPEN_PERIOD_END),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('membership_periods_conversation_user_idx').on(t.conversationId, t.userId),
    index('membership_periods_user_idx').on(t.userId),
    uniqueIndex('membership_periods_open_unique')
      .on(t.conversationId, t.userId)
      .where(sql`${t.endSequence} = ${sql.raw(String(OPEN_PERIOD_END))}`),
    check('membership_periods_range_check', sql`${t.endSequence} >= ${t.startSequence}`),
  ],
);

/**
 * Immutable once inserted. A row is either a `text` Message a Member wrote or a System Message
 * about a membership change (`member_added`, `member_removed`, `member_left`). System Messages take a
 * position in the sequence like any Message; their `senderId` is whoever made the change, their
 * body is empty, and the User they are about lives in `system_messages` (no nullable column).
 */
export const messages = pgTable(
  'messages',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    senderId: uuid('sender_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    sequence: integer('sequence').notNull(),
    /** Chosen by the sender for a `text` Message; generated by the database for a System Message. */
    clientMessageId: uuid('client_message_id')
      .notNull()
      .default(sql`gen_random_uuid()`),
    kind: text('kind', { enum: MESSAGE_KINDS }).notNull().default(MessageKindSchema.enum.text),
    body: text('body').notNull().default(''),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('messages_conversation_sequence_unique').on(t.conversationId, t.sequence),
    uniqueIndex('messages_sender_client_message_id_unique').on(t.senderId, t.clientMessageId),
    check('messages_kind_check', sql`${t.kind} in (${sqlList(MESSAGE_KINDS)})`),
    check('messages_system_message_body_check', sql`${t.kind} = ${TEXT_KIND} or ${t.body} = ''`),
    // The target of the composite foreign key from `system_messages`.
    uniqueIndex('messages_id_kind_unique').on(t.id, t.kind),
  ],
);

/**
 * The User a System Message is about. Invariant: a `messages` row has a row here iff its
 * `kind` is not `text`. The database enforces "only if": `kind` is copied from the message,
 * the composite foreign key keeps it equal to the message's kind, and the check keeps it away
 * from `text`. It also enforces that a System Message's `body` is empty (`messages_system_message_body_check`).
 * It cannot enforce "if" (every System Message has a row here): that needs a deferred
 * constraint trigger, which this project does not use, so `insertSystemMessage` in the groups
 * service, which writes both rows in one transaction, is the only guard for that direction.
 */
export const systemMessages = pgTable(
  'system_messages',
  {
    messageId: uuid('message_id').primaryKey(),
    kind: text('kind').notNull(),
    subjectId: uuid('subject_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (t) => [
    foreignKey({
      name: 'system_messages_message_kind_fk',
      columns: [t.messageId, t.kind],
      foreignColumns: [messages.id, messages.kind],
    }).onDelete('cascade'),
    check('system_messages_kind_check', sql`${t.kind} <> ${TEXT_KIND}`),
  ],
);
