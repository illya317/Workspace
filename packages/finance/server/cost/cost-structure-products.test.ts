import assert from "node:assert/strict";
import test from "node:test";
import { buildCostStructureProductRows, type CostStructureProductFactRow } from "./cost-structure-products";

function product(overrides: Partial<CostStructureProductFactRow> = {}): CostStructureProductFactRow {
  return {
    id: 1,
    importId: 11,
    productId: 31,
    receiptReportId: 7,
    year: 2026,
    month: 3,
    productStatus: "产成品",
    productName: "消心痛",
    workHours: 837.6,
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
    unit: "件",
    sourceFile: "26年成本汇总构成表.xls",
    sourceSheet: "26.3月",
    sourceRow: 6,
    createdAt: new Date("2026-03-31T08:00:00.000Z"),
    updatedAt: new Date("2026-04-01T08:00:00.000Z"),
    product: { id: 31, code: "product_09", name: "硝酸异山梨酯片" },
    receiptReport: { id: 7, status: "approved" },
    ...overrides,
  };
}

test("projects a product fact and calculates only the derived Excel columns", () => {
  const rows = buildCostStructureProductRows([product()]);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].workHours, 837.6);
  assert.equal(rows[0].rawMaterials, 180997.71);
  assert.equal(rows[0].manufacturingSubtotal, 31296.27);
  assert.equal(rows[0].productMasterStatus, "linked");
  assert.equal(rows[0].productMasterCode, "product_09");
  assert.equal(rows[0].productMasterName, "硝酸异山梨酯片");
  assert.equal(rows[0].receiptReportStatus, "approved");
  assert.ok(Math.abs((rows[0].unitCost ?? 0) - 236836 / 97650) < 1e-12);
  assert.equal(rows[0].sourceRow, 6);
});
