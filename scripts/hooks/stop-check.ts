// SubagentStop hook: when an Implementer ends its turn, runs the Diff-scope check, then lint and
// typecheck of the scope's packages and the test files changed on the branch, so a breach or a
// failure reaches the agent before the PR does. Blocks the stop once; a timeout does not block.
// Fails open, like the other guards.
import { readFileSync } from 'node:fs';
import { BUDGET_MS, fastChecks, runChecks, type Check } from './fast-checks.ts';
import { diffScope } from './check-diff.ts';
import {
  featureTip,
  gitContext,
  gitOut,
  taskBranch,
  worktrees,
  type HookInput,
  type TaskBranch,
} from './git-context.ts';
import { scopeFacts } from './scope-facts.ts';

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
  const { failures, skipped } = runChecks(checks, now);
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
    ...fastChecks(worktree, scope, changed),
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
