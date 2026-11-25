import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { decide, type ReadContext } from './guard-reads.ts';

const repo = '/repo';
const noScope: ReadContext = { roots: [repo], cwd: repo, branch: 'main', scope: null };
const scoped: ReadContext = {
  roots: [repo],
  cwd: repo,
  branch: 'agent/00007-01-typing',
  scope: ['packages: api'],
};
const withFacts = (...scope: string[]): ReadContext => ({ ...scoped, scope });
const read = (path: string, limit?: number, agentType?: string) => ({
  tool_name: 'Read',
  tool_input: { file_path: `${repo}/${path}`, limit },
  ...(agentType === undefined ? {} : { agent_type: agentType }),
});
const bash = (command: string) => ({ tool_name: 'Bash', tool_input: { command } });

test('a whole read of an always-guarded file is denied on any branch', () => {
  assert.match(decide(read('docs/laters.md'), noScope) ?? '', /docs\/laters\.md/);
  assert.ok(decide(read('pnpm-lock.yaml'), noScope));
  assert.ok(decide(read('packages/api/drizzle/meta/0001_snapshot.json'), noScope));
  assert.ok(decide(read('docs/laters.md', 500), noScope));
  assert.match(decide(read('docs/laters.md'), noScope) ?? '', /cat >>/);
  assert.doesNotMatch(decide(read('pnpm-lock.yaml'), noScope) ?? '', /cat >>/);
});

test('a short read of an always-guarded file is allowed', () => {
  assert.equal(decide(read('docs/laters.md', 40), noScope), null);
});

test('without a scope file only the always-guarded files are denied', () => {
  assert.equal(decide(read('docs/factory/overview.md'), noScope), null);
  assert.equal(decide(read('.scratch/00007-live-signals/spec.md'), noScope), null);
});

test('with a scope, docs outside it are denied and the reason says how to read a section', () => {
  const reason = decide(read('docs/factory/overview.md'), scoped);
  assert.match(reason ?? '', /grep -n/);
  assert.match(reason ?? '', /PR body/);
  assert.ok(decide(read('.scratch/00007-live-signals/spec.md'), scoped));
  assert.ok(decide(read('packages/web/AGENTS.md'), scoped));
  assert.ok(decide(read('GLOSSARY.md'), scoped));
  assert.ok(decide(read('README.md'), scoped));
});

test('with a scope, listed docs, always-allowed docs and the ticket are allowed', () => {
  assert.equal(decide(read('packages/api/AGENTS.md'), scoped), null);
  assert.equal(decide(read('docs/conventions/api.md'), scoped), null);
  assert.equal(decide(read('docs/conventions/general.md'), scoped), null);
  assert.equal(decide(read('docs/workflow/definition-of-done.md'), scoped), null);
  assert.equal(decide(read('docs/workflow/git-workflow.md'), scoped), null);
  assert.equal(
    decide(read('.scratch/00007-live-signals/issues/01-typing-in-direct-conversations.md'), scoped),
    null,
  );
  assert.ok(decide(read('.scratch/00007-live-signals/issues/02-typing-in-groups.md'), scoped));
});

test('the packages fact allows the AGENTS.md and convention of each named package', () => {
  assert.ok(decide(read('packages/web/AGENTS.md'), scoped));
  assert.ok(decide(read('docs/conventions/web.md'), scoped));
  const two = withFacts('packages: api contracts');
  assert.equal(decide(read('packages/contracts/AGENTS.md'), two), null);
  assert.equal(decide(read('docs/conventions/contracts.md'), two), null);
  assert.ok(decide(read('docs/conventions/web.md'), two));
  const none = withFacts('browser-check: no');
  assert.ok(decide(read('packages/api/AGENTS.md'), none));
  assert.ok(decide(read('docs/conventions/api.md'), none));
});

test('the browser-check and worktree facts allow their doc only when yes', () => {
  for (const [fact, doc] of [
    ['browser-check', 'docs/workflow/browser-check.md'],
    ['worktree', 'docs/workflow/worktree.md'],
  ] as const) {
    assert.equal(decide(read(doc), withFacts(`${fact}: yes`)), null);
    assert.ok(decide(read(doc), withFacts(`${fact}: no`)));
    assert.ok(decide(read(doc), scoped));
  }
});

test('a scope file in the old glob format reads as no facts', () => {
  const old = withFacts('packages/api/AGENTS.md', 'docs/conventions/*.md');
  assert.ok(decide(read('packages/api/AGENTS.md'), old));
  assert.ok(decide(read('docs/conventions/api.md'), old));
  assert.equal(decide(read('docs/workflow/testing-policy.md'), old), null);
});

test('a sub-agent can always read its own Role file whole, and no other', () => {
  const implementer = 'docs/factory/roles/implementer.md';
  const reviewer = 'docs/factory/roles/reviewer.md';
  assert.equal(decide(read(implementer, undefined, 'implementer'), scoped), null);
  assert.ok(decide(read(reviewer, undefined, 'implementer'), scoped));
  assert.ok(decide(read(implementer), scoped));
  assert.ok(decide(read(implementer, undefined, '../../README'), scoped));
  assert.equal(decide(read(reviewer, undefined, 'reviewer'), noScope), null);
});

test('a Role file name cannot unlock an always-guarded file', () => {
  assert.ok(decide(read('docs/laters.md', undefined, '../../laters'), scoped));
  assert.ok(decide(read('docs/laters.md', undefined, '../../laters'), noScope));
  assert.ok(decide(read('pnpm-lock.yaml', undefined, '../../../pnpm-lock'), scoped));
  assert.ok(decide(read('docs/factory/roles/reviewer.md', undefined, '*'), scoped));
  assert.ok(decide(read('docs/factory/roles/reviewer.md', undefined, '**'), scoped));
});

test('a short read outside the scope is allowed', () => {
  assert.equal(decide(read('.scratch/00007-live-signals/spec.md', 80), scoped), null);
  assert.ok(decide(read('.scratch/00007-live-signals/spec.md', 81), scoped));
});

test('source code and files outside the repo are never guarded', () => {
  assert.equal(decide(read('packages/api/src/main.ts'), scoped), null);
  assert.equal(
    decide({ tool_name: 'Read', tool_input: { file_path: '/tmp/brief.md' } }, scoped),
    null,
  );
  assert.equal(decide(bash('cat packages/api/src/main.ts'), scoped), null);
});

test('paths inside an agent worktree are guarded like the repo', () => {
  assert.ok(decide(read('.claude/worktrees/agent-1/docs/laters.md'), noScope));
});

test('shell commands that print a whole guarded file are denied', () => {
  assert.ok(decide(bash('cat docs/laters.md'), noScope));
  assert.ok(decide(bash(`less ${repo}/docs/laters.md`), noScope));
  assert.ok(decide(bash('git status && more pnpm-lock.yaml'), noScope));
  assert.ok(decide(bash('cat docs/factory/gates.md'), scoped));
});

test('a shell glob that can reach a guarded file is denied', () => {
  assert.ok(decide(bash('cat docs/*.md'), noScope));
  assert.ok(decide(bash('cat docs/workflow/*.md'), scoped));
  assert.equal(decide(bash('cat docs/workflow/*.md'), noScope), null);
});

test('a shell glob that stays inside the scope is allowed', () => {
  assert.equal(decide(bash('cat packages/api/AGENTS.md docs/conventions/api.md'), scoped), null);
  assert.ok(decide(bash('cat docs/conventions/*.md'), scoped));
  assert.ok(decide(bash('cat docs/conventions/w*.md'), scoped));
  const ticket = '.scratch/00007-live-signals/issues';
  assert.equal(decide(bash(`cat ${ticket}/01-*.md`), scoped), null);
  assert.ok(decide(bash(`cat ${ticket}/*.md`), scoped));
});

test('a cat inside a for loop or an if is guarded like any other', () => {
  assert.ok(decide(bash('for i in 1; do cat docs/factory/gates.md; done'), scoped));
  assert.ok(decide(bash('if true; then cat docs/factory/gates.md; fi'), scoped));
  assert.ok(decide(bash('for f in docs/factory/gates.md; do cat "$f"; done'), scoped));
  assert.ok(decide(bash('for f in a.md docs/*; do echo "$f"; cat ${f}; done'), scoped));
  assert.equal(
    decide(
      bash('for f in docs/conventions/api.md packages/api/AGENTS.md; do cat "$f"; done'),
      scoped,
    ),
    null,
  );
  assert.ok(decide(bash('for f in docs/conventions/*.md; do cat "$f"; done'), scoped));
  assert.equal(decide(bash('for f in docs/factory/gates.md; do head -5 "$f"; done'), scoped), null);
});

test('a cd earlier in the command is followed', () => {
  assert.ok(decide(bash('cd docs && cat laters.md'), noScope));
  assert.ok(decide(bash('cd .scratch/00007-x; cat spec.md'), scoped));
  assert.ok(decide(bash(`cd ${repo}/docs/factory && cat gates.md`), scoped));
  assert.equal(decide(bash('cd docs/conventions && cat api.md'), scoped), null);
  assert.equal(decide(bash('cd packages/api/src && cat app.ts'), scoped), null);
});

test('searching, partial reads and appends are allowed', () => {
  assert.equal(decide(bash("grep -n '^## ' docs/laters.md"), scoped), null);
  assert.equal(decide(bash('sed -n 1,20p docs/laters.md'), scoped), null);
  assert.equal(decide(bash('head -20 docs/factory/gates.md'), scoped), null);
  assert.equal(decide(bash("cat >> docs/laters.md <<'EOF'\n## New\nEOF"), scoped), null);
});

test('other tools are ignored', () => {
  assert.equal(decide({ tool_name: 'Edit', tool_input: { file_path: 'x' } }, scoped), null);
});

const cli = fileURLToPath(new URL('./guard-reads.ts', import.meta.url));
const runCli = (stdin: string) => spawnSync('node', [cli], { input: stdin, encoding: 'utf8' });

test('the hook lets the call through when its input is broken', () => {
  const result = runCli('not json');
  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
});

test('the hook finds the scope by branch in a real repo and answers in the hook format', () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'guard-reads-')));
  const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, stdio: 'ignore' });
  git('init', '-q', '-b', 'agent/00007-01-typing');
  git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'x');
  mkdirSync(join(dir, '.git/scope/agent'), { recursive: true });
  writeFileSync(
    join(dir, '.git/scope/agent/00007-01-typing.txt'),
    '# note\npackages: web\nworktree: yes\n',
  );
  const input = (path: string, agentType?: string) =>
    JSON.stringify({
      tool_name: 'Read',
      tool_input: { file_path: join(dir, path) },
      cwd: dir,
      agent_type: agentType,
    });

  const denied = JSON.parse(runCli(input('docs/other.md')).stdout);
  assert.equal(denied.hookSpecificOutput.hookEventName, 'PreToolUse');
  assert.equal(denied.hookSpecificOutput.permissionDecision, 'deny');
  assert.equal(runCli(input('docs/conventions/web.md')).stdout, '');
  assert.equal(runCli(input('docs/workflow/worktree.md')).stdout, '');
  assert.equal(runCli(input('docs/factory/roles/implementer.md', 'implementer')).stdout, '');
  assert.notEqual(runCli(input('docs/factory/roles/reviewer.md', 'implementer')).stdout, '');
});
