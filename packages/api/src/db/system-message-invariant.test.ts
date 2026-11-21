import { Pool, type QueryResult } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, inject } from 'vitest';
import { truncateAllTables } from '../../test/database.js';

describe('system message invariant', () => {
  let pool: Pool;
  let userId: string;
  let conversationId: string;
  let sequence: number;

  beforeAll(() => {
    pool = new Pool({ connectionString: inject('databaseUrl') });
  });
  afterAll(async () => {
    await pool.end();
  });
  beforeEach(async () => {
    await truncateAllTables(inject('databaseUrl'));
    userId = (
      await pool.query(
        `insert into users (username, email, password_hash) values ('n', 'n@example.com', 'x') returning id`,
      )
    ).rows[0].id;
    conversationId = (
      await pool.query(`insert into conversations (kind) values ('group') returning id`)
    ).rows[0].id;
    sequence = 0;
  });

  const insertMessage = async (kind: string, body: string): Promise<string> =>
    (
      await pool.query(
        `insert into messages (conversation_id, sender_id, sequence, kind, body)
         values ($1, $2, $3, $4, $5) returning id`,
        [conversationId, userId, ++sequence, kind, body],
      )
    ).rows[0].id;

  const insertSystemMessage = (messageId: string, kind: string): Promise<QueryResult> =>
    pool.query(`insert into system_messages (message_id, kind, subject_id) values ($1, $2, $3)`, [
      messageId,
      kind,
      userId,
    ]);

  it('accepts a system message with an empty body and a matching system_messages row', async () => {
    const id = await insertMessage('member_added', '');
    await insertSystemMessage(id, 'member_added');
  });

  it('accepts a text message with a body', async () => {
    await insertMessage('text', 'hello');
  });

  it('rejects a system message that has a body', async () => {
    await expect(insertMessage('member_removed', 'oops')).rejects.toMatchObject({
      constraint: 'messages_system_message_body_check',
    });
  });

  it('rejects a system_messages row for a text message', async () => {
    const id = await insertMessage('text', 'hello');
    await expect(insertSystemMessage(id, 'text')).rejects.toMatchObject({
      constraint: 'system_messages_kind_check',
    });
    await expect(insertSystemMessage(id, 'member_added')).rejects.toMatchObject({
      constraint: 'system_messages_message_kind_fk',
    });
  });

  it('rejects a system_messages row whose kind differs from its message', async () => {
    const id = await insertMessage('member_left', '');
    await expect(insertSystemMessage(id, 'member_added')).rejects.toMatchObject({
      constraint: 'system_messages_message_kind_fk',
    });
  });
});
