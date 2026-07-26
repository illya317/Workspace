import assert from "node:assert/strict";
import test from "node:test";
import type { InventoryReceiptRow } from "@workspace/inventory/types";
import { calculateReceiptSummaryTotals, compareReceiptRowsChronologically } from "./report-summary";

function row(input: Partial<InventoryReceiptRow>): InventoryReceiptRow {
  return {
    id: 1, version: 1, reportId: 1, batchId: 1, batchVersion: 1,
    productId: 9,
    productWorkPointId: 1, productWorkPointVersion: 1, workPoints: 459.5,
    year: 2026, month: 1, productName: "泮托拉唑钠肠溶片", specification: "40mg",
    batchNumber: "20260120", inputQuantityTenThousands: 50, productionQuantityText: "103件120盒", caseQuantity: 103,
    extraPackageQuantity: 120, packagesPerCase: 300, unitsPerPackage: 5, packageUnit: "盒", packagingNote: "5片/板*300盒/件",
    convertedPackages: 31020, convertedTenThousands: 15.51, sourceConvertedPackages: 31020, sourceConvertedTenThousands: 15.51,
    sourceConvertedPackagesFormula: null, sourceConvertedTenThousandsFormula: null, auditStatus: "ok", auditNote: null,
    sourceFile: null, sourceSheet: null, sourceRow: null,
    ...input,
  };
}

test("counts shared batch input once while summing every output", () => {
  const totals = calculateReceiptSummaryTotals([
    row({ batchId: 1 }),
    row({ id: 2, batchId: 1, productionQuantityText: "231件", caseQuantity: 231, extraPackageQuantity: 0, packagesPerCase: 200, unitsPerPackage: 7, packagingNote: "7片/板*200盒/件", convertedPackages: 46200, convertedTenThousands: 32.34 }),
  ]);
  assert.deepEqual(totals, {
    inputQuantityTenThousands: 50,
    workPoints: 459.5,
    convertedPackages: 77220,
    convertedTenThousands: 47.85,
  });
});

test("counts a product workpoint once when the product spans multiple batches", () => {
  const totals = calculateReceiptSummaryTotals([
    row({ batchId: 1, productWorkPointId: 7, workPoints: 2797.5 }),
    row({ id: 2, batchId: 2, productWorkPointId: 7, workPoints: 2797.5, inputQuantityTenThousands: 50 }),
    row({ id: 3, batchId: 3, productWorkPointId: 7, workPoints: 2797.5, inputQuantityTenThousands: 50 }),
  ]);
  assert.equal(totals.workPoints, 2797.5);
});

test("orders records by the date-like batch number descending within each month", () => {
  const rows = [
    row({ id: 3, batchId: 3, batchNumber: "20260521" }),
    row({ id: 1, batchId: 1, batchNumber: "20260507" }),
    row({ id: 2, batchId: 2, batchNumber: "20260520" }),
  ].sort(compareReceiptRowsChronologically);

  assert.deepEqual(rows.map((item) => item.batchNumber), ["20260521", "20260520", "20260507"]);
});
