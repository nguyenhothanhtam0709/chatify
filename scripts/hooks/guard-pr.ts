// PreToolUse hook on opening a PR, through the GitHub MCP tool or `gh pr create`: denies it while
// `pnpm docs:check` would fail, so a PR that runs outside `implement-spec` still can't leave the
// docs out of step. Runs the same steps as that script. A step that can't run (no node_modules in
// a new worktree) never blocks an agent.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

export interface RunResult {
  status: number | null;
  output: string;
}

type Step = 'generate' | 'diff' | 'check';

interface HookInput {
  tool_name?: string;
  tool_input?: { command?: string };
  cwd?: string;
}

/** The hook also runs on every shell command, so only one that starts `gh pr create` counts. */
export const opensPr = ({ tool_name: tool, tool_input: input }: HookInput): boolean =>
  tool !== 'Bash' || /(?:^|&&|\|\||[;|\n])\s*gh\s+pr\s+create\b/.test(input?.command ?? '');

/** Why the PR should be denied, or null to let it through. */
export const checkBeforePr = (run: (step: Step) => RunResult): string | null => {
  if (run('generate').status === 0) {
    const diff = run('diff');
    if (diff.status === 1) {
      return `The Generated Docs differ from the code. Commit what pnpm docs:generate wrote:\n${diff.output}`;
    }
  }
  const check = run('check');
  return check.status === 1
    ? `pnpm docs:check failed. Fix these before opening the PR:\n${check.output}`
    : null;
};

const commands: Record<Step, [string, string[]]> = {
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
