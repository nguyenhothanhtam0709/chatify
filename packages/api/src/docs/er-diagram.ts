import { is } from 'drizzle-orm';
import { getTableConfig, PgTable } from 'drizzle-orm/pg-core';
import { generatedDocHeader } from './generated-doc-header.js';

const GENERATOR = 'packages/api/src/docs/er-diagram.ts';
const SOURCE = 'packages/api/src/db/schema.ts';

/** Mermaid attribute types are a single word. */
const mermaidType = (sqlType: string): string =>
  sqlType === 'timestamp with time zone' ? 'timestamptz' : sqlType.replace(/\s+/g, '_');

/** Markdown with a Mermaid ER diagram of every table exported by the Drizzle schema module. */
export function renderErDiagram(schema: Record<string, unknown>): string {
  const tables = Object.values(schema)
    .filter((value): value is PgTable => is(value, PgTable))
    .map((table) => getTableConfig(table))
    .sort((a, b) => a.name.localeCompare(b.name));

  const entities: string[] = [];
  const relationships: string[] = [];

  for (const table of tables) {
    const primaryKey = new Set([
      ...table.columns.filter((c) => c.primary).map((c) => c.name),
      ...table.primaryKeys.flatMap((pk) => pk.columns.map((c) => c.name)),
    ]);
    const foreignKeys = table.foreignKeys.map((fk) => fk.reference());
    const foreignKeyColumns = new Set(foreignKeys.flatMap((fk) => fk.columns.map((c) => c.name)));

    entities.push(`  ${table.name} {`);
    for (const column of table.columns) {
      const keys = [
        primaryKey.has(column.name) ? 'PK' : '',
        foreignKeyColumns.has(column.name) ? 'FK' : '',
      ].filter(Boolean);
      const parts = [
        mermaidType(column.getSQLType()),
        column.name,
        keys.join(', '),
        column.notNull ? '' : '"nullable"',
      ].filter(Boolean);
      entities.push(`    ${parts.join(' ')}`);
    }
    entities.push('  }');

    for (const fk of foreignKeys) {
      const columns = fk.columns.map((c) => c.name);
      const oneToOne =
        primaryKey.size === columns.length && columns.every((name) => primaryKey.has(name));
      const parent = getTableConfig(fk.foreignTable).name;
      relationships.push(
        `  ${parent} ||--${oneToOne ? '||' : 'o{'} ${table.name} : "${columns.join(', ')}"`,
      );
    }
  }

  return [
    ...generatedDocHeader({ generator: GENERATOR, source: SOURCE, title: 'Database ER diagram' }),
    '```mermaid',
    'erDiagram',
    ...entities,
    ...relationships.sort(),
    '```',
    '',
  ].join('\n');
}
