import assert from 'node:assert/strict';
import { test } from 'node:test';
import { docsNotUpdated, parseCovers } from './covers.ts';

const doc = (path: string, covers: string | null, kind = 'descriptive') => ({
  path,
  content: `---\nkind: ${kind}\n${covers === null ? '' : `covers: ${covers}\n`}---\n# T\n`,
});
const flows = doc('docs/a.md', '[packages/api/src/realtime/**]');

test('parseCovers reads an inline list, a block list, and none', () => {
  assert.deepEqual(parseCovers(doc('x', '[a/**, "b.ts"]').content), ['a/**', 'b.ts']);
  assert.deepEqual(parseCovers('---\nkind: descriptive\ncovers:\n  - a/**\n  - b.ts\n---\n'), [
    'a/**',
    'b.ts',
  ]);
  assert.equal(parseCovers(doc('x', null).content), null);
});

test('parseCovers rejects what is not a list of strings', () => {
  assert.equal(parseCovers(doc('x', 'packages/api/**').content), 'invalid');
  assert.equal(parseCovers(doc('x', '[]').content), 'invalid');
  assert.equal(parseCovers(doc('x', '[a, [b]]').content), 'invalid');
  assert.equal(parseCovers('---\nkind: descriptive\ncovers:\n  key: v\n---\n'), 'invalid');
});

test('a changed covered file with the doc unchanged lists the doc', () => {
  assert.deepEqual(docsNotUpdated(['packages/api/src/realtime/a.ts'], [flows]), ['docs/a.md']);
});

test('changing the doc itself clears it', () => {
  assert.deepEqual(docsNotUpdated(['packages/api/src/realtime/a.ts', 'docs/a.md'], [flows]), []);
});

test('a file outside the globs lists nothing', () => {
  assert.deepEqual(docsNotUpdated(['packages/web/src/a.ts'], [flows]), []);
});

test('a Descriptive Doc without covers is never listed, nor is a doc of another kind', () => {
  const files = ['packages/api/src/realtime/a.ts'];
  assert.deepEqual(docsNotUpdated(files, [doc('docs/b.md', null)]), []);
  assert.deepEqual(docsNotUpdated(files, [doc('docs/c.md', '[packages/api/**]', 'intent')]), []);
});

test('a Doc not updated line in the PR body excuses that doc only', () => {
  const other = doc('docs/b.md', '[packages/api/**]');
  const body = 'Summary\n\nDoc not updated: docs/a.md — only a rename, behaviour is the same\n';
  assert.deepEqual(docsNotUpdated(['packages/api/src/realtime/a.ts'], [flows, other], body), [
    'docs/b.md',
  ]);
});

test('an excuse with no reason, or no PR body, excuses nothing', () => {
  const files = ['packages/api/src/realtime/a.ts'];
  assert.deepEqual(docsNotUpdated(files, [flows], 'Doc not updated: docs/a.md —'), ['docs/a.md']);
  assert.deepEqual(docsNotUpdated(files, [flows], undefined), ['docs/a.md']);
});
