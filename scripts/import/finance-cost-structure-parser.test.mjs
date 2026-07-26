import assert from "node:assert/strict";
import test from "node:test";
import { parseCostStructure, selectMonthlyProductRows } from "./finance-cost-structure-parser.mjs";

function row(overrides) {
  return {
    productStatus: "产成品",
    productName: "消心痛",
    workHours: 837.6,
    cost: {
      rawMaterials: 180997.71,
      utilities: 5038.22,
      manufacturingSubtotal: 31296.27,
    },
    inboundQuantity: 97650,
    sourceSheetKind: "monthly-cost",
    year: 2026,
    month: 3,
    source: { sheet: "26.3月", row: 6 },
    ...overrides,
  };
}

test("selects the first-table rows for finished goods and work in progress", () => {
  const unitCostDuplicate = row({
    cost: { rawMaterials: 1.8535, utilities: 0.0516, manufacturingSubtotal: 0.3205 },
    source: { sheet: "26.3月", row: 36 },
  });
  const workInProgress = row({
    productStatus: "在产品",
    productName: "左氧24粒",
    inboundQuantity: null,
    source: { sheet: "26.3月", row: 16 },
  });
  const summarySheet = row({ sourceSheetKind: "unit-cost-summary", source: { sheet: "26年单位成本", row: 6 } });

  const selected = selectMonthlyProductRows([
    unitCostDuplicate,
    workInProgress,
    summarySheet,
    row({}),
  ]);

  assert.equal(selected.length, 2);
  assert.equal(selected[0].source.row, 6);
  assert.equal(selected[1].productStatus, "在产品");
  assert.equal(selected[1].inboundQuantity, null);
});

test("imports one product-grain fact without persisting derived values", () => {
  const result = parseCostStructure({
    sourceFile: "26年成本汇总构成表.xls",
    standardRows: [row({})],
  }, "26年成本汇总构成表.xls");

  assert.equal(result.facts.length, 1);
  assert.deepEqual(result.facts[0], {
    year: 2026,
    month: 3,
    productStatus: "产成品",
    productName: "消心痛",
    workHours: 837.6,
    rawMaterials: 180997.71,
    packagingMaterials: null,
    directLaborWage: null,
    directLaborSocialSecurity: null,
    directLaborWelfare: null,
    auxiliaryLaborWage: null,
    auxiliaryLaborSocialSecurity: null,
    auxiliaryLaborWelfare: null,
    utilities: 5038.22,
    depreciationDirect: null,
    depreciationAuxiliary: null,
    otherManufacturingCost: null,
    quantity: 97650,
    unit: "件",
    sourceFile: "26年成本汇总构成表.xls",
    sourceSheet: "26.3月",
    sourceRow: 6,
  });
});
