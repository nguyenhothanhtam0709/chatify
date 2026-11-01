import { and, eq, gt, lte, sql } from 'drizzle-orm';
import type { Database } from '../db/database.module.js';
import { tokenDenyList } from '../db/schema.js';
import type { TokenDenyList } from './token-deny-list.js';

export class PostgresTokenDenyList implements TokenDenyList {
  constructor(private readonly db: Database) {}

  public async add(jti: string, expiresAt: Date): Promise<void> {
    await this.db
      .insert(tokenDenyList)
      .values({ jti, expiresAt })
      .onConflictDoUpdate({ target: tokenDenyList.jti, set: { expiresAt } });
  }

  public async isDenied(jti: string): Promise<boolean> {
    const rows = await this.db
      .select({ jti: tokenDenyList.jti })
      .from(tokenDenyList)
      .where(and(eq(tokenDenyList.jti, jti), gt(tokenDenyList.expiresAt, sql`now()`)))
      .limit(1);
    return rows.length > 0;
  }

  public async sweepExpired(): Promise<number> {
    const removed = await this.db
      .delete(tokenDenyList)
      .where(lte(tokenDenyList.expiresAt, sql`now()`))
      .returning({ jti: tokenDenyList.jti });
    return removed.length;
  }
}
