import type { FinanceCloseScope, FinanceCloseWorkpaperDto, FinanceCloseWorkpaperTaskKey } from "../../types/close";

export function closeWorkpaperContextKey(
  scope: FinanceCloseScope | null,
  taskKey: FinanceCloseWorkpaperTaskKey | null,
  version: number | null,
) {
  if (!scope || !taskKey) return "";
  return `${scope.companyCode}:${scope.year}:${scope.month}:${taskKey}:${version ?? "new"}`;
}

export function closeWorkpaperResponseMatches(
  response: { scope: FinanceCloseScope; workpapers?: FinanceCloseWorkpaperDto[] },
  scope: FinanceCloseScope,
  taskKey: FinanceCloseWorkpaperTaskKey,
) {
  return response.scope.companyCode === scope.companyCode
    && response.scope.year === scope.year
    && response.scope.month === scope.month
    && response.workpapers?.every((item) => item.taskKey === taskKey) !== false;
}

export function closeWorkpaperMutationMatches(
  response: FinanceCloseWorkpaperDto,
  taskKey: FinanceCloseWorkpaperTaskKey,
  expectedVersion: number | null,
) {
  return response.taskKey === taskKey && response.version === (expectedVersion ?? 0) + 1;
}
