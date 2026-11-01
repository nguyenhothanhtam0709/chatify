// PreToolUse hook: denies whole-file reads an agent doesn't need, to save tokens. Cost control, not
// security: searching and short reads stay allowed, so a brief that is missing something never
// leaves an agent stuck. Any failure in here lets the call through.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';

const MAX_READ_LINES = 80;

// Large files nobody needs whole, on any branch.
const ALWAYS_GUARDED = ['docs/laters.md', 'packages/api/drizzle/meta/**', 'pnpm-lock.yaml'];
// On a branch with a scope file, these are readable only when listed. Source code is never guarded.
const SCOPED_DOCS = ['docs/**', '.scratch/**', 'GLOSSARY*', 'README.md', 'packages/*/AGENTS.md'];
// Every Ticket needs these. `spec.md` is left out on purpose: read only the sections the brief names.
const ALWAYS_IN_SCOPE = [
  'docs/workflow/definition-of-done.md',
  'docs/workflow/git-workflow.md',
  'docs/workflow/testing-policy.md',
  'docs/workflow/escalation.md',
  'docs/workflow/no-assumptions.md',
];

export interface ReadContext {
  /** Checkouts the path may sit in: the current worktree and the main checkout. */
  roots: string[];
  cwd: string;
  branch: string;
  /** Globs from the branch's scope file, or null when it has none. */
  scope: string[] | null;
}

interface HookInput {
  tool_name?: string;
  tool_input?: { file_path?: string; limit?: number; command?: string };
  cwd?: string;
}

const globToRegExp = (glob: string): RegExp => {
  const source = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '\0')
    .replace(/\*/g, '[^/]*')
    .replace(/\0/g, '.*');
  return new RegExp(`^${source}$`);
};

const matchesAny = (path: string, globs: string[]) =>
  globs.some((glob) => globToRegExp(glob).test(path));

const ticketGlob = (branch: string): string | null => {
  const match = /^agent\/(\d{5})-(\d{2})-/.exec(branch);
  return match ? `.scratch/${match[1]}-*/issues/${match[2]}-*.md` : null;
};

// The path relative to its checkout, or null when it is outside the repo.
const repoPath = (path: string, context: ReadContext): string | null => {
  const absolute = isAbsolute(path) ? path : resolve(context.cwd, path);
  for (const root of context.roots) {
    const rel = relative(root, absolute);
    if (!rel.startsWith('..') && !isAbsolute(rel)) {
      return rel.replace(/^\.claude\/worktrees\/[^/]+\//, '');
    }
  }
  return null;
};

const allowedInScope = (path: string, context: ReadContext): boolean => {
  const ticket = ticketGlob(context.branch);
  return matchesAny(path, [
    ...ALWAYS_IN_SCOPE,
    ...(context.scope ?? []),
    ...(ticket ? [ticket] : []),
  ]);
};

const guardedFile = (path: string, context: ReadContext): boolean => {
  if (matchesAny(path, ALWAYS_GUARDED)) return true;
  return context.scope !== null && matchesAny(path, SCOPED_DOCS) && !allowedInScope(path, context);
};

// A shell glob is guarded if it can reach a guarded file. Inside a scope it is denied without
// expanding it, because one match outside the scope is enough to waste the read. A glob whose own
// text matches the scope can only expand to files in the scope.
const guardedGlob = (glob: string, context: ReadContext): boolean => {
  const pattern = globToRegExp(glob);
  if (ALWAYS_GUARDED.some((guarded) => pattern.test(guarded))) return true;
  const fixedPart = glob.slice(0, glob.search(/[*?[]/));
  if (
    ALWAYS_GUARDED.some(
      (guarded) => guarded.endsWith('/**') && fixedPart.startsWith(guarded.slice(0, -2)),
    )
  ) {
    return true;
  }
  return (
    context.scope !== null &&
    matchesAny(`${fixedPart}x`, SCOPED_DOCS) &&
    !allowedInScope(glob, context)
  );
};

const denial = (path: string, context: ReadContext): string =>
  `${path} is not needed whole${context.scope === null ? '' : ' for this Ticket'}. ` +
  `Run grep -n '^#' on it and read only the section you need (Read with a limit of at most ${MAX_READ_LINES} lines). ` +
  (path === 'docs/laters.md' ? `To add an entry, append with cat >>. ` : '') +
  `If you read a file outside your scope, say so in the PR body so the scope can be fixed.`;

const unquote = (word: string): string => word.replace(/^['"]|['"]$/g, '');

// A loop variable stands for each word of its list; anything else is left as written.
const expandLoopVariable = (arg: string, loops: Map<string, string[]>): string[] => {
  const name = /\$\{?(\w+)\}?/.exec(arg);
  const values = name?.[1] === undefined ? undefined : loops.get(name[1]);
  return name && values ? values.map((value) => arg.replace(name[0], value)) : [arg];
};

const decideBash = (command: string, context: ReadContext): string | null => {
  let cwd = context.cwd;
  const loops = new Map<string, string[]>();
  for (const segment of command.split(/&&|\|\||[;|\n]/)) {
    const words = segment
      .replace(/<<-?\s*\S+/g, ' ')
      .replace(/\d?>>?\s*\S+/g, ' ')
      .trim()
      .replace(/^(?:do|then|else|elif|if|while|until)\s+/, '')
      .split(/\s+/);
    const [first = '', second = '', third] = words;
    if (first === 'for' && third === 'in') {
      loops.set(second, words.slice(3).map(unquote));
      continue;
    }
    if (first === 'cd' && second && !/^-|\$/.test(second)) {
      cwd = resolve(cwd, unquote(second));
      continue;
    }
    if (!['cat', 'less', 'more'].includes(first)) continue;
    for (const word of words.slice(1)) {
      if (word.startsWith('-')) continue;
      for (const arg of expandLoopVariable(unquote(word), loops)) {
        const path = repoPath(arg, { ...context, cwd });
        if (path === null) continue;
        const guarded = /[*?[]/.test(path)
          ? guardedGlob(path, context)
          : guardedFile(path, context);
        if (guarded) return denial(path, context);
      }
    }
  }
  return null;
};

/** Why this tool call should be denied, or null to let it through. */
export const decide = (input: HookInput, context: ReadContext): string | null => {
  const { file_path: filePath, limit, command } = input.tool_input ?? {};
  if (input.tool_name === 'Bash' && command) return decideBash(command, context);
  if (input.tool_name !== 'Read' || !filePath) return null;
  if (limit !== undefined && limit <= MAX_READ_LINES) return null;
  const path = repoPath(filePath, context);
  return path !== null && guardedFile(path, context) ? denial(path, context) : null;
};

const readScope = (commonDir: string, branch: string): string[] | null => {
  try {
    return readFileSync(join(commonDir, 'read-scope', `${branch}.txt`), 'utf8')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'));
  } catch {
    return null;
  }
};

const contextFor = (cwd: string): ReadContext => {
  const [root = cwd, gitCommonDir = '.git', branch = ''] = execFileSync(
    'git',
    ['rev-parse', '--show-toplevel', '--git-common-dir', '--abbrev-ref', 'HEAD'],
    { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
  )
    .trim()
    .split('\n');
  const commonDir = resolve(cwd, gitCommonDir);
  return { roots: [root, dirname(commonDir)], cwd, branch, scope: readScope(commonDir, branch) };
};

if (import.meta.main) {
  try {
    const input = JSON.parse(readFileSync(0, 'utf8')) as HookInput;
    const reason = decide(input, contextFor(input.cwd ?? process.cwd()));
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
