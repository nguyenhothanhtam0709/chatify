import type { ConversationMember, Message } from '@chat/contracts';
import { eq, sql } from 'drizzle-orm';
import type { Database } from '../db/database.module.js';
import { conversations, messages } from '../db/schema.js';

/**
 * A real transaction of the injected database, never the plain database: helpers taking it
 * rely on locks held until commit.
 */
export type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];
/** Where a rule check reads: the transaction inside the Conversation lock, the database outside it. */
export type Reader = Pick<Database, 'select'>;
export type MessageRow = typeof messages.$inferSelect;

/** The one row a query is known to return (an insert's `returning`, a row just locked). */
export const exactlyOne = <T>(rows: T[], what: string): T => {
  const [row] = rows;
  if (row === undefined) throw new Error(`Expected ${what}`);
  return row;
};

export const toMessage = (row: MessageRow, subject?: ConversationMember | null): Message => ({
  id: row.id,
  conversationId: row.conversationId,
  senderId: row.senderId,
  sequence: row.sequence,
  clientMessageId: row.clientMessageId,
  kind: row.kind,
  body: row.body,
  ...(subject ? { subject } : {}),
  createdAt: row.createdAt.toISOString(),
});

/**
 * Bumps the Conversation's counter (taking its row lock until commit) and returns the new
 * value, so sequences are strictly increasing in commit order.
 */
export async function nextSequence(tx: Tx, conversationId: string): Promise<number> {
  const counter = exactlyOne(
    await tx
      .update(conversations)
      .set({ lastSequence: sql`${conversations.lastSequence} + 1` })
      .where(eq(conversations.id, conversationId))
      .returning({ sequence: conversations.lastSequence }),
    'the Conversation counter',
  );
  return counter.sequence;
}
