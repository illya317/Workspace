export function normalizeInputValue(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value);
}

export function toPercentDisplay(value: unknown) {
  if (value === null || value === undefined || value === "") return "";
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "";
  return String(Number((parsed * 100).toFixed(4)));
}

export function fromPercentDisplay(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return null;
  return String(parsed / 100);
}
