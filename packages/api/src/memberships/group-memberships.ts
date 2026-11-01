import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { InjectDrizzle } from '@nestjs/drizzle';
import type { Database } from '../db/database.module.js';
import { conversationMembers, groups } from '../db/schema.js';

/** Who is in which Group right now, for callers that must not read the tables themselves. */
@Injectable()
export class GroupMemberships {
  constructor(@InjectDrizzle() private readonly db: Database) {}

  /** The IDs of the Groups the User is a current Member of. */
  public async groupIdsOf(userId: string): Promise<string[]> {
    const rows = await this.db
      .select({ id: conversationMembers.conversationId })
      .from(conversationMembers)
      .innerJoin(groups, eq(groups.conversationId, conversationMembers.conversationId))
      .where(eq(conversationMembers.userId, userId));
    return rows.map((row) => row.id);
  }
}
