// The facts in a branch's scope file, shared by the hooks that read the Ticket's boundary.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface ScopeFacts {
  /** The Ticket's repo path, or null for a branch with no Ticket. */
  ticket: string | null;
  /** Workspace packages the Ticket touches. */
  packages: string[];
  /** Exact repo paths the Ticket may write beyond its Role's normal Writes. */
  writes: string[];
  specStatus: boolean;
  browserCheck: boolean;
  worktree: boolean;
}

// A fact line is `<name>: <value>`. Any other line, such as an old-format glob, is no fact.
const rawFacts = (scope: string[]): Map<string, string> =>
  new Map(
    scope.flatMap((line) => {
      const match = /^([\w-]+):\s*(.*)$/.exec(line);
      return match?.[1] === undefined ? [] : [[match[1], (match[2] ?? '').trim()] as const];
    }),
  );

const list = (value: string | undefined): string[] =>
  (value ?? '').split(/\s+/).filter((word) => word !== '' && word !== 'none');

/** The six facts from the lines of a scope file. A missing line gives the empty value. */
export const scopeFacts = (scope: string[]): ScopeFacts => {
  const fact = rawFacts(scope);
  const ticket = fact.get('ticket');
  return {
    ticket: ticket === undefined || ticket === '' || ticket === 'none' ? null : ticket,
    packages: list(fact.get('packages')),
    writes: list(fact.get('writes')),
    specStatus: fact.get('spec-status') === 'yes',
    browserCheck: fact.get('browser-check') === 'yes',
    worktree: fact.get('worktree') === 'yes',
  };
};

/** The lines of `<git-common-dir>/scope/<branch>.txt`, or null when the branch has no scope file. */
export const readScopeFile = (commonDir: string, branch: string): string[] | null => {
  try {
    return readFileSync(join(commonDir, 'scope', `${branch}.txt`), 'utf8')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'));
  } catch {
    return null;
  }
};
