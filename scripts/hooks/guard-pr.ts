// PreToolUse hook on opening a PR, through the GitHub MCP tool or `gh pr create`: denies it while
// `pnpm docs:check` would fail, so a PR that runs outside `implement-spec` still can't leave the
// docs out of step. Runs the same steps as that script. A step that can't run (no node_modules in
// a new worktree) never blocks an agent.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { checkDiff, parseDiff, type Change } from './check-diff.ts';
import { frontMatterKind } from './guard-writes.ts';
import { readScopeFile, scopeFacts } from './scope-facts.ts';

export interface RunResult {
  status: number | null;
  output: string;
}

type Step = 'generate' | 'diff' | 'check' | 'scope';

interface HookInput {
  tool_name?: string;
  tool_input?: { command?: string };
  cwd?: string;
  agent_type?: string;
}

/** The hook also runs on every shell command, so only one that starts `gh pr create` counts. */
export const opensPr = ({ tool_name: tool, tool_input: input }: HookInput): boolean =>
  tool !== 'Bash' || /(?:^|&&|\|\||[;|\n])\s*gh\s+pr\s+create\b/.test(input?.command ?? '');

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
  const check = run('check');
  if (check.status === 1) {
    reasons.push(`pnpm docs:check failed. Fix these before opening the PR:\n${check.output}`);
  }
  return reasons.length > 0 ? reasons.join('\n\n') : null;
};

const git = (cwd: string, args: string[]) =>
  spawnSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

const gitOut = (cwd: string, args: string[]): string => {
  const result = git(cwd, args);
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
};

/** The Diff-scope check on the branch in `cwd`: status 1 lists the violations, null cannot run. */
const diffScope = (input: HookInput): RunResult => {
  try {
    const role = input.agent_type;
    const cwd = input.cwd ?? process.cwd();
    const [root = cwd, gitCommonDir = '.git', branch = ''] = gitOut(cwd, [
      'rev-parse',
      '--show-toplevel',
      '--git-common-dir',
      '--abbrev-ref',
      'HEAD',
    ]).split('\n');
    const specNumber = /^agent\/(\d{5})-/.exec(branch)?.[1] ?? null;
    if (!role || specNumber === null) return { status: 0, output: '' };
    const scope = readScopeFile(resolve(cwd, gitCommonDir), branch);
    // No scope file means no Ticket to hold the Writes against.
    if (scope === null && role === 'implementer') return { status: 0, output: '' };
    const facts = scopeFacts(scope ?? []);
    const tip = gitOut(cwd, ['branch', '-r', '--list', `origin/feat/${specNumber}-*`])
      .split('\n')[0]
      ?.trim();
    if (!tip) return { status: null, output: `No origin/feat/${specNumber}-* branch.` };
    const base = gitOut(cwd, ['merge-base', tip, 'HEAD']);
    const changes: Change[] = parseDiff(
      gitOut(root, ['diff', '-U0', '--no-renames', `${base}..HEAD`]),
    );
    const show = (rev: string, path: string) => {
      const result = git(root, ['show', `${rev}:${path}`]);
      return result.status === 0 ? result.stdout : null;
    };
    for (const change of changes) {
      if (change.path === 'package.json' || change.path.endsWith('/package.json')) {
        change.before = show(base, change.path);
        change.after = show('HEAD', change.path);
      }
    }
    let ticketText = '';
    try {
      ticketText = facts.ticket ? readFileSync(resolve(root, facts.ticket), 'utf8') : '';
    } catch {
      // An unreadable Ticket allows no dependency change.
    }
    const allowed = /^\*\*Allowed packages:\*\*\s*(.*)$/m.exec(ticketText)?.[1]?.trim() ?? '';
    const violations = checkDiff(changes, role, {
      ...facts,
      specNumber,
      kindOf: frontMatterKind(root),
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

const commands: Record<Exclude<Step, 'scope'>, [string, string[]]> = {
  generate: ['pnpm', ['-s', 'docs:generate']],
  diff: ['git', ['diff', '--exit-code', '--name-only', 'docs/architecture']],
  check: ['node', ['scripts/docs/check.ts']],
};

if (import.meta.main) {
  try {
    const input = JSON.parse(readFileSync(0, 'utf8')) as HookInput;
    const reason =
      opensPr(input) &&
      checkBeforePr((step) => {
        if (step === 'scope') return diffScope(input);
        const [command, args] = commands[step];
        const result = spawnSync(command, args, { cwd: input.cwd, encoding: 'utf8' });
        return { status: result.status, output: `${result.stdout}${result.stderr}`.trim() };
      });
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
