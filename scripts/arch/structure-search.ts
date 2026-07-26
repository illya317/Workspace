type SearchSourceFile = {
  relPath: string;
  text: string;
};

export type HandwrittenSearchMatchCandidate = {
  file: string;
  line: number;
  signal: string;
  text: string;
};

const HANDWRITTEN_SEARCH_ALLOWLIST = new Set([
  "packages/core/search/text.ts",
]);

export function findHandwrittenSearchMatches(sourceFiles: SearchSourceFile[]): HandwrittenSearchMatchCandidate[] {
  const candidates: HandwrittenSearchMatchCandidate[] = [];
  const directLowerIncludes = /\.toLowerCase\(\)\.includes\s*\(/;
  const includesNormalizedQuery = /\.includes\s*\(\s*(q|query|keyword|normalizedQuery)\s*\)/;

  for (const file of sourceFiles) {
    if (!/^(app|packages)\//.test(file.relPath)) continue;
    if (HANDWRITTEN_SEARCH_ALLOWLIST.has(file.relPath)) continue;

    file.text.split(/\r?\n/).forEach((lineText, index) => {
      const trimmed = lineText.trim();
      const signal = directLowerIncludes.test(trimmed)
        ? "lowercase-includes"
        : includesNormalizedQuery.test(trimmed)
          ? "normalized-query-includes"
          : null;
      if (!signal) return;
      candidates.push({
        file: file.relPath,
        line: index + 1,
        signal,
        text: trimmed,
      });
    });
  }

  return candidates.sort((left, right) =>
    left.file.localeCompare(right.file) || left.line - right.line || left.signal.localeCompare(right.signal),
  );
}
