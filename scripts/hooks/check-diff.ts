// The Diff-scope check (ADR 0012): every file changed on a Task Branch against the Role's Writes,
// whatever made the change. `canWrite` holds the Writes; this adds the rules only a diff shows.
// `checkDiff` is pure: it takes the changes in. `diffScope` reads them from git for a Task Branch.
import {
  gitOut,
  readerAtRef,
  sinceFeature,
  type RunResult,
  type TaskBranch,
} from './git-context.ts';
import {
  canWrite,
  coveredByChange,
  frontMatterKind,
  isPackageJson,
  type WriteFacts,
} from './guard-writes.ts';
import { scopeFacts } from './scope-facts.ts';

export interface Change {
  /** Repo-relative path. */
  path: string;
  /** Lines added and removed against the Feature Branch tip, without the `+` / `-`. */
  added: string[];
  removed: string[];
  /** For a `package.json`: its text at the Feature Branch tip and now (null when absent). */
  before?: string | null;
  after?: string | null;
}

export interface DiffFacts extends WriteFacts {
  /** True when the Ticket's Allowed packages is not `None`. */
  allowsDependencies: boolean;
}

export interface Violation {
  file: string;
  reason: string;
}

const DEPENDENCY_FIELDS = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
];

const parse = (text: string | null | undefined): Record<string, unknown> => {
  try {
    return text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    return {};
  }
};

/** The fields of a `package.json` that differ between its two versions, split by kind. */
const changedFields = (change: Change) => {
  const before = parse(change.before);
  const after = parse(change.after);
  const changed = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(
    (key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]),
  );
  return {
    dependencies: changed.filter((key) => DEPENDENCY_FIELDS.includes(key)),
    other: changed.filter((key) => !DEPENDENCY_FIELDS.includes(key)),
  };
};

const diffOnlyReason = (change: Change, facts: DiffFacts): string | null => {
  const { path } = change;
  if (path === 'docs/laters.md') {
    return change.removed.length > 0 && !facts.writes.includes(path)
      ? 'docs/laters.md only gains lines; a line was removed or changed.'
      : null;
  }
  if (/^\.scratch\/[^/]+\/spec\.md$/.test(path)) {
    const lines = [...change.added, ...change.removed];
    return lines.every((line) => line.startsWith('Status:'))
      ? null
      : 'A Spec changes only on its `Status:` line.';
  }
  if (path === 'pnpm-lock.yaml') {
    return facts.allowsDependencies
      ? null
      : "The lockfile changes only when the Ticket's Allowed packages is not None.";
  }
  if (isPackageJson(path)) {
    const { dependencies, other } = changedFields(change);
    if (dependencies.length > 0 && !facts.allowsDependencies) {
      return `${dependencies.join(', ')} changed but the Ticket's Allowed packages is None.`;
    }
    if (other.length > 0 && !facts.writes.includes(path)) {
      return `${other.join(', ')} changed but ${path} is not in the Ticket's writes.`;
    }
  }
  return null;
};

/** Every changed file the Role may not change, with the reason. No `role` (the main session): none. */
export const checkDiff = (
  changes: Change[],
  role: string | undefined,
  facts: DiffFacts,
): Violation[] => {
  if (!role) return [];
  return changes.flatMap((change) => {
    const reason = canWrite(change.path, role, facts) ?? diffOnlyReason(change, facts);
    return reason === null ? [] : [{ file: change.path, reason }];
  });
};

/** The changes in the output of `git diff -U0`. */
export const parseDiff = (text: string): Change[] => {
  const changes: Change[] = [];
  let current: Change | undefined;
  let inHunk = false;
  for (const line of text.split('\n')) {
    if (line.startsWith('diff --git ')) {
      current = { path: line.slice(line.lastIndexOf(' b/') + 3), added: [], removed: [] };
      changes.push(current);
      inHunk = false;
    } else if (line.startsWith('@@')) {
      inHunk = true;
    } else if (!current || !inHunk) {
      continue;
    } else if (line.startsWith('+')) {
      current.added.push(line.slice(1));
    } else if (line.startsWith('-')) {
      current.removed.push(line.slice(1));
    }
  }
  return changes;
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
      if (isPackageJson(change.path)) {
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
