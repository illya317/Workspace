import "server-only";

import type { CostMetricValues, CostOperationalAnalysisRuntimeDTO } from "@workspace/finance/types";
import { prisma } from "@workspace/platform/server/prisma";

import { buildYearMonthWhere } from "./common";

type CostFact = {
  year: number;
  month: number | null;
  productName: string | null;
  rawMaterials: number | null;
  packagingMaterials: number | null;
  directLaborWage: number | null;
  directLaborSocialSecurity: number | null;
  directLaborWelfare: number | null;
  auxiliaryLaborWage: number | null;
  auxiliaryLaborSocialSecurity: number | null;
  auxiliaryLaborWelfare: number | null;
  utilities: number | null;
  depreciationDirect: number | null;
  depreciationAuxiliary: number | null;
  otherManufacturingCost: number | null;
  quantity: number | null;
};

export async function buildCostOperationalAnalysisRuntime(
  filters: { year?: number; month?: number; productName?: string },
): Promise<CostOperationalAnalysisRuntimeDTO> {
  const baseWhere = buildYearMonthWhere({ productName: filters.productName });
  const [facts, yearRows] = await Promise.all([
    prisma.financeCostStructureRow.findMany({
      where: filters.year ? { ...baseWhere, year: { in: [filters.year - 1, filters.year] } } : baseWhere,
      select: costFactSelect,
      orderBy: [{ year: "asc" }, { month: "asc" }, { sourceRow: "asc" }],
    }),
    prisma.financeCostStructureRow.findMany({
      where: buildYearMonthWhere({ productName: filters.productName }),
      select: { year: true },
      distinct: ["year"],
      orderBy: { year: "desc" },
    }),
  ]);
  const current = facts.filter((fact) => (
    (filters.year === undefined || fact.year === filters.year)
    && (filters.month === undefined || fact.month === filters.month)
  ));
  const trendGroups = groupFacts(current, (fact) => `${fact.year}-${String(fact.month ?? 0).padStart(2, "0")}`);
  const comparisonGroups = groupFacts(facts, (fact) => `${fact.year}-${String(fact.month ?? 0).padStart(2, "0")}`);
  const productGroups = groupFacts(current, (fact) => fact.productName || "未命名产品");
  return {
    years: yearRows.map((row) => row.year),
    summary: summarizeCostFacts(current),
    trend: Array.from(trendGroups.entries()).map(([key, rows]) => {
      const [yearText, monthText] = key.split("-");
      const year = Number(yearText);
      const month = Number(monthText);
      const previousMonthKey = month > 1
        ? `${year}-${String(month - 1).padStart(2, "0")}`
        : `${year - 1}-12`;
      const previousYearKey = `${year - 1}-${String(month).padStart(2, "0")}`;
      return {
        key,
        label: month ? `${year}年${month}月` : `${year}年`,
        values: summarizeCostFacts(rows),
        previousMonth: comparisonGroups.has(previousMonthKey) ? summarizeCostFacts(comparisonGroups.get(previousMonthKey)!) : null,
        previousYear: comparisonGroups.has(previousYearKey) ? summarizeCostFacts(comparisonGroups.get(previousYearKey)!) : null,
      };
    }),
    ranking: Array.from(productGroups.entries())
      .map(([key, rows]) => ({ key, label: key, values: summarizeCostFacts(rows) }))
      .sort((left, right) => (right.values.manufacturingCost ?? 0) - (left.values.manufacturingCost ?? 0)),
    rows: current.map((fact, index) => ({
      key: `${fact.year}-${fact.month ?? 0}-${fact.productName ?? "unknown"}-${index}`,
      year: fact.year,
      month: fact.month,
      product: fact.productName || "未命名产品",
      values: summarizeCostFacts([fact]),
    })),
  };
}

function groupFacts(rows: CostFact[], keyOf: (fact: CostFact) => string) {
  const groups = new Map<string, CostFact[]>();
  for (const row of rows) groups.set(keyOf(row), [...(groups.get(keyOf(row)) ?? []), row]);
  return groups;
}

function summarizeCostFacts(rows: CostFact[]): CostMetricValues {
  const sum = (key: keyof CostFact) => rows.reduce((total, row) => total + (typeof row[key] === "number" ? row[key] : 0), 0);
  const directLabor = sum("directLaborWage") + sum("directLaborSocialSecurity") + sum("directLaborWelfare");
  const auxiliaryLabor = sum("auxiliaryLaborWage") + sum("auxiliaryLaborSocialSecurity") + sum("auxiliaryLaborWelfare");
  const depreciation = sum("depreciationDirect") + sum("depreciationAuxiliary");
  const manufacturingCost = sum("rawMaterials") + sum("packagingMaterials") + directLabor + auxiliaryLabor
    + sum("utilities") + depreciation + sum("otherManufacturingCost");
  const quantity = sum("quantity");
  return {
    rawMaterials: sum("rawMaterials"),
    packagingMaterials: sum("packagingMaterials"),
    directLabor,
    auxiliaryLabor,
    utilities: sum("utilities"),
    depreciation,
    otherManufacturingCost: sum("otherManufacturingCost"),
    manufacturingCost,
    quantity,
    unitCost: quantity > 0 ? manufacturingCost / quantity : null,
  };
}

const costFactSelect = {
  year: true,
  month: true,
  productName: true,
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
} as const;
