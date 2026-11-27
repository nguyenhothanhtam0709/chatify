import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkDiff, parseDiff, type Change, type DiffFacts } from './check-diff.ts';

const facts = (over: Partial<DiffFacts> = {}): DiffFacts => ({
  ticket: '.scratch/00007-typing/issues/01-typing.md',
  packages: ['scripts'],
  writes: [],
  specStatus: false,
  browserCheck: false,
  worktree: false,
  specNumber: '00007',
  kindOf: () => null,
  allowsDependencies: false,
  ...over,
});
const change = (path: string, over: Partial<Change> = {}): Change => ({
  path,
  added: ['x'],
  removed: [],
  ...over,
});
const files = (changes: Change[], over: Partial<DiffFacts> = {}, role = 'implementer') =>
  checkDiff(changes, role, facts(over)).map((v) => v.file);

test('a file outside the Writes is a violation with the reason', () => {
  const [violation] = checkDiff([change('packages/web/src/a.ts')], 'implementer', facts());
  assert.equal(violation?.file, 'packages/web/src/a.ts');
  assert.match(violation?.reason ?? '', /outside this Ticket's Writes/);
  assert.deepEqual(files([change('scripts/hooks/a.ts')]), []);
});

test('with no agent_type nothing is a violation', () => {
  assert.deepEqual(checkDiff([change('packages/web/src/a.ts')], undefined, facts()), []);
});

test('Laters: an added line passes, a removed or changed line fails', () => {
  assert.deepEqual(files([change('docs/laters.md')]), []);
  assert.deepEqual(files([change('docs/laters.md', { removed: ['old'] })]), ['docs/laters.md']);
  assert.deepEqual(
    files([change('docs/laters.md', { removed: ['old'] })], { writes: ['docs/laters.md'] }),
    [],
  );
});

test('spec.md: a Status line passes only with spec-status yes, any other line fails', () => {
  const spec = '.scratch/00007-typing/spec.md';
  const status = change(spec, {
    added: ['Status: resolved'],
    removed: ['Status: ready-for-agent'],
  });
  assert.deepEqual(files([status], { specStatus: true }), []);
  assert.deepEqual(files([status]), [spec]);
  const other = change(spec, { added: ['Status: resolved', 'more'], removed: ['Status: x'] });
  assert.deepEqual(files([other], { specStatus: true }), [spec]);
});

const pkg = (before: object, after: object): Change =>
  change('packages/api/package.json', {
    before: JSON.stringify(before),
    after: JSON.stringify(after),
  });

test('a dependency field fails with Allowed packages None and passes otherwise', () => {
  const change1 = pkg({ dependencies: { a: '1' } }, { dependencies: { a: '2' } });
  assert.deepEqual(files([change1], { packages: ['api'] }), ['packages/api/package.json']);
  assert.deepEqual(files([change1], { packages: ['api'], allowsDependencies: true }), []);
  const dev = pkg({}, { devDependencies: { b: '1' } });
  assert.deepEqual(files([dev], { packages: ['api'] }), ['packages/api/package.json']);
});

test('the lockfile fails with Allowed packages None and passes otherwise', () => {
  assert.deepEqual(files([change('pnpm-lock.yaml')]), ['pnpm-lock.yaml']);
  assert.deepEqual(files([change('pnpm-lock.yaml')], { allowsDependencies: true }), []);
});

test('a scripts change in package.json passes only when that file is in writes', () => {
  const scripts = pkg({ scripts: { a: '1' } }, { scripts: { a: '2' } });
  assert.deepEqual(files([scripts], { packages: ['api'] }), ['packages/api/package.json']);
  assert.deepEqual(
    files([scripts], { packages: ['api'], writes: ['packages/api/package.json'] }),
    [],
  );
});

test('parseDiff reads the added and removed lines of each file', () => {
  const text = [
    'diff --git a/docs/laters.md b/docs/laters.md',
    '--- a/docs/laters.md',
    '+++ b/docs/laters.md',
    '@@ -1,0 +2 @@',
    '+new line',
    '@@ -5 +6 @@',
    '-old',
    '+newer',
    'diff --git a/gone.txt b/gone.txt',
    'deleted file mode 100644',
    '--- a/gone.txt',
    '+++ /dev/null',
    '@@ -1 +0,0 @@',
    '-bye',
  ].join('\n');
  assert.deepEqual(parseDiff(text), [
    { path: 'docs/laters.md', added: ['new line', 'newer'], removed: ['old'] },
    { path: 'gone.txt', added: [], removed: ['bye'] },
  ]);
});
