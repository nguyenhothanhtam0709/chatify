import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { checkBeforePr, opensPr, type RunResult } from './guard-pr.ts';

const ok: RunResult = { status: 0, output: '' };
const failed = (output: string): RunResult => ({ status: 1, output });
const runner = (results: Record<string, RunResult>) => (command: string) => results[command] ?? ok;

test('opening a PR through the MCP tool or gh is checked, other shell commands are not', () => {
  const bash = (command: string) => ({ tool_name: 'Bash', tool_input: { command } });
  assert.equal(opensPr({ tool_name: 'mcp__github__create_pull_request' }), true);
  assert.equal(opensPr(bash('gh pr create --base main --title x')), true);
  assert.equal(opensPr(bash('git push -u origin x && gh pr create --fill')), true);
  assert.equal(opensPr(bash('git status')), false);
  assert.equal(opensPr(bash('gh pr view 141')), false);
  assert.equal(opensPr(bash('git commit -m "use gh pr create"')), false);
});

test('a shell command that opens no PR runs no check', () => {
  const cli = fileURLToPath(new URL('./guard-pr.ts', import.meta.url));
  const input = JSON.stringify({
    tool_name: 'Bash',
    tool_input: { command: 'git status' },
    cwd: '/nonexistent',
  });
  const result = spawnSync('node', [cli], { input, encoding: 'utf8' });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
});

test('clean docs let the PR through', () => {
  assert.equal(checkBeforePr(runner({})), null);
});

test('findings from the check deny the PR and are quoted', () => {
  const reason = checkBeforePr(runner({ check: failed('docs/a.md: broken link gone.md') }));
  assert.match(reason ?? '', /docs\/a\.md: broken link gone\.md/);
  assert.match(reason ?? '', /docs:check/);
});

test('Generated Docs that differ from the code deny the PR', () => {
  const reason = checkBeforePr(runner({ diff: failed('docs/architecture/http-routes.md') }));
  assert.match(reason ?? '', /http-routes\.md/);
  assert.match(reason ?? '', /docs:generate/);
});

test('a generate step that cannot run lets the PR through, but the check still runs', () => {
  assert.equal(checkBeforePr(runner({ generate: failed('no node_modules') })), null);
  const reason = checkBeforePr(
    runner({ generate: failed('no node_modules'), check: failed('docs/a.md: x') }),
  );
  assert.match(reason ?? '', /docs\/a\.md: x/);
});

test('a Diff-scope violation denies the PR and every violation is listed', () => {
  const reason = checkBeforePr(
    runner({ scope: failed('packages/web/a.ts: outside Writes\ndocs/laters.md: line removed') }),
  );
  assert.match(reason ?? '', /packages\/web\/a\.ts/);
  assert.match(reason ?? '', /docs\/laters\.md/);
});

test('a clean diff lets the PR through, and so does a scope step that cannot run', () => {
  assert.equal(checkBeforePr(runner({ scope: ok })), null);
  assert.equal(checkBeforePr(runner({ scope: { status: null, output: 'no git' } })), null);
});

test('a scope violation and a docs failure are both reported', () => {
  const reason = checkBeforePr(
    runner({ scope: failed('a.ts: out'), check: failed('docs/a.md: x') }),
  );
  assert.match(reason ?? '', /a\.ts: out/);
  assert.match(reason ?? '', /docs\/a\.md: x/);
});

test('a broken input lets the PR through', () => {
  const cli = fileURLToPath(new URL('./guard-pr.ts', import.meta.url));
  const result = spawnSync('node', [cli], { input: 'not json', encoding: 'utf8' });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
});

test('the hook denies a PR whose branch changed a file outside the Writes, and lets a clean one through', () => {
  const dir = mkdtempSync(join(tmpdir(), 'guard-pr-'));
  const git = (...args: string[]) =>
    spawnSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd: dir });
  git('init', '-q', '-b', 'main');
  mkdirSync(join(dir, 'scripts'));
  writeFileSync(join(dir, 'scripts/a.ts'), '');
  git('add', '.');
  git('commit', '-q', '-m', 'base');
  git('update-ref', 'refs/remotes/origin/feat/00007-x', 'HEAD');
  git('checkout', '-q', '-b', 'agent/00007-y');
  mkdirSync(join(dir, '.git/scope/agent'), { recursive: true });
  writeFileSync(join(dir, '.git/scope/agent/00007-y.txt'), 'ticket: none\npackages: scripts\n');
  const run = () => {
    const input = JSON.stringify({
      tool_name: 'mcp__github__create_pull_request',
      agent_type: 'implementer',
      cwd: dir,
    });
    return spawnSync('node', [fileURLToPath(new URL('./guard-pr.ts', import.meta.url))], {
      input,
      encoding: 'utf8',
    }).stdout;
  };
  writeFileSync(join(dir, 'scripts/a.ts'), 'x');
  git('commit', '-qam', 'in scope');
  assert.doesNotMatch(run(), /outside its Role's Writes/);
  mkdirSync(join(dir, 'packages/web'), { recursive: true });
  writeFileSync(join(dir, 'packages/web/b.ts'), 'x');
  git('add', '.');
  git('commit', '-q', '-m', 'out of scope');
  const out = JSON.parse(run()) as { hookSpecificOutput: { permissionDecisionReason: string } };
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /packages\/web\/b\.ts/);
});
