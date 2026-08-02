import assert from "node:assert/strict";
import test from "node:test";

import { validateInventoryPhysicalCountImport } from "./physical-count-import";

const valid = {
  companyCode: "01",
  sourceFile: "丰华.xlsx",
  sourceSheet: "1&2",
  sourceSha256: "a".repeat(64),
  stocktakeNo: "PD-20260630-CUTOVER",
  stocktakeDate: "2026-06-30",
  lines: [
    { sourceRow: 3, itemCode: "TNK-20MG", itemName: "替奈普酶", specification: "20mg/支", baseUnit: "支", batchNo: "20220501", quantity: 291 },
  ],
};

test("physical count accepts quantity facts without valuation fields", () => {
  assert.equal(validateInventoryPhysicalCountImport(valid).lines[0]?.quantity, 291);
});

test("physical count rejects duplicate item and batch dimensions", () => {
  assert.throws(() => validateInventoryPhysicalCountImport({ ...valid, lines: [...valid.lines, { ...valid.lines[0]!, sourceRow: 4 }] }), /维度重复/);
});
