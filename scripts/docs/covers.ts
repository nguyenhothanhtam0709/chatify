// `covers:` ties a Descriptive Doc to the code it describes (Spec 00017). A change to covered code
// must update the doc or say why. Pure, so the PR guard, the root script and `canWrite` share it.
import { matchesGlob } from 'node:path';

export interface Doc {
  path: string;
  content: string;
}

const frontMatter = (content: string): string[] | null =>
  /^---\n([\s\S]*?)\n---/.exec(content)?.[1]?.split('\n') ?? null;

const unquote = (item: string) => item.trim().replace(/^(["'])(.*)\1$/, '$2');

/**
 * The `covers:` globs of a doc: null when it has none, 'invalid' when the value is not a non-empty
 * list of strings. Reads an inline `[a, b]` list or a block list of `- a` lines.
 */
export const parseCovers = (content: string): string[] | null | 'invalid' => {
  const lines = frontMatter(content);
  const at = lines?.findIndex((line) => /^covers:/.test(line)) ?? -1;
  if (!lines || at < 0) return null;
  const rest = (lines[at] ?? '').slice('covers:'.length).trim();
  let items: string[];
  if (rest === '') {
    const block: string[] = [];
    for (const line of lines.slice(at + 1)) {
      if (!/^\s+/.test(line) && line !== '') break;
      const item = /^\s+-\s+(.+)$/.exec(line)?.[1];
      if (item === undefined) return 'invalid';
      block.push(item);
    }
    items = block;
  } else if (rest.startsWith('[') && rest.endsWith(']')) {
    items = rest.slice(1, -1).split(',');
  } else {
    return 'invalid';
  }
  const globs = items.map(unquote);
  return globs.length === 0 || globs.some((glob) => glob === '' || /[[\]{}]/.test(glob))
    ? 'invalid'
    : globs;
};

const isDescriptive = (content: string) =>
  frontMatter(content)?.some((line) => /^kind:\s*descriptive\s*$/.test(line)) ?? false;

/** True when the doc is Descriptive and its `covers:` matches one of `changedFiles`. */
export const coversChange = (content: string, changedFiles: string[]): boolean => {
  const globs = parseCovers(content);
  return (
    isDescriptive(content) &&
    Array.isArray(globs) &&
    changedFiles.some((file) => globs.some((glob) => matchesGlob(file, glob)))
  );
};

/** The Descriptive Docs a PR left out, less those its body excuses with a `Doc not updated:` line. */
export const docsNotUpdated = (changedFiles: string[], docs: Doc[], prBody?: string): string[] => {
  const excused = new Set(
    [...(prBody ?? '').matchAll(/^Doc not updated:\s*(\S+)\s+[—–-]+\s*(\S.*)$/gm)].map(
      (match) => match[1],
    ),
  );
  return docs
    .filter(
      ({ path, content }) =>
        !changedFiles.includes(path) && !excused.has(path) && coversChange(content, changedFiles),
    )
    .map(({ path }) => path);
};
