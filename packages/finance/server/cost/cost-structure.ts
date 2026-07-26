import { prisma } from "@workspace/platform/server/prisma";
import type { CostQueryParams, PaginatedResult } from "./common";
import { buildPagination, buildYearMonthWhere } from "./common";
import { buildCostStructureProductRows, type CostStructureProductRow } from "./cost-structure-products";
import { summarizeCostStructureRows } from "./cost-structure-summary";

export type CostStructureDTO = CostStructureProductRow;

export async function listCostStructure(
  params: CostQueryParams,
): Promise<PaginatedResult<CostStructureDTO>> {
  const where = buildYearMonthWhere(params);
  const { skip, take, page, pageSize } = buildPagination(params);

  const [facts, total] = await Promise.all([
    prisma.financeCostStructureRow.findMany({
      where,
      include: {
        product: { select: { id: true, code: true, name: true } },
        receiptReport: { select: { id: true, status: true } },
      },
      orderBy: [{ year: "desc" }, { month: "desc" }, { sourceRow: "asc" }],
      skip,
      take,
    }),
    prisma.financeCostStructureRow.count({ where }),
  ]);

  return {
    data: buildCostStructureProductRows(facts),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}

export async function getCostStructureSummary(params: CostQueryParams) {
  const where = buildYearMonthWhere(params);

  const rows = await prisma.financeCostStructureRow.findMany({
    where,
    select: {
      rawMaterials: true,
      packagingMaterials: true,
      directLaborWage: true,
      directLaborSocialSecurity: true,
      directLaborWelfare: true,
      auxiliaryLaborWage: true,
      auxiliaryLaborSocialSecurity: true,
      auxiliaryLaborWelfare: true,
      utilities: true,
      depreciationDirect: true,
      depreciationAuxiliary: true,
      otherManufacturingCost: true,
      quantity: true,
      productName: true,
    },
  });
  return summarizeCostStructureRows(rows);
}
