import { prisma } from "@workspace/platform/server/prisma";
import type { CostQueryParams, PaginatedResult } from "./common";
import { buildPagination, buildYearMonthWhere } from "./common";

export interface WorkshopReportDTO {
  id: number;
  year: number;
  month: number;
  productName: string | null;
  batchNo: string | null;
  employeeName: string | null;
  positionName: string | null;
  workPoint: number | null;
  quantity: number | null;
  sourceFile: string;
  sourceSheet: string | null;
  sourceRow: number | null;
}

function toDTO(row: {
  id: number;
  year: number;
  month: number;
  productName: string | null;
  batchNo: string | null;
  employee: { name: string } | null;
  position: { name: string } | null;
  workPoint: number | null;
  quantity: number | null;
  sourceFile: string;
  sourceSheet: string | null;
  sourceRow: number | null;
}): WorkshopReportDTO {
  return {
    id: row.id,
    year: row.year,
    month: row.month,
    productName: row.productName,
    batchNo: row.batchNo,
    employeeName: row.employee?.name ?? null,
    positionName: row.position?.name ?? null,
    workPoint: row.workPoint,
    quantity: row.quantity,
    sourceFile: row.sourceFile,
    sourceSheet: row.sourceSheet,
    sourceRow: row.sourceRow,
  };
}

export async function listWorkshopReports(
  params: CostQueryParams,
): Promise<PaginatedResult<WorkshopReportDTO>> {
  const where = buildYearMonthWhere(params);
  const { skip, take, page, pageSize } = buildPagination(params);

  const [data, total] = await Promise.all([
    prisma.financeWorkshopReport.findMany({
      where,
      include: {
        employee: { select: { name: true } },
        position: { select: { name: true } },
      },
      orderBy: [{ year: "desc" }, { month: "desc" }, { productName: "asc" }],
      skip,
      take,
    }),
    prisma.financeWorkshopReport.count({ where }),
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

export async function getWorkshopSummary(params: CostQueryParams) {
  const where = buildYearMonthWhere(params);

  const rows = await prisma.financeWorkshopReport.findMany({
    where,
    select: {
      workPoint: true,
      quantity: true,
      productName: true,
      employee: { select: { name: true } },
      position: { select: { name: true } },
    },
  });

  let totalWorkPoints = 0;
  let totalQuantity = 0;
  const productMap = new Map<string, number>();
  const personMap = new Map<string, number>();

  for (const row of rows) {
    totalWorkPoints += row.workPoint ?? 0;
    totalQuantity += row.quantity ?? 0;

    if (row.productName) {
      productMap.set(row.productName, (productMap.get(row.productName) ?? 0) + (row.workPoint ?? 0));
    }
    const personName = row.employee?.name ?? "未知";
    personMap.set(personName, (personMap.get(personName) ?? 0) + (row.workPoint ?? 0));
  }

  const sortMap = (map: Map<string, number>) =>
    [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, value]) => ({ name, value }));

  return {
    totalWorkPoints,
    totalQuantity,
    topProducts: sortMap(productMap),
    topPeople: sortMap(personMap),
  };
}
