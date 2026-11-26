// Where a hook's Task Branch lives. A sub-agent in a worktree gets the main checkout as its hook
// `cwd` (Ticket 08), so the hooks resolve the branch from a file path, a PR head or the worktree
// list instead of trusting `cwd`.
import { spawnSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';

export interface GitContext {
  /** The root of the checkout the directory sits in: a worktree or the main checkout. */
  root: string;
  /** The git dir every worktree shares, where `scope/` lives. */
  commonDir: string;
  branch: string;
}

const git = (cwd: string, args: string[]): string | null => {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  return result.status === 0 ? result.stdout : null;
};

/** The checkout, shared git dir and branch of `dir`, or null when it is not in a repo. */
export const gitContext = (dir: string): GitContext | null => {
  if (!existsSync(dir)) return null;
  const out = git(dir, [
    'rev-parse',
    '--show-toplevel',
    '--git-common-dir',
    '--abbrev-ref',
    'HEAD',
  ]);
  const [root, commonDir, branch] = out?.trim().split('\n') ?? [];
  if (!root || !commonDir || !branch) return null;
  return { root, commonDir: resolve(dir, commonDir), branch };
};

const nearestDir = (path: string): string => {
  let dir = path;
  while (!existsSync(dir) || !statSync(dir).isDirectory()) {
    const parent = dirname(dir);
    if (parent === dir) return dir;
    dir = parent;
  }
  return dir;
};

/**
 * The git context of the file at `path` (relative paths against `cwd`): its directory, or the
 * nearest existing parent for a file not yet created.
 */
export const gitContextOfPath = (path: string, cwd: string): GitContext | null =>
  gitContext(nearestDir(dirname(isAbsolute(path) ? path : resolve(cwd, path))));

export interface Worktree {
  path: string;
  /** The branch checked out there, or null for a detached HEAD. */
  branch: string | null;
}

/** Every worktree of the repo `dir` is in, the main checkout first. Empty when git fails. */
export const worktrees = (dir: string): Worktree[] =>
  (git(dir, ['worktree', 'list', '--porcelain']) ?? '').split('\n\n').flatMap((block) => {
    const path = /^worktree (.+)$/m.exec(block)?.[1];
    const branch = /^branch refs\/heads\/(.+)$/m.exec(block)?.[1] ?? null;
    return path ? [{ path, branch }] : [];
  });

/** The worktree checked out on `branch`, or the main checkout when none is. */
export const worktreeOf = (dir: string, branch: string): string | null => {
  const all = worktrees(dir);
  return (all.find((tree) => tree.branch === branch) ?? all[0])?.path ?? null;
};

/**
 * The text of each of `paths` at `ref`, read in one `git cat-file --batch`, so a check needs no
 * worktree on the branch. A path missing at `ref` is left out.
 */
export const readAtRef = (dir: string, ref: string, paths: string[]): Map<string, string> => {
  const files = new Map<string, string>();
  if (paths.length === 0) return files;
  const result = spawnSync('git', ['cat-file', '--batch'], {
    cwd: dir,
    input: paths.map((path) => `${ref}:${path}\n`).join(''),
    maxBuffer: 256 * 1024 * 1024,
  });
  if (result.status !== 0) return files;
  const out = result.stdout;
  let at = 0;
  for (const path of paths) {
    const end = out.indexOf(10, at);
    if (end < 0) break;
    const header = out.subarray(at, end).toString('utf8');
    at = end + 1;
    const size = / blob (\d+)$/.exec(header)?.[1];
    if (size === undefined) {
      // `missing`, or a tree or commit: no contents follow unless it has a size.
      const other = / \w+ (\d+)$/.exec(header)?.[1];
      if (other !== undefined) at += Number(other) + 1;
      continue;
    }
    files.set(path, out.subarray(at, at + Number(size)).toString('utf8'));
    at += Number(size) + 1;
  }
  return files;
};

/** Reads one file at `ref`, or null when it is missing there. */
export const readerAtRef =
  (dir: string, ref: string) =>
  (path: string): string | null =>
    readAtRef(dir, ref, [path]).get(path) ?? null;

/** The remote Feature Branch of a Spec, `origin/feat/<specNumber>-…`, or null. */
export const featureTip = (dir: string, specNumber: string): string | null =>
  (git(dir, ['branch', '-r', '--list', `origin/feat/${specNumber}-*`]) ?? '')
    .split('\n')[0]
    ?.trim() || null;
