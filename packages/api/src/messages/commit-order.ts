import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { conversations } from '../db/schema.js';
import { KeyedSerializer, type Slot } from '../realtime/keyed-serializer.js';
import type { Tx } from './message-rows.js';

/**
 * The one place that orders what follows a commit on a Conversation. One instance serves every
 * writer of a Conversation (Message sends and membership changes), because slot order only
 * equals commit order when they all share the same serializer.
 */
@Injectable()
export class CommitOrder {
  private readonly slots = new KeyedSerializer();

  /**
   * Runs a transaction that calls `takeSlot()` right after taking the Conversation lock, then
   * `afterCommit` with its result, once every earlier change of the Conversation has finished its
   * own `afterCommit`. Room changes and pushes therefore happen in commit order: a Message is never
   * pushed between a membership commit and its room change.
   */
  public async run<R, T>(
    conversationId: string,
    transaction: (takeSlot: () => void) => Promise<R>,
    afterCommit: (result: R) => Promise<T>,
  ): Promise<T> {
    const turnHolder: { slot?: Slot } = {};
    try {
      const result = await transaction(() => {
        turnHolder.slot = this.slots.enter(conversationId);
      });
      await turnHolder.slot?.turn;
      return await afterCommit(result);
    } finally {
      turnHolder.slot?.release();
    }
  }
}

/** Serialises membership changes and Message sends on one Conversation. */
export async function lockConversation(tx: Tx, conversationId: string): Promise<void> {
  await tx.execute(
    sql`select 1 from ${conversations} where ${conversations.id} = ${conversationId} for update`,
  );
}
