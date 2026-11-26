// The fast checks shared by the stop check (SubagentStop) and the PR guard: lint and typecheck of
// each scope package, and the test files changed on the branch, within one time budget.
import { spawnSync } from 'node:child_process';
import { scopeFacts } from './scope-facts.ts';

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
  /** When this check fails, the checks after it do not run, since they would only repeat it. */
  stopOnFail?: boolean;
}

export interface RunOutcome {
  /** The failed checks, each with its output. */
  failures: string[];
  /** The checks that did not run, or ran out of time. */
  skipped: string[];
}

/** Runs the checks in order, each with only the time left of the budget. */
export const runChecks = (checks: Check[], now: () => number): RunOutcome => {
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
    else if (result.status === 1) {
      failures.push(`${check.name}:\n${result.output}`);
      if (check.stopOnFail) break;
    }
  }
  return { failures, skipped };
};

export interface Command {
  name: string;
  command: string;
  args: string[];
  /** A failure of this command ends the run. */
  stopOnFail?: boolean;
}

const TEST_FILE = /\.(?:test|spec)\.tsx?$/;

/** The contracts build (api and web only), lint and typecheck of each scope package, then the changed test files. */
export const stopChecks = (packages: string[], changedFiles: string[]): Command[] => {
  const needsContracts = packages.some((pkg) => pkg === 'api' || pkg === 'web');
  const commands: Command[] = needsContracts
    ? [{ name: 'build contracts', command: 'pnpm', args: ['build:contracts'], stopOnFail: true }]
    : [];
  commands.push(
    ...packages.flatMap((pkg) =>
      ['lint', 'typecheck'].map((script) =>
        pkg === 'scripts'
          ? { name: `${script}:scripts`, command: 'pnpm', args: [`${script}:scripts`] }
          : {
              name: `${script} @chat/${pkg}`,
              command: 'pnpm',
              args: ['--filter', `@chat/${pkg}`, script],
            },
      ),
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

/** The fast checks of a Task Branch, run in its worktree. */
export const fastChecks = (worktree: string, scope: string[], changed: string[]): Check[] =>
  stopChecks(scopeFacts(scope).packages, changed).map((command) => ({
    name: command.name,
    run: spawned(worktree, command),
    stopOnFail: command.stopOnFail,
  }));
