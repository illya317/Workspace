export const WORK_PLAN_PAGE_SIZE_OPTIONS = [10, 20, 50] as const;
export const DEFAULT_WORK_PLAN_PAGE_SIZE = 50;

export function normalizeWorkPlanPageSize(value: unknown) {
  const parsed = Number(value);
  return WORK_PLAN_PAGE_SIZE_OPTIONS.includes(parsed as (typeof WORK_PLAN_PAGE_SIZE_OPTIONS)[number])
    ? parsed
    : DEFAULT_WORK_PLAN_PAGE_SIZE;
}

export function normalizeWorkPlanPageIndex(value: unknown, totalPages: number) {
  const parsed = Number(value);
  const requested = Number.isFinite(parsed) ? Math.floor(parsed) : 0;
  return Math.max(0, Math.min(requested, Math.max(1, totalPages) - 1));
}

export function paginateWorkPlanGroup<T>(items: readonly T[], pageSize: unknown, pageIndex: unknown) {
  const safePageSize = normalizeWorkPlanPageSize(pageSize);
  const totalPages = Math.max(1, Math.ceil(items.length / safePageSize));
  const page = normalizeWorkPlanPageIndex(pageIndex, totalPages);
  const pageStart = page * safePageSize;
  return {
    page,
    pageSize: safePageSize,
    pageStart,
    totalPages,
    items: items.slice(pageStart, pageStart + safePageSize),
  };
}
