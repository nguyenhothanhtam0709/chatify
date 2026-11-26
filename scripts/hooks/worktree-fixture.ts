// A temp repo shaped like Ticket 08's probes: the main checkout on a Feature Branch and a second
// worktree on an `agent/` Task Branch with a scope file. Used by the hook tests.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

export interface WorktreeFixture {
  /** The main checkout, on `feat/00007-x`. */
  main: string;
  /** The second worktree, on `agent/00007-01-y`. */
  worktree: string;
  branch: string;
  /** Runs git in `cwd` (the worktree by default). */
  git: (args: string[], cwd?: string) => string;
  /** Writes a file under `root` (the worktree by default), creating its folders. */
  write: (path: string, text: string, root?: string) => void;
  /** Commits every change in the worktree. */
  commit: (message: string) => void;
  /** Adds another worktree on `branch` with the given scope file. */
  addWorktree: (name: string, branch: string, scope: string | null) => string;
}

export const worktreeFixture = (
  scope = 'ticket: none\npackages: scripts\nworktree: yes\n',
): WorktreeFixture => {
  const main = realpathSync(mkdtempSync(join(tmpdir(), 'hooks-worktree-')));
  let worktree = main;
  const git = (args: string[], cwd = worktree) =>
    execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  const write = (path: string, text: string, root = worktree) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  const addWorktree = (name: string, branch: string, scopeText: string | null) => {
    const path = join(main, '.claude/worktrees', name);
    git(['worktree', 'add', '-q', '-b', branch, path], main);
    if (scopeText !== null) write(`.git/scope/${branch}.txt`, scopeText, main);
    return path;
  };
  git(['init', '-q', '-b', 'feat/00007-x'], main);
  write('.gitignore', '.claude/worktrees/\n', main);
  write('scripts/a.ts', '', main);
  write('docs/flow.md', '---\nkind: descriptive\ncovers: [scripts/**]\n---\n', main);
  write('docs/other.md', 'other\n', main);
  git(['add', '.'], main);
  git(['commit', '-q', '-m', 'base'], main);
  git(['update-ref', 'refs/remotes/origin/feat/00007-x', 'HEAD'], main);
  const branch = 'agent/00007-01-y';
  worktree = addWorktree('agent-1', branch, scope);
  return {
    main,
    worktree,
    branch,
    git,
    write,
    commit: (message) => {
      git(['add', '.']);
      git(['commit', '-q', '-m', message]);
    },
    addWorktree,
  };
};
