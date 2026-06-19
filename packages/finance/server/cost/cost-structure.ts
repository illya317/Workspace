import { prisma } from "@workspace/platform/server/prisma";
import type { CostQueryParams, PaginatedResult } from "./common";
import { buildPagination, buildYearMonthWhere } from "./common";

export interface CostStructureDTO {
  id: number;
  year: number;
  month: number | null;
  productName: string | null;
  category: string | null;
  itemName: string | null;
  amount: number | null;
  quantity: number | null;
  unit: string | null;
  sourceFile: string;
  sourceSheet: string | null;
  sourceRow: number | null;
}

function toDTO(row: {
  id: number;
  year: number;
  month: number | null;
  productName: string | null;
  category: string | null;
  itemName: string | null;
  amount: number | null;
  quantity: number | null;
  unit: string | null;
  sourceFile: string;
  sourceSheet: string | null;
  sourceRow: number | null;
}): CostStructureDTO {
  return { ...row };
}

export async function listCostStructure(
  params: CostQueryParams,
): Promise<PaginatedResult<CostStructureDTO>> {
  const where = buildYearMonthWhere(params);
  const { skip, take, page, pageSize } = buildPagination(params);

  const [data, total] = await Promise.all([
    prisma.financeCostStructureRow.findMany({
      where,
      orderBy: [{ year: "desc" }, { month: "desc" }, { productName: "asc" }],
      skip,
      take,
    }),
    prisma.financeCostStructureRow.count({ where }),
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

export async function getCostStructureSummary(params: CostQueryParams) {
  const where = buildYearMonthWhere(params);

  const rows = await prisma.financeCostStructureRow.findMany({
    where,
    select: {
      amount: true,
      quantity: true,
      productName: true,
      category: true,
    },
  });

  let totalAmount = 0;
  let totalQuantity = 0;
  const productMap = new Map<string, number>();
  const categoryMap = new Map<string, number>();

  for (const row of rows) {
    const amt = row.amount ?? 0;
    const qty = row.quantity ?? 0;
    totalAmount += amt;
    totalQuantity += qty;

    if (row.productName) {
      productMap.set(row.productName, (productMap.get(row.productName) ?? 0) + amt);
    }
    if (row.category) {
      categoryMap.set(row.category, (categoryMap.get(row.category) ?? 0) + amt);
    }
  }

  const sortMap = (map: Map<string, number>) =>
    [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, value]) => ({ name, value }));

  return {
    totalAmount,
    totalQuantity,
    topProducts: sortMap(productMap),
    topCategories: sortMap(categoryMap),
    unitCost: totalQuantity > 0 ? totalAmount / totalQuantity : 0,
  };
}
