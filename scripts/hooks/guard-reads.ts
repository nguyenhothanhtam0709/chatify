// PreToolUse hook: denies whole-file reads an agent doesn't need, to save tokens. Cost control, not
// security: searching and short reads stay allowed, so a brief that is missing something never
// leaves an agent stuck. Any failure in here lets the call through.
import { readFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { gitContext, gitContextOfPath } from './git-context.ts';
import { readScopeFile, scopeFacts } from './scope-facts.ts';

const MAX_READ_LINES = 80;

// Large files nobody needs whole, on any branch.
const ALWAYS_GUARDED = ['docs/laters.md', 'packages/api/drizzle/meta/**', 'pnpm-lock.yaml'];
// On a branch with a scope file, these are readable only when its facts allow them. Source code is
// never guarded.
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
  /** Lines of the branch's scope file, read as `<fact>: <value>`, or null when it has none. */
  scope: string[] | null;
}

interface HookInput {
  tool_name?: string;
  tool_input?: { file_path?: string; limit?: number; command?: string };
  cwd?: string;
  /** The sub-agent's type, absent in the main session. */
  agent_type?: string;
}

const NAME = /^[\w-]+$/;

// The docs a scope file's facts make readable whole. A missing fact means no.
const docsFromFacts = (scope: string[]): string[] => {
  const { packages, browserCheck, worktree } = scopeFacts(scope);
  const names = packages.filter((name) => NAME.test(name));
  return [
    ...names.flatMap((name) => [`packages/${name}/AGENTS.md`, `docs/conventions/${name}.md`]),
    ...(names.length > 0 ? ['docs/conventions/general.md'] : []),
    ...(browserCheck ? ['docs/workflow/browser-check.md'] : []),
    ...(worktree ? ['docs/workflow/worktree.md'] : []),
  ];
};

const roleFile = (agentType: string | undefined): string[] =>
  agentType !== undefined && NAME.test(agentType) ? [`docs/factory/roles/${agentType}.md`] : [];

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
export const repoPath = (path: string, context: ReadContext): string | null => {
  const absolute = isAbsolute(path) ? path : resolve(context.cwd, path);
  for (const root of context.roots) {
    const rel = relative(root, absolute);
    if (!rel.startsWith('..') && !isAbsolute(rel)) {
      return rel.replace(/^\.claude\/worktrees\/[^/]+\//, '');
    }
  }
  return null;
};

// Globs readable whole inside a scope: the always-allowed docs, the Ticket, the docs the facts
// allow and the sub-agent's own Role file.
const inScope = (context: ReadContext, agentType: string | undefined): string[] => {
  const ticket = ticketGlob(context.branch);
  return [
    ...ALWAYS_IN_SCOPE,
    ...docsFromFacts(context.scope ?? []),
    ...(ticket ? [ticket] : []),
    ...roleFile(agentType),
  ];
};

const guardedFile = (path: string, context: ReadContext, allowed: string[]): boolean => {
  if (matchesAny(path, ALWAYS_GUARDED)) return true;
  return context.scope !== null && matchesAny(path, SCOPED_DOCS) && !matchesAny(path, allowed);
};

// A shell glob is guarded if it can reach a guarded file. Inside a scope it is denied without
// expanding it, because one match outside the scope is enough to waste the read. A glob whose own
// text matches the scope can only expand to files in the scope.
const guardedGlob = (glob: string, context: ReadContext, allowed: string[]): boolean => {
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
    context.scope !== null && matchesAny(`${fixedPart}x`, SCOPED_DOCS) && !matchesAny(glob, allowed)
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

const decideBash = (command: string, context: ReadContext, allowed: string[]): string | null => {
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
          ? guardedGlob(path, context, allowed)
          : guardedFile(path, context, allowed);
        if (guarded) return denial(path, context);
      }
    }
  }
  return null;
};

/** Why this tool call should be denied, or null to let it through. */
export const decide = (input: HookInput, context: ReadContext): string | null => {
  const { file_path: filePath, limit, command } = input.tool_input ?? {};
  const allowed = inScope(context, input.agent_type);
  if (input.tool_name === 'Bash' && command) return decideBash(command, context, allowed);
  if (input.tool_name !== 'Read' || !filePath) return null;
  if (limit !== undefined && limit <= MAX_READ_LINES) return null;
  const path = repoPath(filePath, context);
  return path !== null && guardedFile(path, context, allowed) ? denial(path, context) : null;
};

/**
 * The checkout and scope the call is judged in. A `Read` resolves from its file, since a sub-agent
 * in a worktree gets the main checkout as `cwd`; a file outside any repo, and Bash, resolve from
 * `cwd`.
 */
const contextFor = (input: HookInput): ReadContext | null => {
  const cwd = input.cwd ?? process.cwd();
  const filePath = input.tool_name === 'Read' ? input.tool_input?.file_path : undefined;
  const context = (filePath ? gitContextOfPath(filePath, cwd) : null) ?? gitContext(cwd);
  if (context === null) return null;
  const { root, commonDir, branch } = context;
  return {
    roots: [root, dirname(commonDir)],
    cwd,
    branch,
    scope: readScopeFile(commonDir, branch),
  };
};

if (import.meta.main) {
  try {
    const input = JSON.parse(readFileSync(0, 'utf8')) as HookInput;
    const context = contextFor(input);
    const reason = context && decide(input, context);
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
