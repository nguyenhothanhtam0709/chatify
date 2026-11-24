// Fails when web source spells a limit out as a number in a string, such as "1-50 characters".
// The number belongs in contracts; the string is built from it.
import { fileURLToPath } from 'node:url';
import { codeOfLine, readSources, type SourceFile } from './source-files.ts';

const SPELLED_LIMIT = /\d+\s*(?:-|–|to)\s*\d+\s+characters|\bat most \d+/i;

export const findSpelledLimits = (files: SourceFile[]): string[] =>
  files.flatMap(({ path, content }) =>
    content
      .split('\n')
      .flatMap((line, index) =>
        SPELLED_LIMIT.test(codeOfLine(line))
          ? [`${path}:${index + 1}: a limit is spelled out as a number; build it from contracts`]
          : [],
      ),
  );

if (import.meta.main) {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const problems = findSpelledLimits(readSources(root, ['packages/web/src']));
  if (problems.length > 0) {
    console.error(problems.join('\n'));
    process.exitCode = 1;
  }
}
