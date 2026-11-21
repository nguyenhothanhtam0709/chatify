import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '../db/schema.js';
import { afterAll, inject } from 'vitest';
import { PostgresTokenDenyList } from './postgres-token-deny-list.js';
import {
  describeTokenDenyListContract,
  type TokenDenyListUnderTest,
} from './token-deny-list.contract.js';

const pools: Pool[] = [];
afterAll(async () => {
  await Promise.all(pools.map((pool) => pool.end()));
});

describeTokenDenyListContract('Postgres', (): Promise<TokenDenyListUnderTest> => {
  const pool = new Pool({ connectionString: inject('databaseUrl') });
  pools.push(pool);
  return Promise.resolve({
    denyList: new PostgresTokenDenyList(drizzle(pool, { schema })),
    async expire(jti): Promise<void> {
      await pool.query(
        `update token_deny_list set expires_at = now() - interval '1 second' where jti = $1`,
        [jti],
      );
    },
  });
});
