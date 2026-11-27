// SessionStart hook: warns at once when the session's Node is below the root `engines` range, since
// pnpm, the stop check and the PR guard then fail with ERR_PNPM_BAD_RUNTIME_VERSION. It never
// blocks, and prints nothing when Node fits or on any error.
import { readFileSync } from 'node:fs';
import { satisfies } from '../preflight/preflight.ts';

/** The warning when `version` is below `range`, or null (also for a range it can't read). */
export const nodeVersionWarning = (version: string, range: string): string | null =>
  satisfies(version, range) === false
    ? `Node ${version} does not satisfy engines "${range}". pnpm, the stop check and the PR guard ` +
      'will fail. Exit, run "nvm use" and start the session again.'
    : null;

if (import.meta.main) {
  try {
    const root = process.env['CLAUDE_PROJECT_DIR'] ?? process.cwd();
    const range = (
      JSON.parse(readFileSync(`${root}/package.json`, 'utf8')) as { engines?: { node?: string } }
    ).engines?.node;
    const warning = nodeVersionWarning(process.versions.node, range ?? '');
    if (warning !== null) process.stdout.write(JSON.stringify({ systemMessage: warning }));
  } catch {
    // Never block a session.
  }
}
