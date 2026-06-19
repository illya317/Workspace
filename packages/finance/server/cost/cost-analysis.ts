import { prisma } from "@workspace/platform/server/prisma";
import type { CostQueryParams, PaginatedResult } from "./common";
import { buildPagination, buildYearMonthWhere } from "./common";

export interface CostAnalysisDTO {
  id: number;
  year: number;
  month: number | null;
  tableName: string | null;
  rowLabel: string | null;
  metricKey: string | null;
  metricName: string | null;
  value: number | null;
  textValue: string | null;
  sourceFile: string;
  sourceSheet: string | null;
  sourceRow: number | null;
}

function toDTO(row: {
  id: number;
  year: number;
  month: number | null;
  tableName: string | null;
  rowLabel: string | null;
  metricKey: string | null;
  metricName: string | null;
  value: number | null;
  textValue: string | null;
  sourceFile: string;
  sourceSheet: string | null;
  sourceRow: number | null;
}): CostAnalysisDTO {
  return { ...row };
}

export async function listCostAnalysis(
  params: CostQueryParams,
): Promise<PaginatedResult<CostAnalysisDTO>> {
  const where = buildYearMonthWhere(params);
  const { skip, take, page, pageSize } = buildPagination(params);

  const [data, total] = await Promise.all([
    prisma.financeCostAnalysisRow.findMany({
      where,
      orderBy: [{ year: "desc" }, { month: "desc" }, { tableName: "asc" }],
      skip,
      take,
    }),
    prisma.financeCostAnalysisRow.count({ where }),
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

export async function getCostAnalysisSummary(params: CostQueryParams) {
  const where = buildYearMonthWhere(params);

  const rows = await prisma.financeCostAnalysisRow.findMany({
    where,
    select: {
      tableName: true,
      metricName: true,
      value: true,
    },
  });

  const tableMap = new Map<string, number>();
  for (const row of rows) {
    const amt = row.value ?? 0;
    if (row.tableName) {
      tableMap.set(row.tableName, (tableMap.get(row.tableName) ?? 0) + amt);
    }
  }

  return {
    tableTotals: [...tableMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({ name, value })),
  };
}
