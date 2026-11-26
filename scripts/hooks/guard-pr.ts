// PreToolUse hook on opening a PR, through the GitHub MCP tool or `gh pr create`: denies it while
// `pnpm docs:check` would fail, so a PR that runs outside `implement-spec` still can't leave the
// docs out of step. Runs the same steps as that script. A step that can't run (no node_modules in
// a new worktree) never blocks an agent.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { docsNotUpdated } from '../docs/covers.ts';
import { checkDiff, parseDiff, type Change } from './check-diff.ts';
import { featureTip, gitContext, readAtRef, readerAtRef, worktreeOf } from './git-context.ts';
import { coveredByChange, frontMatterKind } from './guard-writes.ts';
import { readScopeFile, scopeFacts } from './scope-facts.ts';

export interface RunResult {
  status: number | null;
  output: string;
}

type Step = 'generate' | 'diff' | 'check' | 'scope' | 'covers';

export interface HookInput {
  tool_name?: string;
  tool_input?: { command?: string; body?: string; head?: string };
  cwd?: string;
  agent_type?: string;
}

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

const git = (cwd: string, args: string[]) =>
  spawnSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

export const gitOut = (cwd: string, args: string[]): string => {
  const result = git(cwd, args);
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
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

export interface TaskBranch {
  /** The branch the PR opens from. */
  branch: string;
  /** The Spec number of an `agent/NNNNN-…` branch, or null. */
  specNumber: string | null;
  commonDir: string;
  /** The lines of the branch's scope file, or null when it has none. */
  scope: string[] | null;
  /** The worktree checked out on the branch, or the main checkout: where commands run. */
  worktree: string;
}

/** The facts of `branch`, checked out in `worktree` (or the main checkout). */
export const taskBranch = (branch: string, commonDir: string, worktree: string): TaskBranch => ({
  branch,
  specNumber: /^agent\/(\d{5})-/.exec(branch)?.[1] ?? null,
  commonDir,
  scope: readScopeFile(commonDir, branch),
  worktree,
});

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

/** The Feature Branch tip's merge-base with the branch and the diff since, read from refs only. */
const sinceFeature = (task: TaskBranch, specNumber: string) => {
  const tip = featureTip(task.worktree, specNumber);
  if (tip === null) return null;
  const base = gitOut(task.worktree, ['merge-base', tip, task.branch]);
  return { base, range: `${base}..${task.branch}` };
};

/** The Diff-scope check on the Task Branch: status 1 lists the violations, null cannot run. */
export const diffScope = (role: string | undefined, task: TaskBranch): RunResult => {
  try {
    const { specNumber, scope, worktree, branch } = task;
    if (!role || specNumber === null) return { status: 0, output: '' };
    // No scope file means no Ticket to hold the Writes against.
    if (scope === null && role === 'implementer') return { status: 0, output: '' };
    const facts = scopeFacts(scope ?? []);
    const since = sinceFeature(task, specNumber);
    if (since === null) return { status: null, output: `No origin/feat/${specNumber}-* branch.` };
    const changes: Change[] = parseDiff(
      gitOut(worktree, ['diff', '-U0', '--no-renames', since.range]),
    );
    const atBranch = readerAtRef(worktree, branch);
    for (const change of changes) {
      if (change.path === 'package.json' || change.path.endsWith('/package.json')) {
        change.before = readerAtRef(worktree, since.base)(change.path);
        change.after = atBranch(change.path);
      }
    }
    // An unreadable Ticket allows no dependency change.
    const ticketText = (facts.ticket ? atBranch(facts.ticket) : null) ?? '';
    const allowed = /^\*\*Allowed packages:\*\*\s*(.*)$/m.exec(ticketText)?.[1]?.trim() ?? '';
    const violations = checkDiff(changes, role, {
      ...facts,
      specNumber,
      kindOf: frontMatterKind(atBranch),
      coveredByChange: coveredByChange(
        atBranch,
        changes.map((change) => change.path),
      ),
      allowsDependencies: allowed !== '' && allowed.toLowerCase() !== 'none',
    });
    return {
      status: violations.length > 0 ? 1 : 0,
      output: violations.map((v) => `${v.file}: ${v.reason}`).join('\n'),
    };
  } catch (error) {
    return { status: null, output: String(error) };
  }
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

/** Why the PR should be denied, or null. Null too when the guard can't run (it fails open). */
const decide = (input: HookInput): string | null => {
  if (!opensPr(input)) return null;
  const task = findTaskBranch(input);
  if (input.agent_type === 'implementer' && task !== null) {
    const missing = missingTaskBranch(task);
    if (missing !== null) return missing;
  }
  const where = task?.worktree ?? input.cwd;
  return checkBeforePr((step) => {
    if (step === 'scope') return task ? diffScope(input.agent_type, task) : ok;
    if (step === 'covers') return task ? coversCheck(input, task) : ok;
    const [command, args] = commands[step];
    const result = spawnSync(command, args, { cwd: where, encoding: 'utf8' });
    return { status: result.status, output: `${result.stdout}${result.stderr}`.trim() };
  });
};

const ok: RunResult = { status: 0, output: '' };

if (import.meta.main) {
  try {
    const reason = decide(JSON.parse(readFileSync(0, 'utf8')) as HookInput);
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
    }
  } catch {
    // Fail open: a broken guard must never block an agent.
  }
}
