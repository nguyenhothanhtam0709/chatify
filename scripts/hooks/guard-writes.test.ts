import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { canWrite, type WriteFacts } from './guard-writes.ts';
import { worktreeFixture } from './worktree-fixture.ts';

const kinds: Record<string, string> = {
  'docs/factory/overview.md': 'intent',
  'docs/architecture/http-routes.md': 'generated',
  'docs/factory/descriptive-thing.md': 'descriptive',
};
const facts = (over: Partial<WriteFacts> = {}): WriteFacts => ({
  ticket: '.scratch/00007-typing/issues/01-typing.md',
  packages: ['api'],
  writes: [],
  specStatus: false,
  browserCheck: false,
  worktree: false,
  specNumber: '00007',
  kindOf: (path) => kinds[path] ?? null,
  ...over,
});

test('an implementer with packages api may write under the API and not under web', () => {
  assert.equal(canWrite('packages/api/src/a.ts', 'implementer', facts()), null);
  assert.match(canWrite('packages/web/src/a.ts', 'implementer', facts()) ?? '', /packages\/web/);
});

test('the scripts package means scripts/**', () => {
  assert.equal(
    canWrite('scripts/hooks/a.ts', 'implementer', facts({ packages: ['scripts'] })),
    null,
  );
  assert.ok(canWrite('scripts/hooks/a.ts', 'implementer', facts()));
});

test('a path in writes is allowed and an Intent Doc not in it is denied', () => {
  const f = facts({ writes: ['.claude/settings.json'] });
  assert.equal(canWrite('.claude/settings.json', 'implementer', f), null);
  assert.ok(canWrite('docs/factory/overview.md', 'implementer', f));
  assert.ok(canWrite('.claude/settings.json', 'implementer', facts()));
});

test('its own Ticket is allowed, another Ticket and the Spec are denied', () => {
  const own = '.scratch/00007-typing/issues/01-typing.md';
  assert.equal(canWrite(own, 'implementer', facts()), null);
  assert.ok(canWrite('.scratch/00007-typing/issues/02-other.md', 'implementer', facts()));
  assert.ok(canWrite('.scratch/00007-typing/spec.md', 'implementer', facts()));
});

test('the Spec is allowed with spec-status yes, only its own', () => {
  const f = facts({ specStatus: true });
  assert.equal(canWrite('.scratch/00007-typing/spec.md', 'implementer', f), null);
  assert.ok(canWrite('.scratch/00008-other/spec.md', 'implementer', f));
});

test('Laters, Generated Docs, the lockfile and any package.json are allowed', () => {
  assert.equal(canWrite('docs/laters.md', 'implementer', facts()), null);
  assert.equal(canWrite('docs/architecture/http-routes.md', 'implementer', facts()), null);
  assert.equal(canWrite('pnpm-lock.yaml', 'implementer', facts()), null);
  assert.equal(canWrite('packages/web/package.json', 'implementer', facts()), null);
  assert.equal(canWrite('package.json', 'implementer', facts()), null);
});

test('skill-generated files, .claude and Role files are denied', () => {
  for (const path of [
    'AGENTS.md',
    '.claude/skills/x/SKILL.md',
    'docs/factory/roles/implementer.md',
  ]) {
    assert.ok(canWrite(path, 'implementer', facts()), path);
  }
});

test('Doc Sync may write a descriptive file and is denied an Intent Doc and code', () => {
  assert.equal(canWrite('docs/factory/descriptive-thing.md', 'doc-sync', facts()), null);
  assert.ok(canWrite('docs/factory/overview.md', 'doc-sync', facts()));
  assert.ok(canWrite('packages/api/src/a.ts', 'doc-sync', facts()));
  assert.ok(canWrite('docs/new-file.md', 'doc-sync', facts()));
});

test('the Explorer is denied any path in the repo and allowed one outside it', () => {
  assert.ok(canWrite('docs/x.md', 'explorer', facts()));
  assert.equal(canWrite(null, 'explorer', facts()), null);
});

test('with no agent_type, and for other types, every path is allowed', () => {
  assert.equal(canWrite('AGENTS.md', undefined, facts()), null);
  assert.equal(canWrite('AGENTS.md', 'reviewer', facts()), null);
});

const hook = (input: unknown, raw?: string) =>
  spawnSync('node', [fileURLToPath(new URL('./guard-writes.ts', import.meta.url))], {
    input: raw ?? JSON.stringify(input),
    encoding: 'utf8',
  });

test('the hook prints a deny for an out-of-scope edit by an explorer', () => {
  const out = hook({
    tool_name: 'Edit',
    tool_input: { file_path: fileURLToPath(new URL('../../AGENTS.md', import.meta.url)) },
    agent_type: 'explorer',
  });
  assert.equal(JSON.parse(out.stdout).hookSpecificOutput.permissionDecision, 'deny');
});

test('a broken input lets the call through', () => {
  const out = hook(null, 'not json');
  assert.equal(out.stdout, '');
  assert.equal(out.status, 0);
});

test('an implementer may write a Descriptive Doc that covers a file it changed, and no other', () => {
  const covering = facts({
    coveredByChange: (path) => path === 'docs/factory/descriptive-thing.md',
  });
  assert.equal(canWrite('docs/factory/descriptive-thing.md', 'implementer', covering), null);
  assert.ok(canWrite('docs/factory/descriptive-thing.md', 'implementer', facts()));
  assert.ok(canWrite('docs/factory/overview.md', 'implementer', covering));
});

test('with cwd on the Feature Branch, an edit in the agent worktree is held to its scope', () => {
  const repo = worktreeFixture();
  const edit = (path: string) =>
    hook({
      tool_name: 'Edit',
      tool_input: { file_path: join(repo.worktree, path) },
      agent_type: 'implementer',
      cwd: repo.main,
    }).stdout;
  assert.match(edit('docs/other.md'), /"permissionDecision":"deny"/);
  assert.match(edit('packages/web/new/file.ts'), /packages\/web\/new\/file\.ts is outside/);
  assert.equal(edit('scripts/a.ts'), '');
});

test('in the main checkout, a relative path resolves against cwd as before', () => {
  const repo = worktreeFixture();
  repo.git(['checkout', '-q', '-b', 'agent/00007-02-z'], repo.main);
  repo.write('.git/scope/agent/00007-02-z.txt', 'ticket: none\npackages: scripts\n', repo.main);
  const edit = (path: string) =>
    hook({
      tool_name: 'Write',
      tool_input: { file_path: path },
      agent_type: 'implementer',
      cwd: repo.main,
    }).stdout;
  assert.match(edit('docs/other.md'), /docs\/other\.md is outside/);
  assert.equal(edit('scripts/b.ts'), '');
});
