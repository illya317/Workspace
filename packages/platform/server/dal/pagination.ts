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
