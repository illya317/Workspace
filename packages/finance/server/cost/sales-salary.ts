import { prisma } from "@workspace/platform/server/prisma";
import type { CostQueryParams, PaginatedResult } from "./common";
import { buildPagination, buildYearMonthWhere } from "./common";

export interface SalesSalaryDTO {
  id: number;
  importId: number;
  year: number;
  month: number | null;
  employeeId: number | null;
  salesChannel: "employee" | "factory_direct" | "unknown";
  salespersonName: string | null;
  employeeName: string | null;
  baseSalary: number | null;
  bonus: number | null;
  deduction: number | null;
  actualSalary: number | null;
  sourceFile: string;
  sourceSheet: string | null;
  sourceRow: number | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDTO(row: {
  id: number;
  importId: number;
  year: number;
  month: number | null;
  employeeId: number | null;
  salesChannel: string;
  salespersonName: string | null;
  employee: { name: string } | null;
  baseSalary: number | null;
  bonus: number | null;
  deduction: number | null;
  actualSalary: number | null;
  sourceFile: string;
  sourceSheet: string | null;
  sourceRow: number | null;
  createdAt: Date;
  updatedAt: Date;
}): SalesSalaryDTO {
  return {
    id: row.id,
    importId: row.importId,
    year: row.year,
    month: row.month,
    employeeId: row.employeeId,
    salesChannel: row.salesChannel === "employee" || row.salesChannel === "factory_direct" ? row.salesChannel : "unknown",
    salespersonName: row.salespersonName,
    employeeName: row.salesChannel === "factory_direct"
      ? "厂销归集"
      : row.salesChannel === "employee"
        ? row.employee?.name ?? row.salespersonName
        : row.salespersonName,
    baseSalary: row.baseSalary,
    bonus: row.bonus,
    deduction: row.deduction,
    actualSalary: row.actualSalary,
    sourceFile: row.sourceFile,
    sourceSheet: row.sourceSheet,
    sourceRow: row.sourceRow,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listSalesSalaries(
  params: CostQueryParams,
): Promise<PaginatedResult<SalesSalaryDTO>> {
  const where = buildYearMonthWhere(params);
  const { skip, take, page, pageSize } = buildPagination(params);

  const [data, total] = await Promise.all([
    prisma.financeSalesSalary.findMany({
      where,
      include: { employee: { select: { name: true } } },
      orderBy: [{ year: "desc" }, { month: "desc" }],
      skip,
      take,
    }),
    prisma.financeSalesSalary.count({ where }),
  ]);

  return {
    data: data.map(toDTO),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}

export async function getSalesSalarySummary(params: CostQueryParams) {
  const where = buildYearMonthWhere(params);

  const rows = await prisma.financeSalesSalary.findMany({
    where,
    select: {
      baseSalary: true,
      bonus: true,
      deduction: true,
      actualSalary: true,
    },
  });

  let totalBase = 0;
  let totalBonus = 0;
  let totalDeduction = 0;
  let totalActual = 0;

  for (const row of rows) {
    totalBase += row.baseSalary ?? 0;
    totalBonus += row.bonus ?? 0;
    totalDeduction += row.deduction ?? 0;
    totalActual += row.actualSalary ?? 0;
  }

  return {
    totalBaseSalary: totalBase,
    totalBonus: totalBonus,
    totalDeduction: totalDeduction,
    totalActualSalary: totalActual,
  };
}
