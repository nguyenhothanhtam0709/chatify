// PreToolUse hook on Edit|Write: denies a write outside the Role's Writes (ADR 0012). `canWrite` is
// the one place that knows the Writes column's rules; the Diff-scope check reuses it. Any failure
// in the hook lets the call through.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { coversChange } from '../docs/covers.ts';
import { featureTip, gitContext, gitContextOfPath } from './git-context.ts';
import { repoPath } from './guard-reads.ts';
import { readScopeFile, scopeFacts, type ScopeFacts } from './scope-facts.ts';

export interface WriteFacts extends ScopeFacts {
  /** The five-digit number of the Spec the Task Branch belongs to, or null. */
  specNumber: string | null;
  /** The `kind:` in a repo file's front matter, or null when it has none. */
  kindOf: (path: string) => string | null;
  /** True when `path` is a Descriptive Doc whose `covers:` matches a file changed on the branch. */
  coveredByChange?: (path: string) => boolean;
}

const ALWAYS_WRITABLE = ['docs/laters.md', 'pnpm-lock.yaml'];

export const isPackageJson = (path: string) =>
  path === 'package.json' || path.endsWith('/package.json');

const inPackage = (path: string, name: string) =>
  path.startsWith(name === 'scripts' ? 'scripts/' : `packages/${name}/`);

const isOwnSpec = (path: string, facts: WriteFacts) =>
  facts.specStatus &&
  facts.specNumber !== null &&
  new RegExp(`^\\.scratch/${facts.specNumber}-[^/]+/spec\\.md$`).test(path);

/**
 * Why `role` may not write `path`, or null when it may. `path` is relative to the repo root, or
 * null when it lies outside the repo.
 */
export const canWrite = (
  path: string | null,
  role: string | undefined,
  facts: WriteFacts,
): string | null => {
  if (role === 'explorer') {
    return path === null ? null : `The explorer writes only outside the repo, not ${path}.`;
  }
  if (role === 'doc-sync') {
    return path !== null && facts.kindOf(path) === 'descriptive'
      ? null
      : `Doc Sync writes only files with \`kind: descriptive\` front matter, not ${path}.`;
  }
  if (role === 'doc-writer') {
    return path !== null && facts.writes.includes(path)
      ? null
      : `${path ?? 'A path outside the repo'} is not writable: the Doc Writer writes only its scope file's \`writes:\`, and ${path ?? 'this path'} is not in it.`;
  }
  if (role !== 'implementer' || path === null) return null;
  if (
    facts.packages.some((name) => inPackage(path, name)) ||
    facts.writes.includes(path) ||
    path === facts.ticket ||
    ALWAYS_WRITABLE.includes(path) ||
    isPackageJson(path) ||
    facts.kindOf(path) === 'generated' ||
    facts.coveredByChange?.(path) === true ||
    isOwnSpec(path, facts)
  ) {
    return null;
  }
  return (
    `${path} is outside this Ticket's Writes (packages: ${facts.packages.join(', ') || 'none'}). ` +
    `If the Ticket needs it, list it under Also writes; otherwise escalate.`
  );
};

interface HookInput {
  tool_input?: { file_path?: string };
  cwd?: string;
  agent_type?: string;
}

/** Reads a repo file from the checkout at `root`, or null when it can't. */
export const fromDisk =
  (root: string) =>
  (path: string): string | null => {
    try {
      return readFileSync(resolve(root, path), 'utf8');
    } catch {
      return null;
    }
  };

export const frontMatterKind = (read: (path: string) => string | null) => (path: string) => {
  const block = /^---\n([\s\S]*?)\n---/.exec(read(path) ?? '')?.[1] ?? '';
  return /^kind:\s*(\w+)\s*$/m.exec(block)?.[1] ?? null;
};

/** Whether a repo file is a Descriptive Doc that covers one of `changed`. */
export const coveredByChange =
  (read: (path: string) => string | null, changed: string[]) => (path: string) => {
    const text = read(path);
    return text !== null && coversChange(text, changed);
  };

/** The files changed since the Feature Branch tip, committed or not; empty when it can't tell. */
const changedSinceFeature = (cwd: string, specNumber: string | null): string[] => {
  try {
    const git = (...args: string[]) =>
      execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const tip = specNumber === null ? null : featureTip(cwd, specNumber);
    if (!tip) return [];
    const base = git('merge-base', tip, 'HEAD').trim();
    return [
      ...git('diff', '--name-only', '--no-renames', base).split('\n'),
      ...git('ls-files', '--others', '--exclude-standard').split('\n'),
    ].filter(Boolean);
  } catch {
    return [];
  }
};

const decideFor = (input: HookInput): string | null => {
  const filePath = input.tool_input?.file_path;
  if (!filePath || !input.agent_type) return null;
  const cwd = input.cwd ?? process.cwd();
  // The file says which checkout and branch it belongs to; `cwd` may be the main checkout while
  // the sub-agent edits its worktree. A file outside any repo falls back to `cwd`.
  const context = gitContextOfPath(filePath, cwd) ?? gitContext(cwd);
  if (context === null) return null;
  const { root, commonDir, branch } = context;
  const scope = readScopeFile(commonDir, branch);
  // No scope file means no Ticket to hold the Writes against.
  if (scope === null && input.agent_type === 'implementer') return null;
  const path = repoPath(filePath, { roots: [root, dirname(commonDir)], cwd, branch, scope });
  const specNumber = /^agent\/(\d{5})-/.exec(branch)?.[1] ?? null;
  return canWrite(path, input.agent_type, {
    ...scopeFacts(scope ?? []),
    specNumber,
    kindOf: frontMatterKind(fromDisk(root)),
    coveredByChange: coveredByChange(fromDisk(root), changedSinceFeature(root, specNumber)),
  });
};

if (import.meta.main) {
  try {
    const input = JSON.parse(readFileSync(0, 'utf8')) as HookInput;
    const reason = decideFor(input);
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
