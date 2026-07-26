export type LibraryPreviewRange = {
  start: number;
  end: number;
};

export type LibraryPreviewRangeResult =
  | { ok: true; range: LibraryPreviewRange | null }
  | { ok: false };

export function parseLibraryPreviewRange(value: string | null, size: number): LibraryPreviewRangeResult {
  if (!value) return { ok: true, range: null };
  if (!Number.isSafeInteger(size) || size <= 0 || value.includes(",")) return { ok: false };
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!match || (!match[1] && !match[2])) return { ok: false };

  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return { ok: false };
    return { ok: true, range: { start: Math.max(0, size - suffixLength), end: size - 1 } };
  }

  const start = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : size - 1;
  if (
    !Number.isSafeInteger(start)
    || !Number.isSafeInteger(requestedEnd)
    || start < 0
    || start >= size
    || requestedEnd < start
  ) return { ok: false };
  return { ok: true, range: { start, end: Math.min(requestedEnd, size - 1) } };
}
