// The doc rules a machine can check. `pnpm docs:check` runs this after comparing the Generated Docs
// with the code. It checks tracked files only, so a local note can't fail it.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCovers } from './covers.ts';

export interface Doc {
  path: string;
  content: string;
}

const NO_LINK_CHECK = /^(\.scratch|\.agents)\//;
// The docs ADR 0008 exempts from declaring a kind.
const NO_KIND_NEEDED =
  /^(\.scratch\/|\.agents\/|docs\/adr\/|docs\/agents\/|docs\/laters\.md$|docs\/workflow\/git-workflow\.md$|AGENTS\.md$)/;
const STATUS = /^\*{0,2}Status:\*{0,2}\s*([a-z-]+)/im;
const CLOSED = new Set(['resolved', 'wontfix']);

export const findBrokenLinks = (docs: Doc[], exists: (path: string) => boolean): string[] =>
  docs
    .filter(({ path }) => !NO_LINK_CHECK.test(path))
    .flatMap(({ path, content }) => {
      const prose = content.replace(/^```[\s\S]*?^```/gm, '');
      return [...prose.matchAll(/\]\(([^)#\s]+)/g)]
        .map((match) => match[1] ?? '')
        .filter((link) => !/^[a-z][a-z+.-]*:/.test(link))
        .filter((link) => !exists(normalize(join(dirname(path), link))))
        .map((link) => `${path}: broken link ${link}`);
    });

export const findMissingKinds = (docs: Doc[]): string[] =>
  docs
    .filter(({ path }) => !NO_KIND_NEEDED.test(path))
    .filter(
      ({ content }) => !/^---\n(?:.*\n)*?kind: (intent|generated|descriptive)\n/.test(content),
    )
    .map(({ path }) => `${path}: no kind in front matter`);

export const findBadCovers = (docs: Doc[]): string[] =>
  docs.flatMap(({ path, content }) => {
    const covers = parseCovers(content);
    if (covers === null) return [];
    if (!/^---\n(?:.*\n)*?kind: descriptive\n/.test(content)) {
      return [`${path}: covers only belongs on a doc with kind: descriptive`];
    }
    return covers === 'invalid' ? [`${path}: covers must be a list of strings`] : [];
  });

export const findOpenTickets = (docs: Doc[]): string[] => {
  const statusOf = (content: string) => STATUS.exec(content)?.[1]?.toLowerCase();
  const resolvedFolders = new Set(
    docs
      .filter(({ path }) => /^\.scratch\/[^/]+\/spec\.md$/.test(path))
      .filter(({ content }) => statusOf(content) === 'resolved')
      .map(({ path }) => dirname(path)),
  );
  return docs.flatMap(({ path, content }) => {
    const folder = /^(\.scratch\/[^/]+)\/issues\/[^/]+\.md$/.exec(path)?.[1];
    const status = statusOf(content);
    if (!folder || !resolvedFolders.has(folder) || !status || CLOSED.has(status)) return [];
    return [`${path}: ${status} under a resolved Spec`];
  });
};

if (import.meta.main) {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const docs = execFileSync('git', ['ls-files', '*.md'], { cwd: root, encoding: 'utf8' })
    .trim()
    .split('\n')
    .filter((path) => existsSync(join(root, path)))
    .map((path) => ({ path, content: readFileSync(join(root, path), 'utf8') }));
  const findings = [
    ...findBrokenLinks(docs, (path) => existsSync(join(root, path))),
    ...findMissingKinds(docs),
    ...findBadCovers(docs),
    ...findOpenTickets(docs),
  ];
  if (findings.length > 0) {
    console.error(findings.join('\n'));
    process.exitCode = 1;
  }
}
