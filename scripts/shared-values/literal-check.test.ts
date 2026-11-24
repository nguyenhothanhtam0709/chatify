import assert from 'node:assert/strict';
import { test } from 'node:test';
import { baselineOf, checkAgainstBaseline, findLiterals, sharedValuesOf } from './literal-check.ts';
import { isSource } from './source-files.ts';

const contracts = {
  ErrorCode: { A: 'SOME_ERROR' },
  RealtimeEvent: { B: 'thing.happened' },
  MESSAGE_KINDS: ['text', 'joined'],
  CONVERSATION_KINDS: ['direct', 'group'],
};
const values = sharedValuesOf(contracts);
const file = (path: string, content: string) => ({ path, content });

test('values of all four sets are read from contracts, with the export they belong to', () => {
  assert.deepEqual(
    values.map(({ value, source }) => `${source}:${value}`),
    [
      'ErrorCode:SOME_ERROR',
      'RealtimeEvent:thing.happened',
      'MESSAGE_KINDS:text',
      'MESSAGE_KINDS:joined',
      'CONVERSATION_KINDS:direct',
      'CONVERSATION_KINDS:group',
    ],
  );
});

test('code that imports the values has no hits', () => {
  const clean = file('packages/web/src/a.ts', 'if (code === ErrorCode.A) {}\nconst x = "other";');
  assert.deepEqual(findLiterals([clean], values), []);
});

test('a quoted value is a hit with its file, line and contracts export', () => {
  const dirty = file('packages/api/src/a.ts', 'const a = 1;\nif (e === "SOME_ERROR") {}');
  const hits = findLiterals([dirty], values);
  assert.deepEqual(checkAgainstBaseline(hits, []), [
    'packages/api/src/a.ts:2: "SOME_ERROR" is a value of ErrorCode in contracts; import it',
  ]);
});

test('a value added to a contracts set is checked with no change to the check', () => {
  const grown = sharedValuesOf({ ...contracts, MESSAGE_KINDS: ['text', 'brand_new'] });
  const hits = findLiterals([file('packages/web/src/a.ts', "kind: 'brand_new'")], grown);
  assert.equal(hits.length, 1);
});

test('comments and the shadcn folder are not checked', () => {
  const files = [
    file('packages/api/src/a.ts', ' * a `SOME_ERROR` comes back\n// "group"'),
    file('packages/web/src/components/ui/x.tsx', 'className="group"'),
  ];
  assert.deepEqual(findLiterals(files, values), []);
});

test('a value in a trailing comment is not a hit, the same value in code is', () => {
  const content = 'const a = 1; // was "direct"\nconst b = "direct"; // why';
  const hits = findLiterals([file('packages/web/src/a.ts', content)], values);
  assert.deepEqual(
    hits.map(({ line }) => line),
    [2],
  );
});

test('an HTML input type and a pg property named text are exempt, a Message kind beside them is not', () => {
  const files = [
    file('packages/web/src/a.tsx', '<Input type="text" />'),
    file('packages/api/src/db/a.ts', "const text = readProperty(first, 'text');"),
  ];
  assert.deepEqual(findLiterals(files, values), []);
  const dirty = file('packages/web/src/b.tsx', 'kind === "text"');
  assert.equal(findLiterals([dirty], values).length, 1);
});

test('a hit in the baseline passes, even when it moves to another line', () => {
  const hits = findLiterals([file('packages/api/src/a.ts', '\n\nx("direct")')], values);
  assert.deepEqual(checkAgainstBaseline(hits, ['packages/api/src/a.ts direct']), []);
});

test('a baseline entry that no longer matches fails, so the baseline only shrinks', () => {
  assert.deepEqual(checkAgainstBaseline([], ['packages/api/src/a.ts direct']), [
    'literal-baseline.json: "packages/api/src/a.ts direct" is no longer in the code; remove it',
  ]);
});

test('the baseline is keyed by file and value, sorted and without repeats', () => {
  const hits = findLiterals(
    [file('packages/api/src/b.ts', '"text" "text"'), file('packages/api/src/a.ts', '"group"')],
    values,
  );
  assert.deepEqual(baselineOf(hits), ['packages/api/src/a.ts group', 'packages/api/src/b.ts text']);
});

test('test files and test helpers are not read', () => {
  const roots = ['packages/api/src'];
  assert.equal(isSource('packages/api/src/a.ts', roots), true);
  assert.equal(isSource('packages/api/src/a.test.ts', roots), false);
  assert.equal(isSource('packages/api/src/a.contract.ts', roots), false);
  assert.equal(isSource('packages/api/src/test/helper.ts', roots), false);
  assert.equal(isSource('packages/api/test/helper.ts', roots), false);
});
