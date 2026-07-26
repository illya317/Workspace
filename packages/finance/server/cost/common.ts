import type { Prisma } from "@workspace/platform/server/prisma";

export interface CostQueryParams {
  importId?: number;
  year?: number;
  month?: number;
  dateFrom?: string;
  dateTo?: string;
  productName?: string;
  customerName?: string;
  departmentId?: number;
  employeeIds?: number[];
  sourceFile?: string;
  page?: number;
  pageSize?: number;
}

export type ShipmentSortField = "date" | "quantity" | "amount" | "receivedAmount";
export type ShipmentSortOrder = "asc" | "desc";

export interface ShipmentQueryParams extends CostQueryParams {
  sortBy?: ShipmentSortField;
  sortOrder?: ShipmentSortOrder;
}

export function buildPagination(params: CostQueryParams) {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, params.pageSize ?? 50));
  return { skip: (page - 1) * pageSize, take: pageSize, page, pageSize };
}

export function buildYearMonthWhere(params: CostQueryParams): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  if (params.importId !== undefined) where.importId = params.importId;
  if (params.year !== undefined) where.year = params.year;
  if (params.month !== undefined) where.month = params.month;
  if (params.productName) where.productName = { contains: params.productName, mode: "insensitive" };
  if (params.customerName) where.customerName = { contains: params.customerName, mode: "insensitive" };
  if (params.sourceFile) where.sourceFile = { contains: params.sourceFile, mode: "insensitive" };
  return where;
}

export function buildShipmentWhere(params: CostQueryParams): Prisma.FinanceShipmentWhereInput {
  const where: Prisma.FinanceShipmentWhereInput = {};
  if (params.importId !== undefined) where.importId = params.importId;
  if (params.year !== undefined) where.year = params.year;
  if (params.month !== undefined) where.month = params.month;
  if (params.productName) where.productName = { contains: params.productName, mode: "insensitive" };
  if (params.customerName) where.customerName = { contains: params.customerName, mode: "insensitive" };
  if (params.sourceFile) where.sourceFile = { contains: params.sourceFile, mode: "insensitive" };
  if (params.employeeIds !== undefined) {
    where.salesChannel = "employee";
    where.employeeId = { in: params.employeeIds };
  }
  if (params.dateFrom && params.dateTo) {
    const monthlyPeriods = fullyCoveredMonths(params.dateFrom, params.dateTo);
    where.OR = [
      { date: { gte: params.dateFrom, lte: params.dateTo } },
      ...(monthlyPeriods.length > 0 ? [{
        date: null,
        OR: monthlyPeriods.map(({ year, month }) => ({ year, month })),
      }] : []),
    ];
  }
  return where;
}

function fullyCoveredMonths(dateFrom: string, dateTo: string) {
  const start = parseIsoDate(dateFrom);
  const end = parseIsoDate(dateTo);
  if (!start || !end || start > end) return [];
  const periods: Array<{ year: number; month: number }> = [];
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  const finalMonth = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
  while (cursor <= finalMonth) {
    const monthStart = new Date(cursor);
    const monthEnd = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0));
    if (monthStart >= start && monthEnd <= end) {
      periods.push({ year: cursor.getUTCFullYear(), month: cursor.getUTCMonth() + 1 });
    }
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return periods;
}

function parseIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
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
