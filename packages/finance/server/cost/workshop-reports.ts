import { prisma } from "@workspace/platform/server/prisma";

import type { CostQueryParams, PaginatedResult } from "./common";
import { buildPagination, buildYearMonthWhere } from "./common";

export interface WorkshopReportDTO {
  id: number;
  importId: number;
  year: number;
  month: number;
  productName: string | null;
  batchNo: string | null;
  workPoint: number | null;
  quantity: number | null;
  employeeId: number | null;
  positionId: number | null;
  sourceFile: string;
  sourceSheet: string | null;
  sourceRow: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export async function listWorkshopReports(
  params: CostQueryParams,
): Promise<PaginatedResult<WorkshopReportDTO>> {
  const where = buildYearMonthWhere(params);
  const { skip, take, page, pageSize } = buildPagination(params);

  const [data, total] = await Promise.all([
    prisma.financeWorkshopReport.findMany({
      where,
      orderBy: [
        { year: "desc" },
        { month: "desc" },
        { sourceRow: "asc" },
        { id: "asc" },
      ],
      skip,
      take,
    }),
    prisma.financeWorkshopReport.count({ where }),
  ]);

  return {
    data,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}
