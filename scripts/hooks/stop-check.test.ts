import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { stopChecks, type Check, type CheckResult } from './fast-checks.ts';
import { checkOnStop } from './stop-check.ts';
import { worktreeFixture } from './worktree-fixture.ts';

const pass: CheckResult = { status: 0, output: '' };
const fail = (output: string): CheckResult => ({ status: 1, output });
const clock = (...times: number[]) => {
  let i = 0;
  return () => times[Math.min(i++, times.length - 1)] ?? 0;
};
const check = (name: string, result: CheckResult, ran: string[] = []): Check => ({
  name,
  run: () => {
    ran.push(name);
    return result;
  },
});
const implementer = { agent_type: 'implementer' };

test('any Role other than implementer, and a stop already blocked once, run nothing', () => {
  const ran: string[] = [];
  const checks = [check('diff', fail('x'), ran)];
  for (const input of [
    { agent_type: 'reviewer' },
    { agent_type: 'doc-sync' },
    {},
    { agent_type: 'implementer', stop_hook_active: true },
  ]) {
    assert.deepEqual(checkOnStop(input, checks, clock(0)), { block: null, notice: null });
  }
  assert.deepEqual(ran, []);
});

test('a scope violation blocks the stop with the violation listed', () => {
  const { block } = checkOnStop(
    implementer,
    [check('Diff scope', fail('docs/x.md: outside Writes')), check('lint', pass)],
    clock(0),
  );
  assert.match(block ?? '', /Diff scope/);
  assert.match(block ?? '', /docs\/x\.md: outside Writes/);
});

test('a lint failure blocks the stop with its output', () => {
  const { block } = checkOnStop(
    implementer,
    [check('Diff scope', pass), check('lint @chat/api', fail('no-unused-vars at a.ts:3'))],
    clock(0),
  );
  assert.match(block ?? '', /lint @chat\/api/);
  assert.match(block ?? '', /no-unused-vars at a\.ts:3/);
});

test('passing checks let the agent stop', () => {
  assert.deepEqual(checkOnStop(implementer, [check('a', pass), check('b', pass)], clock(0)), {
    block: null,
    notice: null,
  });
});

test('a check that cannot start is skipped', () => {
  const result = checkOnStop(implementer, [check('a', { status: null, output: 'boom' })], clock(0));
  assert.deepEqual(result, { block: null, notice: null });
});

test('a run over 180 s is reported and does not block', () => {
  const ran: string[] = [];
  // start 0; first check ends at 200 s, so the second never starts
  const result = checkOnStop(
    implementer,
    [check('a', pass, ran), check('b', fail('late'), ran)],
    clock(0, 0, 200_000, 200_000),
  );
  assert.equal(result.block, null);
  assert.match(result.notice ?? '', /180 s/);
  assert.deepEqual(ran, ['a']);
});

test('a check that times out is reported and does not block', () => {
  const timedOut: Check = {
    name: 'tests',
    run: () => ({ status: null, output: '', timedOut: true }),
  };
  const result = checkOnStop(implementer, [timedOut], clock(0));
  assert.equal(result.block, null);
  assert.match(result.notice ?? '', /tests/);
});

test('each check gets only the time left in the budget', () => {
  const budgets: number[] = [];
  const spy: Check = { name: 'a', run: (ms) => (budgets.push(ms), pass) };
  checkOnStop(implementer, [spy], clock(0, 30_000));
  assert.deepEqual(budgets, [150_000]);
});

test('a failure found before the budget ran out still blocks', () => {
  const result = checkOnStop(
    implementer,
    [check('a', fail('bad')), check('b', pass)],
    clock(0, 0, 200_000, 200_000),
  );
  assert.match(result.block ?? '', /bad/);
});

test('stopChecks lints and typechecks each scope package, workspace or scripts', () => {
  const commands = stopChecks(['api', 'scripts'], []).map((c) => [c.command, ...c.args].join(' '));
  assert.deepEqual(commands, [
    'pnpm build:contracts',
    'pnpm --filter @chat/api lint',
    'pnpm --filter @chat/api typecheck',
    'pnpm lint:scripts',
    'pnpm typecheck:scripts',
  ]);
});

test('stopChecks runs only the test files changed on the branch', () => {
  const commands = stopChecks(
    ['api', 'scripts'],
    [
      'packages/api/test/a.test.ts',
      'packages/api/src/b.ts',
      'scripts/hooks/c.test.ts',
      'README.md',
    ],
  ).map((c) => [c.command, ...c.args].join(' '));
  assert.deepEqual(commands.slice(5), [
    'pnpm --filter @chat/api exec vitest run test/a.test.ts',
    'node --test scripts/hooks/c.test.ts',
  ]);
  assert.equal(stopChecks(['api'], ['packages/api/src/b.ts']).length, 3);
});

test('stopChecks builds the contracts first for api or web, and not for contracts or scripts', () => {
  const first = (packages: string[]) =>
    stopChecks(packages, []).map((c) => [c.command, ...c.args].join(' '));
  assert.equal(first(['web'])[0], 'pnpm build:contracts');
  assert.equal(first(['contracts', 'api'])[0], 'pnpm build:contracts');
  assert.equal(first(['scripts', 'web'])[0], 'pnpm build:contracts');
  assert.equal(first(['api', 'web']).filter((c) => c === 'pnpm build:contracts').length, 1);
  for (const packages of [['contracts'], ['scripts'], ['contracts', 'scripts']]) {
    assert.ok(!first(packages).includes('pnpm build:contracts'));
  }
});

test('stopChecks marks the contracts build as stopping the run', () => {
  const [build, ...rest] = stopChecks(['api'], []);
  assert.equal(build?.stopOnFail, true);
  assert.ok(rest.every((c) => !c.stopOnFail));
});

test('a failed contracts build is the failure and the checks after it are skipped', () => {
  const ran: string[] = [];
  const build: Check = {
    ...check('build contracts', fail('TS2322 in contracts'), ran),
    stopOnFail: true,
  };
  const result = checkOnStop(
    implementer,
    [check('Diff scope', pass, ran), build, check('lint @chat/api', fail('repeat'), ran)],
    clock(0),
  );
  assert.match(result.block ?? '', /TS2322 in contracts/);
  assert.doesNotMatch(result.block ?? '', /repeat/);
  assert.deepEqual(ran, ['Diff scope', 'build contracts']);
});

test('a passing contracts build lets the later checks run', () => {
  const ran: string[] = [];
  const build: Check = { ...check('build contracts', pass, ran), stopOnFail: true };
  checkOnStop(implementer, [build, check('lint', pass, ran)], clock(0));
  assert.deepEqual(ran, ['build contracts', 'lint']);
});

const stopHook = (cwd: string) =>
  spawnSync('node', [fileURLToPath(new URL('./stop-check.ts', import.meta.url))], {
    input: JSON.stringify({ agent_type: 'implementer', cwd }),
    encoding: 'utf8',
  }).stdout;
const worktreeScope = 'ticket: none\npackages: none\nworktree: yes\n';

test('with cwd on the Feature Branch, the stop check checks the one agent worktree', () => {
  const tree = worktreeFixture(worktreeScope);
  tree.write('packages/web/b.ts', 'x');
  tree.commit('out of scope');
  const out = JSON.parse(stopHook(tree.main)) as { decision: string; reason: string };
  assert.equal(out.decision, 'block');
  assert.match(out.reason, /packages\/web\/b\.ts/);
});

test('with several agent worktrees, the stop check reports it cannot tell and does not block', () => {
  const tree = worktreeFixture(worktreeScope);
  tree.write('packages/web/b.ts', 'x');
  tree.commit('out of scope');
  tree.addWorktree('agent-2', 'agent/00007-02-z', worktreeScope);
  const out = JSON.parse(stopHook(tree.main)) as { decision?: string; systemMessage: string };
  assert.equal(out.decision, undefined);
  assert.match(out.systemMessage, /agent\/00007-01-y/);
  assert.match(out.systemMessage, /agent\/00007-02-z/);
});

test('an agent worktree without worktree: yes is not checked from the Feature Branch', () => {
  const tree = worktreeFixture('ticket: none\npackages: none\nworktree: no\n');
  tree.write('packages/web/b.ts', 'x');
  tree.commit('out of scope');
  assert.equal(stopHook(tree.main), '');
});

test('with cwd on an agent branch, that branch is checked as before', () => {
  const tree = worktreeFixture('ticket: none\npackages: none\nworktree: no\n');
  tree.write('packages/web/b.ts', 'x');
  tree.commit('out of scope');
  tree.addWorktree('agent-2', 'agent/00007-02-z', worktreeScope);
  const out = JSON.parse(stopHook(tree.worktree)) as { decision: string; reason: string };
  assert.equal(out.decision, 'block');
  assert.match(out.reason, /packages\/web\/b\.ts/);
});
