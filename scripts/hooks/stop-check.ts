// SubagentStop hook: when an Implementer ends its turn, runs the Diff-scope check, then lint and
// typecheck of the scope's packages and the test files changed on the branch, so a breach or a
// failure reaches the agent before the PR does. Blocks the stop once; a timeout does not block.
// Fails open, like the other guards.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { diffScope, gitOut, type HookInput } from './guard-pr.ts';
import { readScopeFile, scopeFacts } from './scope-facts.ts';

export const BUDGET_MS = 180_000;

export interface CheckResult {
  /** 0 passed, 1 failed, null could not run. */
  status: number | null;
  output: string;
  timedOut?: boolean;
}

export interface Check {
  name: string;
  /** Runs the check with at most `budgetMs` to finish. */
  run: (budgetMs: number) => CheckResult;
}

export interface StopInput extends HookInput {
  stop_hook_active?: boolean;
}

export interface StopDecision {
  /** The reason to block the stop, or null to let the agent stop. */
  block: string | null;
  /** A report for the agent that does not block, or null. */
  notice: string | null;
}

/** Runs the checks in order within the budget. Only an `implementer`'s first stop is checked. */
export const checkOnStop = (input: StopInput, checks: Check[], now: () => number): StopDecision => {
  if (input.agent_type !== 'implementer' || input.stop_hook_active) {
    return { block: null, notice: null };
  }
  const start = now();
  const failures: string[] = [];
  const skipped: string[] = [];
  for (const check of checks) {
    const left = BUDGET_MS - (now() - start);
    if (left <= 0) {
      skipped.push(check.name);
      continue;
    }
    const result = check.run(left);
    if (result.timedOut) skipped.push(check.name);
    else if (result.status === 1) failures.push(`${check.name}:\n${result.output}`);
  }
  return {
    block:
      failures.length > 0
        ? `The stop check failed. Fix these before you stop:\n\n${failures.join('\n\n')}`
        : null,
    notice:
      skipped.length > 0
        ? `The stop check ran out of its ${BUDGET_MS / 1000} s budget and did not run: ${skipped.join(', ')}.`
        : null,
  };
};

export interface Command {
  name: string;
  command: string;
  args: string[];
}

const TEST_FILE = /\.(?:test|spec)\.tsx?$/;

/** Lint and typecheck of each scope package, then the changed test files. */
export const stopChecks = (packages: string[], changedFiles: string[]): Command[] => {
  const commands: Command[] = packages.flatMap((pkg) =>
    ['lint', 'typecheck'].map((script) =>
      pkg === 'scripts'
        ? { name: `${script}:scripts`, command: 'pnpm', args: [`${script}:scripts`] }
        : {
            name: `${script} @chat/${pkg}`,
            command: 'pnpm',
            args: ['--filter', `@chat/${pkg}`, script],
          },
    ),
  );
  const tests = changedFiles.filter((file) => TEST_FILE.test(file));
  const scriptTests = tests.filter((file) => file.startsWith('scripts/'));
  for (const pkg of new Set(tests.map((file) => /^packages\/([^/]+)\//.exec(file)?.[1]))) {
    if (pkg === undefined) continue;
    const files = tests.filter((file) => file.startsWith(`packages/${pkg}/`));
    commands.push({
      name: `tests @chat/${pkg}`,
      command: 'pnpm',
      args: [
        '--filter',
        `@chat/${pkg}`,
        'exec',
        'vitest',
        'run',
        ...files.map((file) => file.slice(`packages/${pkg}/`.length)),
      ],
    });
  }
  if (scriptTests.length > 0) {
    commands.push({ name: 'tests scripts', command: 'node', args: ['--test', ...scriptTests] });
  }
  return commands;
};

const spawned =
  (cwd: string, { command, args }: Command) =>
  (budgetMs: number): CheckResult => {
    const result = spawnSync(command, args, { cwd, encoding: 'utf8', timeout: budgetMs });
    const code = (result.error as NodeJS.ErrnoException | undefined)?.code;
    if (code === 'ETIMEDOUT') return { status: null, output: '', timedOut: true };
    if (result.error || result.status === null) {
      return { status: null, output: String(result.error ?? 'killed') };
    }
    return { status: result.status > 0 ? 1 : 0, output: `${result.stdout}${result.stderr}`.trim() };
  };

/** The checks to run for the branch in the hook input's cwd. */
const checksFor = (input: StopInput): Check[] => {
  const cwd = input.cwd ?? process.cwd();
  const [root = cwd, gitCommonDir = '.git', branch = ''] = gitOut(cwd, [
    'rev-parse',
    '--show-toplevel',
    '--git-common-dir',
    '--abbrev-ref',
    'HEAD',
  ]).split('\n');
  const specNumber = /^agent\/(\d{5})-/.exec(branch)?.[1];
  if (specNumber === undefined) return [];
  const scope = readScopeFile(resolve(cwd, gitCommonDir), branch);
  if (scope === null) return [];
  const tip = gitOut(cwd, ['branch', '-r', '--list', `origin/feat/${specNumber}-*`])
    .split('\n')[0]
    ?.trim();
  if (!tip) return [];
  const base = gitOut(cwd, ['merge-base', tip, 'HEAD']);
  const changed = gitOut(root, ['diff', '--name-only', '--no-renames', `${base}..HEAD`])
    .split('\n')
    .filter(Boolean);
  return [
    {
      name: "Diff scope (files outside the Role's Writes)",
      run: () => diffScope(input),
    },
    ...stopChecks(scopeFacts(scope).packages, changed).map((command) => ({
      name: command.name,
      run: spawned(root, command),
    })),
  ];
};

if (import.meta.main) {
  try {
    const input = JSON.parse(readFileSync(0, 'utf8')) as StopInput;
    const { block, notice } = checkOnStop(
      input,
      input.agent_type === 'implementer' && !input.stop_hook_active ? checksFor(input) : [],
      Date.now,
    );
    if (block !== null) {
      process.stdout.write(JSON.stringify({ decision: 'block', reason: block }));
    } else if (notice !== null) {
      process.stdout.write(JSON.stringify({ systemMessage: notice }));
      process.stderr.write(`${notice}\n`);
    }
  } catch {
    // Fail open: a broken guard must never block an agent.
  }
}
