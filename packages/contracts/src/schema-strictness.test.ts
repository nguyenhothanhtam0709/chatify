import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import * as contracts from './index.js';

// The rule lives in docs/conventions/contracts.md ("Strict and plain objects"). This test
// relies on that file's schema naming (`*RequestSchema`, `*QuerySchema`) and on Zod's internal
// `_zod` definitions (`def.catchall` of type `never` means strict; a defined `optin`
// ('optional', or 'defaulted' for `.default()`) means the key may be left out). It doesn't walk nested objects.

/** Strict on purpose: API tests fail if a response leaks an extra User field. */
const STRICT_OUTPUT = ['UserSearchResultSchema', 'ConversationMemberSchema'];

function isObjectSchema(value: unknown): value is z.ZodObject {
  return value instanceof z.ZodObject;
}

function isStrict(schema: z.ZodObject): boolean {
  return schema._zod.def.catchall?._zod.def.type === 'never';
}

function hasOptionalKey(schema: z.ZodObject): boolean {
  return Object.values(schema._zod.def.shape).some((field) => field._zod.optin !== undefined);
}

const objectSchemas = Object.entries(contracts).filter((entry): entry is [string, z.ZodObject] =>
  isObjectSchema(entry[1]),
);

const isInput = (name: string) => /(Request|Query)Schema$/.test(name);

const inputs = objectSchemas
  .filter(([name]) => isInput(name))
  .map(([name, schema]) => [name, hasOptionalKey(schema), schema] as const);

const others = objectSchemas.filter(([name]) => !isInput(name));

describe('schema strictness', () => {
  it('finds the schemas it checks', () => {
    expect(inputs.length).toBeGreaterThan(5);
    expect(others.length).toBeGreaterThan(10);
    expect(inputs.some(([, optional]) => optional)).toBe(true);
  });

  it.each(inputs)(
    '%s is strict only if it has an optional key (optional: %s)',
    (_name, optional, schema) => {
      expect(isStrict(schema)).toBe(optional);
    },
  );

  it.each(others)('%s is plain unless it is allowlisted', (name, schema) => {
    expect(isStrict(schema)).toBe(STRICT_OUTPUT.includes(name));
  });

  it('counts a key with a default as optional', () => {
    expect(hasOptionalKey(z.object({ a: z.number().default(1) }))).toBe(true);
    expect(hasOptionalKey(z.object({ a: z.number() }))).toBe(false);
  });

  it('allowlists only schemas that exist and are strict', () => {
    for (const name of STRICT_OUTPUT) {
      const schema = (contracts as Record<string, unknown>)[name];
      expect(isObjectSchema(schema) && isStrict(schema)).toBe(true);
    }
  });
});
