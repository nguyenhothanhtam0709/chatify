// SubagentStop hook: when an Implementer ends its turn, runs the Diff-scope check, then lint and
// typecheck of the scope's packages and the test files changed on the branch, so a breach or a
// failure reaches the agent before the PR does. Blocks the stop once; a timeout does not block.
// Fails open, like the other guards.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { featureTip, gitContext, worktrees } from './git-context.ts';
import { diffScope, gitOut, taskBranch, type HookInput, type TaskBranch } from './guard-pr.ts';
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

/**
 * The Task Branch whose work is checked. The input names no file or branch, and a sub-agent in a
 * worktree gets the main checkout as `cwd` (Ticket 08). So: the branch of `cwd` when it is an
 * `agent/` branch, else the one `agent/` worktree whose scope file says `worktree: yes`. Several
 * give a notice instead, since nothing says which is this agent's; none gives nothing.
 */
export const findStopBranch = (input: StopInput): TaskBranch | { notice: string } | null => {
  const cwd = input.cwd ?? process.cwd();
  const context = gitContext(cwd);
  if (context === null) return null;
  const task = (branch: string, worktree: string) =>
    taskBranch(branch, context.commonDir, worktree);
  if (context.branch.startsWith('agent/')) return task(context.branch, context.root);
  const candidates = worktrees(cwd).flatMap(({ path, branch }) => {
    if (!branch?.startsWith('agent/')) return [];
    const found = task(branch, path);
    return found.scope !== null && scopeFacts(found.scope).worktree ? [found] : [];
  });
  if (candidates.length > 1) {
    return {
      notice:
        `The stop check did not run: cwd is on ${context.branch} and several agent worktrees ` +
        `could be this agent's (${candidates.map((c) => c.branch).join(', ')}).`,
    };
  }
  return candidates[0] ?? null;
};

/** The checks to run for the Task Branch. */
const checksFor = (input: StopInput, task: TaskBranch): Check[] => {
  const { specNumber, scope, worktree, branch } = task;
  if (specNumber === null || scope === null) return [];
  const tip = featureTip(worktree, specNumber);
  if (tip === null) return [];
  const base = gitOut(worktree, ['merge-base', tip, branch]);
  const changed = gitOut(worktree, ['diff', '--name-only', '--no-renames', `${base}..${branch}`])
    .split('\n')
    .filter(Boolean);
  return [
    {
      name: "Diff scope (files outside the Role's Writes)",
      run: () => diffScope(input.agent_type, task),
    },
    ...stopChecks(scopeFacts(scope).packages, changed).map((command) => ({
      name: command.name,
      run: spawned(worktree, command),
    })),
  ];
};

const decideStop = (input: StopInput): StopDecision => {
  if (input.agent_type !== 'implementer' || input.stop_hook_active) {
    return { block: null, notice: null };
  }
  const found = findStopBranch(input);
  if (found === null) return { block: null, notice: null };
  if ('notice' in found) return { block: null, notice: found.notice };
  return checkOnStop(input, checksFor(input, found), Date.now);
};

if (import.meta.main) {
  try {
    const { block, notice } = decideStop(JSON.parse(readFileSync(0, 'utf8')) as StopInput);
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
