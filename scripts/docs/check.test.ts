import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findBadCovers, findBrokenLinks, findMissingKinds, findOpenTickets } from './check.ts';

const doc = (path: string, content: string) => ({ path, content });

test('a relative link to a missing file is reported, with the file it is in', () => {
  const files = [doc('docs/a.md', 'See [b](b.md) and [gone](gone.md#part).')];
  const exists = (path: string) => path === 'docs/b.md';
  assert.deepEqual(findBrokenLinks(files, exists), ['docs/a.md: broken link gone.md']);
});

test('parent paths are resolved from the file that links', () => {
  const files = [doc('docs/x/a.md', '[adr](../adr/1.md)')];
  assert.deepEqual(
    findBrokenLinks(files, (path) => path === 'docs/adr/1.md'),
    [],
  );
});

test('web links, anchors and links inside code fences are not checked', () => {
  const content = '[w](https://x.dev) [m](mailto:a@b.c) [h](#here)\n```md\n[no](no.md)\n```\n';
  assert.deepEqual(
    findBrokenLinks([doc('a.md', content)], () => false),
    [],
  );
});

test('links in Specs, Tickets and installed skills are history, so they are skipped', () => {
  const files = [doc('.scratch/1/spec.md', '[x](x.md)'), doc('.agents/s.md', '[x](x.md)')];
  assert.deepEqual(
    findBrokenLinks(files, () => false),
    [],
  );
});

test('a doc without a kind is reported', () => {
  assert.deepEqual(findMissingKinds([doc('docs/a.md', '# A\n')]), [
    'docs/a.md: no kind in front matter',
  ]);
  assert.deepEqual(findMissingKinds([doc('docs/a.md', '---\nkind: other\n---\n')]), [
    'docs/a.md: no kind in front matter',
  ]);
});

test('a doc with a valid kind is fine', () => {
  assert.deepEqual(findMissingKinds([doc('docs/a.md', '---\nkind: intent\n---\n# A\n')]), []);
});

test('the docs ADR 0008 exempts need no kind', () => {
  const exempt = [
    '.scratch/1/spec.md',
    '.scratch/1/issues/01-a.md',
    'docs/adr/0001-a.md',
    'docs/laters.md',
    'AGENTS.md',
    'docs/agents/domain.md',
    'docs/workflow/git-workflow.md',
    '.agents/skills/a.md',
  ];
  assert.deepEqual(findMissingKinds(exempt.map((path) => doc(path, '# A\n'))), []);
});

test('a resolved Spec with an open Ticket is reported', () => {
  const files = [
    doc('.scratch/00001-a/spec.md', 'Status: resolved\n'),
    doc('.scratch/00001-a/issues/01-a.md', '**Status:** resolved\n'),
    doc('.scratch/00001-a/issues/02-b.md', '**Status:** wontfix\n'),
    doc('.scratch/00001-a/issues/03-c.md', '**Status:** needs-info\n'),
  ];
  assert.deepEqual(findOpenTickets(files), [
    '.scratch/00001-a/issues/03-c.md: needs-info under a resolved Spec',
  ]);
});

test('an open Spec may have open Tickets, and a folder with no Spec is not checked', () => {
  const files = [
    doc('.scratch/00001-a/spec.md', '**Status:** ready-for-agent\n'),
    doc('.scratch/00001-a/issues/01-a.md', '**Status:** ready-for-agent\n'),
    doc('.scratch/00002-b/issues/01-a.md', '**Status:** ready-for-agent\n'),
  ];
  assert.deepEqual(findOpenTickets(files), []);
});

test('covers must be a list of strings, and only on a Descriptive Doc', () => {
  const d = (path: string, kind: string, covers: string) =>
    doc(path, `---\nkind: ${kind}\ncovers: ${covers}\n---\n`);
  assert.deepEqual(findBadCovers([d('docs/a.md', 'descriptive', '[packages/api/**]')]), []);
  assert.deepEqual(findBadCovers([doc('docs/n.md', '---\nkind: descriptive\n---\n')]), []);
  assert.deepEqual(findBadCovers([d('docs/b.md', 'descriptive', 'packages/api')]), [
    'docs/b.md: covers must be a list of strings',
  ]);
  assert.deepEqual(findBadCovers([d('docs/c.md', 'intent', '[a]')]), [
    'docs/c.md: covers only belongs on a doc with kind: descriptive',
  ]);
});
