export interface CostQueryParams {
  year?: number;
  month?: number;
  productName?: string;
  customerName?: string;
  sourceFile?: string;
  page?: number;
  pageSize?: number;
}

export function buildPagination(params: CostQueryParams) {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, params.pageSize ?? 50));
  return { skip: (page - 1) * pageSize, take: pageSize, page, pageSize };
}

export function buildYearMonthWhere(params: CostQueryParams): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  if (params.year !== undefined) where.year = params.year;
  if (params.month !== undefined) where.month = params.month;
  if (params.productName) where.productName = { contains: params.productName };
  if (params.customerName) where.customerName = { contains: params.customerName };
  if (params.sourceFile) where.sourceFile = { contains: params.sourceFile };
  return where;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}
