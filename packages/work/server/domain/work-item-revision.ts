export const WORK_ITEM_REVISION_CONFLICT_MESSAGE = "工作项已被其他人修改，请刷新后重试";

export function parseExpectedWorkItemUpdatedAt(value: unknown): Date | null {
  if (typeof value !== "string" || value !== value.trim()) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString() === value ? parsed : null;
}

export function workItemRevisionMatches(current: Date, expected: Date) {
  return current.getTime() === expected.getTime();
}
