import assert from "node:assert/strict";
import test from "node:test";
import { summarizeCostStructureRows, type CostStructureSummaryRow } from "./cost-structure-summary";

function product(overrides: Partial<CostStructureSummaryRow> = {}): CostStructureSummaryRow {
  return {
    productName: "消心痛",
    rawMaterials: 180997.71,
    packagingMaterials: 16261.97,
    directLaborWage: 8280.05,
    directLaborSocialSecurity: 2648.31,
    directLaborWelfare: null,
    auxiliaryLaborWage: 10758.85,
    auxiliaryLaborSocialSecurity: 4022.6,
    auxiliaryLaborWelfare: 34.47,
    utilities: 5038.22,
    depreciationDirect: 2036.95,
    depreciationAuxiliary: 462.64,
    otherManufacturingCost: 6294.23,
    quantity: 97650,
    ...overrides,
  };
}

test("sums amount and quantity once per product row", () => {
  const summary = summarizeCostStructureRows([
    product(),
    product({
      productName: "芦丁",
      rawMaterials: 91810.15,
      packagingMaterials: null,
      directLaborWage: null,
      directLaborSocialSecurity: null,
      auxiliaryLaborWage: null,
      auxiliaryLaborSocialSecurity: null,
      auxiliaryLaborWelfare: null,
      utilities: null,
      depreciationDirect: null,
      depreciationAuxiliary: null,
      otherManufacturingCost: null,
      quantity: 152370,
    }),
  ]);

  assert.ok(Math.abs(summary.totalAmount - 328646.15) < 1e-9);
  assert.equal(summary.totalQuantity, 250020);
  assert.ok(Math.abs(summary.unitCost - 328646.15 / 250020) < 1e-12);
});
