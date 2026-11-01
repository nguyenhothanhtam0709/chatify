import { eq, inArray, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';
import { hashPassword } from '../auth/password-hash.js';
import { exactlyOne, nextSequence, type Tx } from '../messages/message-rows.js';
import * as schema from './schema.js';
import {
  conversationMembers,
  conversations,
  directConversations,
  groups,
  membershipPeriods,
  messages,
  OPEN_PERIOD_END,
  systemMessages,
  users,
} from './schema.js';

export const SEED_USERNAMES = ['alice', 'bob', 'carol', 'dave', 'erin'] as const;
export const SEED_PASSWORD = 'password123';

type SeedUsername = (typeof SEED_USERNAMES)[number];

/** Local-dev data only: refuse anywhere `NODE_ENV` says production. */
export function assertNotProduction(env: Record<string, string | undefined>): void {
  if (env['NODE_ENV'] === 'production') {
    throw new Error('Refusing to seed the database when NODE_ENV=production');
  }
}

/**
 * Seeds Users, a Direct Conversation and a Group. Idempotent by skipping: when any seeded
 * Username already exists nothing is written. Everything is one transaction, so a run either
 * seeds it all or nothing. Returns whether it seeded.
 */
export async function seedDatabase(pool: Pool): Promise<boolean> {
  const db = drizzle(pool, { schema });
  const passwordHash = await hashPassword(SEED_PASSWORD);

  return db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: users.id })
      .from(users)
      .where(
        inArray(
          sql`lower(${users.username})`,
          SEED_USERNAMES.map((name) => name),
        ),
      )
      .limit(1);
    if (existing.length > 0) return false;

    const rows = await tx
      .insert(users)
      .values(
        SEED_USERNAMES.map((username) => ({
          username,
          email: `${username}@example.com`,
          passwordHash,
        })),
      )
      .returning({ id: users.id, username: users.username });
    const id = Object.fromEntries(rows.map((r) => [r.username, r.id])) as Record<
      SeedUsername,
      string
    >;

    await seedDirect(tx, id.alice, id.bob);
    await seedGroup(tx, id);
    return true;
  });
}

async function newConversation(tx: Tx, kind: 'direct' | 'group'): Promise<string> {
  return exactlyOne(
    await tx.insert(conversations).values({ kind }).returning({ id: conversations.id }),
    'the new Conversation',
  ).id;
}

async function addText(tx: Tx, conversationId: string, senderId: string, body: string) {
  await tx
    .insert(messages)
    .values({ conversationId, senderId, sequence: await nextSequence(tx, conversationId), body });
}

/** Same rows a first Direct Message creates: normalized pair, two Members, periods from 0. */
async function seedDirect(tx: Tx, a: string, b: string) {
  const [low, high] = a < b ? [a, b] : [b, a];
  const conversationId = await newConversation(tx, 'direct');
  await tx.insert(directConversations).values({ conversationId, lowUserId: low, highUserId: high });
  await tx.insert(conversationMembers).values([
    { conversationId, userId: low },
    { conversationId, userId: high },
  ]);
  await tx.insert(membershipPeriods).values([
    { conversationId, userId: low, startSequence: 0 },
    { conversationId, userId: high, startSequence: 0 },
  ]);
  await addText(tx, conversationId, a, 'Hey Bob, are you around?');
  await addText(tx, conversationId, b, 'Hi Alice! Yes, what is up?');
  await addText(tx, conversationId, a, 'Just testing the new chat app.');
}

type Ids = Record<SeedUsername, string>;

/** A System Message takes a sequence position; its subject lives in `system_messages`. */
async function addSystemMessage(
  tx: Tx,
  conversationId: string,
  actorId: string,
  subjectId: string,
  kind: 'member_added' | 'member_removed',
): Promise<number> {
  const sequence = await nextSequence(tx, conversationId);
  const row = exactlyOne(
    await tx
      .insert(messages)
      .values({ conversationId, senderId: actorId, sequence, kind })
      .returning({ id: messages.id }),
    'the new System Message',
  );
  await tx.insert(systemMessages).values({ messageId: row.id, kind, subjectId });
  return sequence;
}

/**
 * Follows what the API does: create with the initial Members (periods from 0), then the Owner
 * removes dave (his period ends at the member_removed System Message) and adds carol (her
 * period starts just before her member_added System Message, so she cannot read what came before).
 */
async function seedGroup(tx: Tx, id: Ids) {
  const conversationId = await newConversation(tx, 'group');
  await tx.insert(groups).values({ conversationId, name: 'Weekend plans', ownerId: id.alice });
  const initial = [id.alice, id.bob, id.dave];
  await tx
    .insert(conversationMembers)
    .values(initial.map((userId) => ({ conversationId, userId })));
  await tx
    .insert(membershipPeriods)
    .values(initial.map((userId) => ({ conversationId, userId, startSequence: 0 })));

  await addText(tx, conversationId, id.alice, 'Welcome to the group!');
  await addText(tx, conversationId, id.dave, 'Thanks for adding me.');
  await addText(tx, conversationId, id.bob, 'What are we doing this weekend?');

  const removedAt = await addSystemMessage(tx, conversationId, id.alice, id.dave, 'member_removed');
  await tx.delete(conversationMembers).where(eq(conversationMembers.userId, id.dave));
  await tx
    .update(membershipPeriods)
    .set({ endSequence: removedAt })
    .where(
      sql`${membershipPeriods.conversationId} = ${conversationId} and ${membershipPeriods.userId} = ${id.dave} and ${membershipPeriods.endSequence} = ${OPEN_PERIOD_END}`,
    );

  await tx.insert(conversationMembers).values({ conversationId, userId: id.carol });
  const addedAt = await addSystemMessage(tx, conversationId, id.alice, id.carol, 'member_added');
  await tx
    .insert(membershipPeriods)
    .values({ conversationId, userId: id.carol, startSequence: addedAt - 1 });

  await addText(tx, conversationId, id.carol, 'Hi everyone, glad to be here.');
  await addText(tx, conversationId, id.bob, 'Hiking on Saturday?');
  await addText(tx, conversationId, id.alice, 'Sounds good to me.');
}
