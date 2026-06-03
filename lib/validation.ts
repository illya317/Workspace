/**
 * Shared parameter validation helpers for finance API routes.
 *
 * Every finance GET/POST handler should use these instead of bare parseInt()
 * to prevent NaN from reaching Prisma.
 */

/** Parse a positive integer (>= 1), returns default on failure */
export function parsePositiveInt(
  value: string | null | undefined,
  fallback: number,
): number {
  if (!value) return fallback;
  const n = parseInt(value, 10);
  return isNaN(n) || n < 1 ? fallback : n;
}

/** Parse a year (2020-2099), returns null on failure */
export function parseYear(
  value: string | null | undefined,
): number | null {
  if (!value) return null;
  const n = parseInt(value, 10);
  return isNaN(n) || n < 2020 || n > 2099 ? null : n;
}

/** Parse a month (1-12), returns null on failure */
export function parseMonth(
  value: string | null | undefined,
): number | null {
  if (!value) return null;
  const n = parseInt(value, 10);
  return isNaN(n) || n < 1 || n > 12 ? null : n;
}

/** Parse page + pageSize from searchParams, returning safe defaults */
export function parsePageParams(
  searchParams: URLSearchParams,
  maxPageSize = 200,
): { page: number; pageSize: number } {
  return {
    page: parsePositiveInt(searchParams.get("page"), 1),
    pageSize: Math.min(
      parsePositiveInt(searchParams.get("pageSize"), 50),
      maxPageSize,
    ),
  };
}

/**
 * Require a non-empty string param. Returns 400 Response on failure, null on success.
 * For GET query params.
 */
export function requireString(
  value: string | null | undefined,
  _name: string,
): string | null {
  if (!value || value.trim().length === 0) return null;
  return value.trim();
}
