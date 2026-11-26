import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { type Check as FastCheck, type CheckResult as FastResult } from './fast-checks.ts';
import { checkBeforePr, checkFastOnPr, opensPr, prBody, type RunResult } from './guard-pr.ts';
import { worktreeFixture } from './worktree-fixture.ts';

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

test('an unexcused Descriptive Doc denies the PR, naming the doc and the line to add', () => {
  const reason = checkBeforePr(runner({ covers: failed('docs/architecture/runtime-flows.md') }));
  assert.match(reason ?? '', /docs\/architecture\/runtime-flows\.md/);
  assert.match(reason ?? '', /Doc not updated: <doc path> — <reason>/);
});

test('the PR body comes from the MCP tool or from gh pr create --body', () => {
  assert.equal(
    prBody({ tool_name: 'mcp__github__create_pull_request', tool_input: { body: 'hi' } }),
    'hi',
  );
  const heredoc = `gh pr create --title t --body "$(cat <<'EOF'\nDoc not updated: docs/a.md — why\nEOF\n)"`;
  assert.match(prBody({ tool_name: 'Bash', tool_input: { command: heredoc } }) ?? '', /^\$\(cat/);
  const inline = 'gh pr create --body "Doc not updated: docs/a.md — why"';
  assert.match(
    prBody({ tool_name: 'Bash', tool_input: { command: inline } }) ?? '',
    /^Doc not updated/,
  );
  assert.equal(
    prBody({ tool_name: 'Bash', tool_input: { command: 'gh pr create --fill' } }),
    undefined,
  );
});

test('the hook denies a PR that changed covered code without its doc, until the body excuses it', () => {
  const dir = mkdtempSync(join(tmpdir(), 'guard-pr-covers-'));
  const git = (...args: string[]) =>
    spawnSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd: dir });
  git('init', '-q', '-b', 'main');
  mkdirSync(join(dir, 'docs'));
  mkdirSync(join(dir, 'scripts'));
  writeFileSync(join(dir, 'docs/flow.md'), '---\nkind: descriptive\ncovers: [scripts/**]\n---\n');
  writeFileSync(join(dir, 'scripts/a.ts'), '');
  git('add', '.');
  git('commit', '-q', '-m', 'base');
  git('update-ref', 'refs/remotes/origin/feat/00007-x', 'HEAD');
  git('checkout', '-q', '-b', 'agent/00007-y');
  mkdirSync(join(dir, '.git/scope/agent'), { recursive: true });
  writeFileSync(
    join(dir, '.git/scope/agent/00007-y.txt'),
    'ticket: none\npackages: scripts\nwrites: docs/flow.md\n',
  );
  writeFileSync(join(dir, 'scripts/a.ts'), 'x');
  git('commit', '-qam', 'change covered code');
  const run = (body: string) =>
    spawnSync('node', [fileURLToPath(new URL('./guard-pr.ts', import.meta.url))], {
      input: JSON.stringify({
        tool_name: 'mcp__github__create_pull_request',
        tool_input: { body },
        agent_type: 'implementer',
        cwd: dir,
      }),
      encoding: 'utf8',
    }).stdout;
  assert.match(run('no mention'), /docs\/flow\.md/);
  assert.doesNotMatch(run('Doc not updated: docs/flow.md — wording only'), /docs\/flow\.md/);
});

const guard = (input: object) =>
  spawnSync('node', [fileURLToPath(new URL('./guard-pr.ts', import.meta.url))], {
    input: JSON.stringify(input),
    encoding: 'utf8',
  }).stdout;
const reasonOf = (stdout: string) =>
  stdout === ''
    ? ''
    : (JSON.parse(stdout) as { hookSpecificOutput: { permissionDecisionReason: string } })
        .hookSpecificOutput.permissionDecisionReason;

test('with cwd on the Feature Branch, the MCP head is the branch the PR guard checks', () => {
  const tree = worktreeFixture();
  const open = (head: string) =>
    reasonOf(
      guard({
        tool_name: 'mcp__github__create_pull_request',
        tool_input: { head, body: '' },
        agent_type: 'implementer',
        cwd: tree.main,
      }),
    );
  tree.write('docs/flow.md', '---\nkind: descriptive\ncovers: [scripts/**]\n---\nsaid\n');
  tree.write('scripts/a.ts', 'x');
  tree.commit('in scope, with its doc');
  assert.doesNotMatch(open(tree.branch), /outside its Role's Writes|Descriptive Doc/);
  tree.write('packages/web/b.ts', 'x');
  tree.commit('out of scope');
  assert.match(open(tree.branch), /packages\/web\/b\.ts/);
});

test('with cwd on the Feature Branch, gh pr create --head is the branch the PR guard checks', () => {
  const tree = worktreeFixture();
  tree.write('scripts/a.ts', 'x');
  tree.commit('covered code, doc unchanged');
  for (const flag of [`--head ${tree.branch}`, `-H ${tree.branch}`, `--head=${tree.branch}`]) {
    const reason = reasonOf(
      guard({
        tool_name: 'Bash',
        tool_input: { command: `gh pr create --base feat/00007-x ${flag} --title t --body x` },
        agent_type: 'implementer',
        cwd: tree.main,
      }),
    );
    assert.match(reason, /docs\/flow\.md/, flag);
  }
});

test('with no head, the PR guard checks the branch of the cd before gh pr create', () => {
  const tree = worktreeFixture();
  tree.write('packages/web/b.ts', 'x');
  tree.commit('out of scope');
  const reason = reasonOf(
    guard({
      tool_name: 'Bash',
      tool_input: { command: `cd ${tree.worktree} && gh pr create --title t --body x` },
      agent_type: 'implementer',
      cwd: tree.main,
    }),
  );
  assert.match(reason, /packages\/web\/b\.ts/);
});

test('an Implementer PR whose head is not a Task Branch with a scope file is denied, saying why', () => {
  const tree = worktreeFixture();
  tree.git(['branch', 'agent/00007-02-noscope'], tree.main);
  const open = (input: object) =>
    reasonOf(
      guard({
        tool_name: 'mcp__github__create_pull_request',
        agent_type: 'implementer',
        cwd: tree.main,
        ...input,
      }),
    );
  assert.match(open({}), /can't find its Task Branch/);
  assert.match(open({ tool_input: { head: 'feat/00007-x' } }), /can't find its Task Branch/);
  assert.match(
    open({ tool_input: { head: 'agent/00007-02-noscope' } }),
    /can't find its Task Branch.*no scope file/s,
  );
  // Other Roles, and a broken input, still fail open.
  assert.doesNotMatch(open({ agent_type: 'reviewer' }), /Task Branch/);
  assert.equal(
    reasonOf(
      guard({
        tool_name: 'mcp__github__create_pull_request',
        agent_type: 'implementer',
        cwd: '/nonexistent',
      }),
    ),
    '',
  );
});

const fastCheck = (name: string, result: FastResult): FastCheck => ({ name, run: () => result });
const clockAt = (...times: number[]) => {
  let i = 0;
  return () => times[Math.min(i++, times.length - 1)] ?? 0;
};

test('a failing fast check denies an Implementer PR, with the output', () => {
  const { reason } = checkFastOnPr(
    { agent_type: 'implementer' },
    [fastCheck('lint:scripts', { status: 1, output: 'no-unused-vars in a.ts' })],
    clockAt(0),
  );
  assert.match(reason ?? '', /lint:scripts/);
  assert.match(reason ?? '', /no-unused-vars in a\.ts/);
});

test('clean fast checks let the PR through, and other Roles run none', () => {
  const clean = [fastCheck('lint', { status: 0, output: '' })];
  assert.deepEqual(checkFastOnPr({ agent_type: 'implementer' }, clean, clockAt(0)), {
    reason: null,
    notice: null,
  });
  const ran: string[] = [];
  const spy: FastCheck = { name: 'x', run: () => (ran.push('x'), { status: 1, output: 'bad' }) };
  for (const input of [{ agent_type: 'reviewer' }, { agent_type: 'doc-sync' }, {}]) {
    assert.equal(checkFastOnPr(input, [spy], clockAt(0)).reason, null);
  }
  assert.deepEqual(ran, []);
});

test('a fast check over the budget is reported and does not deny', () => {
  const timedOut = fastCheck('tests scripts', { status: null, output: '', timedOut: true });
  const result = checkFastOnPr({ agent_type: 'implementer' }, [timedOut], clockAt(0));
  assert.equal(result.reason, null);
  assert.match(result.notice ?? '', /tests scripts/);
});

test('the hook denies an Implementer PR whose scope package fails lint', () => {
  const dir = mkdtempSync(join(tmpdir(), 'guard-pr-fast-'));
  const git = (...args: string[]) =>
    spawnSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd: dir });
  git('init', '-q', '-b', 'main');
  writeFileSync(join(dir, 'a.txt'), '');
  git('add', '.');
  git('commit', '-q', '-m', 'base');
  git('update-ref', 'refs/remotes/origin/feat/00007-x', 'HEAD');
  git('checkout', '-q', '-b', 'agent/00007-y');
  mkdirSync(join(dir, '.git/scope/agent'), { recursive: true });
  writeFileSync(join(dir, '.git/scope/agent/00007-y.txt'), 'ticket: none\npackages: scripts\n');
  // No package.json here, so `pnpm lint:scripts` fails in the worktree of the head.
  const input = JSON.stringify({
    tool_name: 'mcp__github__create_pull_request',
    agent_type: 'implementer',
    cwd: dir,
  });
  const out = spawnSync('node', [fileURLToPath(new URL('./guard-pr.ts', import.meta.url))], {
    input,
    encoding: 'utf8',
  }).stdout;
  const reason = (JSON.parse(out) as { hookSpecificOutput: { permissionDecisionReason: string } })
    .hookSpecificOutput.permissionDecisionReason;
  assert.match(reason, /lint:scripts/);
});
