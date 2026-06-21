import "server-only";

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export function parsePagination(searchParams: URLSearchParams) {
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const pageSize = Math.min(500, Math.max(1, parseInt(searchParams.get("pageSize") || "50", 10)));
  return { page, pageSize, skip: (page - 1) * pageSize };
}

export function buildWhere(
  searchParams: URLSearchParams,
  filterableFields: string[]
): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  for (const key of filterableFields) {
    const value = searchParams.get(key);
    if (value !== null && value !== "") {
      where[key] = value;
    }
  }
  return where;
}

export function buildKeywordWhere(
  keyword: string | null,
  searchableFields: string[]
): Record<string, unknown> | undefined {
  if (!keyword) return undefined;
  return {
    OR: searchableFields.map((field) => ({
      [field]: { contains: keyword },
    })),
  };
}

export function buildFilterWhere<TWhere extends Record<string, unknown>>(
  filters: Record<string, unknown>,
  exactFields: string[],
): TWhere {
  const where: Record<string, unknown> = {};
  for (const field of exactFields) {
    const value = filters[field];
    if (value !== null && value !== undefined && value !== "") where[field] = value;
  }
  return where as TWhere;
}

export function buildContainsWhere(
  keyword: string | null | undefined,
  searchableFields: string[],
): Record<string, unknown> | undefined {
  const q = keyword?.trim();
  if (!q) return undefined;
  return {
    OR: searchableFields.map((field) => ({ [field]: { contains: q } })),
  };
}

export function addAndConditions<TWhere extends Record<string, unknown>>(
  where: TWhere,
  conditions: Array<Record<string, unknown> | undefined | null | false>,
): TWhere {
  const active = conditions.filter(Boolean) as Record<string, unknown>[];
  if (active.length > 0) {
    const target = where as Record<string, unknown>;
    const existing = Array.isArray(target.AND) ? target.AND as Record<string, unknown>[] : [];
    target.AND = [...existing, ...active];
  }
  return where;
}
