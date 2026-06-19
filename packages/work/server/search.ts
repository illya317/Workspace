function includesValue(value: unknown, keyword: string) {
  if (value === null || value === undefined) return false;
  return String(value).toLowerCase().includes(keyword);
}

export function matchAnyField(record: Record<string, unknown>, keyword: string) {
  const normalized = keyword.trim().toLowerCase();
  if (!normalized) return true;
  return Object.values(record).some((value) => includesValue(value, normalized));
}
