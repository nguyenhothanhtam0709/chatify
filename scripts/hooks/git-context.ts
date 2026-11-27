// Where a hook's Task Branch lives. A sub-agent in a worktree gets the main checkout as its hook
// `cwd` (Ticket 08), so the hooks resolve the branch from a file path, a PR head or the worktree
// list instead of trusting `cwd`.
import { spawnSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { readScopeFile } from './scope-facts.ts';

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

export interface RunResult {
  status: number | null;
  output: string;
}

export interface HookInput {
  tool_name?: string;
  tool_input?: { command?: string; body?: string; head?: string };
  cwd?: string;
  agent_type?: string;
}

export const gitOut = (cwd: string, args: string[]): string => {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
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

/** The Feature Branch tip's merge-base with the branch and the diff since, read from refs only. */
export const sinceFeature = (task: TaskBranch, specNumber: string) => {
  const tip = featureTip(task.worktree, specNumber);
  if (tip === null) return null;
  const base = gitOut(task.worktree, ['merge-base', tip, task.branch]);
  return { base, range: `${base}..${task.branch}` };
};
