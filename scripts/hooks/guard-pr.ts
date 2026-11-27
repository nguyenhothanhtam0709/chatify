// PreToolUse hook on opening a PR, through the GitHub MCP tool or `gh pr create`: denies it while
// `pnpm docs:check` would fail, so a PR that runs outside `implement-spec` still can't leave the
// docs out of step. Runs the same steps as that script. A step that can't run (no node_modules in
// a new worktree) never blocks an agent.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { docsNotUpdated } from '../docs/covers.ts';
import { diffScope } from './check-diff.ts';
import { BUDGET_MS, fastChecks, runChecks, type Check } from './fast-checks.ts';
import {
  gitContext,
  gitOut,
  readAtRef,
  sinceFeature,
  taskBranch,
  worktreeOf,
  type HookInput,
  type RunResult,
  type TaskBranch,
} from './git-context.ts';

type Step = 'generate' | 'diff' | 'check' | 'scope' | 'covers';

/** The hook also runs on every shell command, so only one that starts `gh pr create` counts. */
export const opensPr = ({ tool_name: tool, tool_input: input }: HookInput): boolean =>
  tool !== 'Bash' || /(?:^|&&|\|\||[;|\n])\s*gh\s+pr\s+create\b/.test(input?.command ?? '');

/** The PR body from the MCP tool's `body` or from `gh pr create --body`, or undefined. */
export const prBody = ({ tool_name: tool, tool_input: input }: HookInput): string | undefined => {
  if (tool !== 'Bash') return input?.body;
  const flag = /(?:--body|-b)(?:\s+|=)(["']?)/.exec(input?.command ?? '');
  return flag ? (input?.command ?? '').slice(flag.index + flag[0].length) : undefined;
};

/** Why the PR should be denied, or null to let it through. */
export const checkBeforePr = (run: (step: Step) => RunResult): string | null => {
  const reasons: string[] = [];
  const scope = run('scope');
  if (scope.status === 1) {
    reasons.push(`The branch changed files outside its Role's Writes:\n${scope.output}`);
  }
  if (run('generate').status === 0) {
    const diff = run('diff');
    if (diff.status === 1) {
      reasons.push(
        `The Generated Docs differ from the code. Commit what pnpm docs:generate wrote:\n${diff.output}`,
      );
    }
  }
  const covers = run('covers');
  if (covers.status === 1) {
    reasons.push(
      `The PR changes code a Descriptive Doc covers, and the doc is unchanged:\n${covers.output}\n` +
        'Update the doc, or if that is deliberate add to the PR body a line for each:\n' +
        'Doc not updated: <doc path> — <reason>',
    );
  }
  const check = run('check');
  if (check.status === 1) {
    reasons.push(`pnpm docs:check failed. Fix these before opening the PR:\n${check.output}`);
  }
  return reasons.length > 0 ? reasons.join('\n\n') : null;
};

const unquote = (word: string) => word.replace(/^(["'])(.*)\1$/, '$2');

/**
 * The PR's head branch: the MCP tool's `head`, or `gh pr create --head` (or `-H`). An
 * `owner:branch` head gives the branch. Null when none is given.
 */
export const prHead = ({ tool_name: tool, tool_input: input }: HookInput): string | null => {
  const head =
    tool === 'Bash'
      ? /(?:^|\s)(?:--head|-H)(?:\s+|=)("[^"]*"|'[^']*'|\S+)/.exec(input?.command ?? '')?.[1]
      : input?.head;
  const branch = head === undefined ? '' : unquote(head).replace(/^[^:]*:/, '');
  return branch === '' ? null : branch;
};

const CD = /^\s*cd\s+("[^"]*"|'[^']*'|[^\s;&|]+)\s*&&/;

/** Where a shell command runs: `cwd`, after any leading `cd <dir> &&`. */
const commandDir = ({ tool_name: tool, tool_input: input }: HookInput, cwd: string): string => {
  if (tool !== 'Bash') return cwd;
  let dir = cwd;
  let rest = input?.command ?? '';
  for (let match = CD.exec(rest); match; match = CD.exec(rest)) {
    dir = resolve(dir, unquote(match[1] ?? ''));
    rest = rest.slice(match[0].length);
  }
  return dir;
};

/**
 * The branch a PR opens from: its head, else the branch where the command runs. A sub-agent in
 * a worktree gets the main checkout as `cwd` (Ticket 08), so `cwd` alone can't be trusted. Null
 * when that directory is not in a repo.
 */
export const findTaskBranch = (input: HookInput): TaskBranch | null => {
  const dir = commandDir(input, input.cwd ?? process.cwd());
  const context = gitContext(dir);
  if (context === null) return null;
  const branch = prHead(input) ?? context.branch;
  return taskBranch(branch, context.commonDir, worktreeOf(dir, branch) ?? context.root);
};

/** Why an Implementer's PR has no Task Branch to check, or null when it has one. */
export const missingTaskBranch = (task: TaskBranch): string | null => {
  const problem =
    task.specNumber === null
      ? `its head ${task.branch} is not an agent/NNNNN-… branch`
      : task.scope === null
        ? `${task.branch} has no scope file`
        : null;
  return problem === null
    ? null
    : `The PR guard can't find its Task Branch: ${problem}. Open the PR from the Task Branch, ` +
        'naming it as the head (head for the MCP tool, --head for gh pr create).';
};

/** The Descriptive Docs the branch's changes leave out: status 1 lists them, null cannot run. */
const coversCheck = (input: HookInput, task: TaskBranch): RunResult => {
  try {
    const { specNumber, worktree, branch } = task;
    if (!input.agent_type || specNumber === null) return { status: 0, output: '' };
    const since = sinceFeature(task, specNumber);
    if (since === null) return { status: null, output: `No origin/feat/${specNumber}-* branch.` };
    const changed = gitOut(worktree, ['diff', '--name-only', '--no-renames', since.range])
      .split('\n')
      .filter(Boolean);
    const paths = gitOut(worktree, ['ls-tree', '-r', '--name-only', branch])
      .split('\n')
      .filter((path) => path.endsWith('.md'));
    const docs = [...readAtRef(worktree, branch, paths)].map(([path, content]) => ({
      path,
      content,
    }));
    const missed = docsNotUpdated(changed, docs, prBody(input));
    return { status: missed.length > 0 ? 1 : 0, output: missed.join('\n') };
  } catch (error) {
    return { status: null, output: String(error) };
  }
};

const commands: Record<Exclude<Step, 'scope' | 'covers'>, [string, string[]]> = {
  generate: ['pnpm', ['-s', 'docs:generate']],
  diff: ['git', ['diff', '--exit-code', '--name-only', 'docs/architecture']],
  check: ['node', ['scripts/docs/check.ts']],
};

export interface FastDecision {
  /** Why the PR is denied, or null. */
  reason: string | null;
  /** A report that does not deny (a check ran out of the budget), or null. */
  notice: string | null;
}

/** Runs the fast checks of an Implementer's PR with what is left of the budget since `startedAt`, the start of the hook. A timeout does not deny. */
export const checkFastOnPr = (
  input: HookInput,
  checks: Check[],
  now: () => number,
  startedAt: number,
): FastDecision => {
  if (input.agent_type !== 'implementer') return { reason: null, notice: null };
  const { failures, skipped } = runChecks(checks, now, startedAt);
  return {
    reason:
      failures.length > 0
        ? `The fast checks failed. Fix these before opening the PR:\n\n${failures.join('\n\n')}`
        : null,
    notice:
      skipped.length > 0
        ? `The PR guard ran out of its ${BUDGET_MS / 1000} s budget and did not run: ${skipped.join(', ')}.`
        : null,
  };
};

/** The fast checks for the Task Branch, in its worktree. None when there is nothing to diff. */
const fastChecksFor = (task: TaskBranch): Check[] => {
  const { specNumber, scope, worktree } = task;
  if (specNumber === null || scope === null) return [];
  const since = sinceFeature(task, specNumber);
  if (since === null) return [];
  const changed = gitOut(worktree, ['diff', '--name-only', '--no-renames', since.range])
    .split('\n')
    .filter(Boolean);
  return fastChecks(worktree, scope, changed);
};

/** Why the PR should be denied, or null. Null too when the guard can't run (it fails open). */
const decide = (input: HookInput): FastDecision => {
  const startedAt = Date.now();
  if (!opensPr(input)) return { reason: null, notice: null };
  const task = findTaskBranch(input);
  if (input.agent_type === 'implementer' && task !== null) {
    const missing = missingTaskBranch(task);
    if (missing !== null) return { reason: missing, notice: null };
  }
  const where = task?.worktree ?? input.cwd;
  const docs = checkBeforePr((step) => {
    if (step === 'scope') return task ? diffScope(input.agent_type, task) : ok;
    if (step === 'covers') return task ? coversCheck(input, task) : ok;
    const [command, args] = commands[step];
    const result = spawnSync(command, args, { cwd: where, encoding: 'utf8' });
    return { status: result.status, output: `${result.stdout}${result.stderr}`.trim() };
  });
  let fast: FastDecision = { reason: null, notice: null };
  try {
    fast = task ? checkFastOnPr(input, fastChecksFor(task), Date.now, startedAt) : fast;
  } catch {
    // The fast checks can't run: the PR is not denied for that.
  }
  const reasons = [docs, fast.reason].filter((reason) => reason !== null);
  return { reason: reasons.length > 0 ? reasons.join('\n\n') : null, notice: fast.notice };
};

const ok: RunResult = { status: 0, output: '' };

if (import.meta.main) {
  try {
    const { reason, notice } = decide(JSON.parse(readFileSync(0, 'utf8')) as HookInput);
    if (reason) {
      process.stdout.write(
        JSON.stringify({
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'deny',
            permissionDecisionReason: reason,
          },
        }),
      );
    } else if (notice !== null) {
      process.stdout.write(JSON.stringify({ systemMessage: notice }));
      process.stderr.write(`${notice}\n`);
    }
  } catch {
    // Fail open: a broken guard must never block an agent.
  }
}
