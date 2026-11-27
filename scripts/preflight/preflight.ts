// `pnpm preflight`: run right after creating a Task Branch. Says whether the Ticket can start and,
// if not, what is wrong and what to do. It only reports; it fixes nothing. Any error exits non-zero.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { readScopeFile, scopeFacts, type ScopeFacts } from '../hooks/scope-facts.ts';

/** The facts the wrapper gathers; `checkPreflight` decides from these alone. */
export interface PreflightEnv {
  nodeVersion: string;
  /** The root `engines.node` range. */
  enginesRange: string;
  branch: string;
  /** Branch names under `feat/` on `origin`. */
  featureBranches: string[];
  /** Whether the Feature Branch tip on `origin` is an ancestor of the branch. */
  featureTipMerged: boolean;
  /** `git status --porcelain` lines of tracked files. */
  trackedChanges: string[];
  /** Untracked paths. */
  untracked: string[];
  dockerRunning: boolean;
  /** Null when the branch has no scope file. */
  scope: ScopeFacts | null;
  /** The Spec folder's Markdown files on the Feature Branch tip on `origin`, by repo path. */
  tipFiles: Record<string, string>;
}

const TASK_BRANCH = /^agent\/(\d{5})-(?:\d{2}-[a-z0-9][a-z0-9-]*|doc-sync|doc-writer)$/;

/** The Feature Branch `feat/NNNNN-*` that a Task Branch belongs to, if it exists on origin. */
export const featureBranchFor = (branch: string, featureBranches: string[]): string | null => {
  const number = TASK_BRANCH.exec(branch)?.[1];
  return featureBranches.find((name) => name.startsWith(`feat/${number}-`)) ?? null;
};

/** Whether `version` satisfies a `>=N[.M[.P]]` range; null when the range is any other shape. */
export const satisfies = (version: string, range: string): boolean | null => {
  const min = /^>=\s*(\d+(?:\.\d+){0,2})$/.exec(range.trim())?.[1];
  if (min === undefined) {
    return null;
  }
  const have = version.split('.').map(Number);
  const need = min.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const [h, n] = [have[i] ?? 0, need[i] ?? 0];
    if (h !== n) {
      return h > n;
    }
  }
  return true;
};

const statusOf = (text: string | undefined): string | null =>
  text === undefined ? null : (/^\*{0,2}Status:\*{0,2}\s*([a-z-]+)/im.exec(text)?.[1] ?? null);

/** Ticket numbers in the `Blocked by` line, such as `02, 03`. `None` gives an empty list. */
const blockedBy = (text: string): string[] =>
  (/^\*{0,2}Blocked by:\*{0,2}\s*(.*)$/im.exec(text)?.[1] ?? '').match(/\b\d{2}\b/g) ?? [];

/** Every reason the Ticket can't start, each with what to do. Empty means it can. */
export const checkPreflight = (env: PreflightEnv): string[] => {
  const failures: string[] = [];

  const fits = satisfies(env.nodeVersion, env.enginesRange);
  if (fits === null) {
    failures.push(
      `Cannot read the engines range "${env.enginesRange}". Escalate: preflight only reads ">=N".`,
    );
  } else if (!fits) {
    failures.push(
      `Node ${env.nodeVersion} does not satisfy "${env.enginesRange}". Run "nvm use" in this shell and run preflight again.`,
    );
  }

  const feature = featureBranchFor(env.branch, env.featureBranches);
  if (!TASK_BRANCH.test(env.branch)) {
    failures.push(
      `Branch "${env.branch}" is not agent/NNNNN-NN-<slug> or agent/NNNNN-doc-sync or agent/NNNNN-doc-writer. Create the Task Branch with that name.`,
    );
  } else if (feature === null) {
    failures.push(
      `No Feature Branch feat/${TASK_BRANCH.exec(env.branch)?.[1]}-* on origin. Escalate: the Feature Branch has to be pushed first.`,
    );
  } else if (!env.featureTipMerged) {
    failures.push(
      `origin/${feature} is not merged into ${env.branch}. Run "git fetch origin && git merge origin/${feature}", or recreate the branch from it.`,
    );
  }

  if (env.trackedChanges.length > 0) {
    failures.push(
      `Tracked files are modified or staged:\n${env.trackedChanges.map((line) => `  ${line}`).join('\n')}\nCommit or restore them before starting.`,
    );
  }
  if (env.untracked.length > 0) {
    failures.push(
      `Untracked files:\n${env.untracked.map((path) => `  ${path}`).join('\n')}\nEscalate to the human, who decides what to do with them. Do not delete or commit them.`,
    );
  }
  if (!env.dockerRunning) {
    failures.push(
      'Docker is not running. Start Docker, wait for the daemon, and run preflight again.',
    );
  }

  if (feature !== null) {
    const folder = `.scratch/${feature.slice('feat/'.length)}`;
    const specStatus = statusOf(env.tipFiles[`${folder}/spec.md`]);
    if (specStatus !== 'ready-for-agent' && specStatus !== 'resolved') {
      failures.push(
        `The Spec PR is not merged: ${folder}/spec.md on origin/${feature} reads "${specStatus ?? 'no Status'}". Escalate: the human merges the Spec PR first.`,
      );
    }
    if (env.scope === null) {
      failures.push(`No scope file for ${env.branch}. Ask the Orchestrator to write it.`);
    } else if (env.scope.ticket !== null) {
      const ticketText = env.tipFiles[env.scope.ticket];
      if (ticketText === undefined) {
        failures.push(
          `${env.scope.ticket} is not on origin/${feature}. Escalate: the Spec PR does not hold this Ticket.`,
        );
      } else {
        const dir = env.scope.ticket.slice(0, env.scope.ticket.lastIndexOf('/') + 1);
        for (const number of blockedBy(ticketText)) {
          const file = Object.keys(env.tipFiles).find((path) =>
            path.startsWith(`${dir}${number}-`),
          );
          const status = statusOf(file === undefined ? undefined : env.tipFiles[file]);
          if (status !== 'resolved') {
            failures.push(
              `Blocked by ${number}, which is "${status ?? 'not on the Feature Branch'}" on origin/${feature}, not resolved. Stop: the Orchestrator starts this Ticket once ${number} is merged.`,
            );
          }
        }
      }
    }
  }
  return failures;
};

const run = (command: string, args: string[]) => {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.error) {
    throw result.error;
  }
  return result;
};
const git = (...args: string[]): string => {
  const result = run('git', args);
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr.trim()}`);
  }
  return result.stdout;
};

const gather = (): PreflightEnv => {
  git('fetch', 'origin');
  const branch = git('rev-parse', '--abbrev-ref', 'HEAD').trim();
  const featureBranches = git('ls-remote', '--heads', 'origin', 'feat/*')
    .split('\n')
    .map((line) => line.split('refs/heads/')[1])
    .filter((name): name is string => name !== undefined);
  const feature = featureBranchFor(branch, featureBranches);
  const status = git('status', '--porcelain', '--untracked-files=all').split('\n').filter(Boolean);
  const tipFiles: Record<string, string> = {};
  if (feature !== null) {
    const folder = `.scratch/${feature.slice('feat/'.length)}`;
    for (const path of git('ls-tree', '-r', '--name-only', `origin/${feature}`, '--', folder).split(
      '\n',
    )) {
      if (path.endsWith('.md')) {
        tipFiles[path] = git('show', `origin/${feature}:${path}`);
      }
    }
  }
  const lines = readScopeFile(
    git('rev-parse', '--path-format=absolute', '--git-common-dir').trim(),
    branch,
  );
  const engines = (
    JSON.parse(readFileSync('package.json', 'utf8')) as { engines?: { node?: string } }
  ).engines?.node;
  return {
    nodeVersion: process.versions.node,
    enginesRange: engines ?? '',
    branch,
    featureBranches,
    featureTipMerged:
      feature !== null &&
      spawnSync('git', ['merge-base', '--is-ancestor', `origin/${feature}`, 'HEAD']).status === 0,
    trackedChanges: status.filter((line) => !line.startsWith('??')),
    untracked: status.filter((line) => line.startsWith('??')).map((line) => line.slice(3)),
    dockerRunning: run('docker', ['info']).status === 0,
    scope: lines === null ? null : scopeFacts(lines),
    tipFiles,
  };
};

if (import.meta.main) {
  try {
    const failures = checkPreflight(gather());
    if (failures.length > 0) {
      process.stderr.write(`Preflight failed:\n\n${failures.join('\n\n')}\n`);
      process.exit(1);
    }
    process.stdout.write('Preflight passed.\n');
  } catch (error) {
    process.stderr.write(`Preflight failed on an unexpected error: ${String(error)}\n`);
    process.exit(1);
  }
}
