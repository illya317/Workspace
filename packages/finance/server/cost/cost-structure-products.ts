export interface CostStructureProductFactRow {
  id: number;
  importId: number;
  productId: number | null;
  receiptReportId: number | null;
  year: number;
  month: number | null;
  productStatus: string | null;
  productName: string | null;
  workHours: number | null;
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
  unit: string | null;
  sourceFile: string;
  sourceSheet: string | null;
  sourceRow: number | null;
  createdAt: Date;
  updatedAt: Date;
  product?: { id: number; code: string; name: string } | null;
  receiptReport?: { id: number; status: string } | null;
}

export interface CostStructureProductRow extends CostStructureProductFactRow {
  productMasterCode: string | null;
  productMasterName: string | null;
  manufacturingSubtotal: number;
  unitCost: number | null;
  productMasterStatus: "linked" | "unlinked";
  receiptReportStatus: string | null;
}

export interface CostStructureCostFields {
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
}

function sum(values: Array<number | null>) {
  return values.reduce<number>((total, value) => total + (value ?? 0), 0);
}

export function costStructureManufacturingSubtotal(row: CostStructureCostFields) {
  return sum([
    row.directLaborSocialSecurity,
    row.directLaborWelfare,
    row.auxiliaryLaborWage,
    row.auxiliaryLaborSocialSecurity,
    row.auxiliaryLaborWelfare,
    row.utilities,
    row.depreciationDirect,
    row.depreciationAuxiliary,
    row.otherManufacturingCost,
  ]);
}

export function costStructureTotalCost(row: CostStructureCostFields) {
  return sum([
    row.rawMaterials,
    row.packagingMaterials,
    row.directLaborWage,
    costStructureManufacturingSubtotal(row),
  ]);
}

export function buildCostStructureProductRows(facts: CostStructureProductFactRow[]) {
  return facts.map((fact): CostStructureProductRow => {
    const manufacturingSubtotal = costStructureManufacturingSubtotal(fact);
    const totalCost = costStructureTotalCost(fact);
    return {
      ...fact,
      productMasterCode: fact.product?.code ?? null,
      productMasterName: fact.product?.name ?? null,
      manufacturingSubtotal,
      unitCost: fact.quantity && fact.quantity > 0 ? totalCost / fact.quantity : null,
      productMasterStatus: fact.productId === null ? "unlinked" : "linked",
      receiptReportStatus: fact.receiptReport?.status ?? null,
    };
  });
}
