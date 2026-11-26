import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkOnStop, stopChecks, type Check, type CheckResult } from './stop-check.ts';

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
  assert.deepEqual(commands.slice(4), [
    'pnpm --filter @chat/api exec vitest run test/a.test.ts',
    'node --test scripts/hooks/c.test.ts',
  ]);
  assert.equal(stopChecks(['api'], ['packages/api/src/b.ts']).length, 2);
});
