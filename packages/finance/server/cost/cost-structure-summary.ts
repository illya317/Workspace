import { costStructureTotalCost, type CostStructureCostFields } from "./cost-structure-products";

export interface CostStructureSummaryRow extends CostStructureCostFields {
  quantity: number | null;
  productName: string | null;
}

function add(map: Map<string, number>, key: string, value: number) {
  map.set(key, (map.get(key) ?? 0) + value);
}

export function summarizeCostStructureRows(rows: CostStructureSummaryRow[]) {
  let totalAmount = 0;
  let totalQuantity = 0;
  const productMap = new Map<string, number>();
  const categoryMap = new Map<string, number>();

  for (const row of rows) {
    const amount = costStructureTotalCost(row);
    totalAmount += amount;
    totalQuantity += row.quantity ?? 0;

    if (row.productName) add(productMap, row.productName, amount);
    add(categoryMap, "原材料", row.rawMaterials ?? 0);
    add(categoryMap, "包材", row.packagingMaterials ?? 0);
    add(categoryMap, "人工", (row.directLaborWage ?? 0) + (row.directLaborSocialSecurity ?? 0) + (row.directLaborWelfare ?? 0));
    add(categoryMap, "辅助人工", (row.auxiliaryLaborWage ?? 0) + (row.auxiliaryLaborSocialSecurity ?? 0) + (row.auxiliaryLaborWelfare ?? 0));
    add(categoryMap, "制造费用", (row.utilities ?? 0) + (row.depreciationDirect ?? 0) + (row.depreciationAuxiliary ?? 0) + (row.otherManufacturingCost ?? 0));
  }

  const sortMap = (map: Map<string, number>) =>
    [...map.entries()]
      .sort((left, right) => right[1] - left[1])
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
