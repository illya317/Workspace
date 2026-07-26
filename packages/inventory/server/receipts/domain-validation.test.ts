import assert from "node:assert/strict";
import test from "node:test";
import {
  buildReceiptCreateCommand,
  buildReceiptReportConfirmCommand,
  buildReceiptReportReviewCommand,
  parsePackagingNote,
  parseProductionQuantity,
} from "../domain/inventory-receipts-validation";
import { InventoryReceiptCreateSchema } from "./schemas";

test("parses cases plus generic extra boxes or bottles", () => {
  assert.deepEqual(parseProductionQuantity("50件250盒"), { ok: true, data: { caseQuantity: 50, extraPackageQuantity: 250, extraUnit: "盒" } });
  assert.deepEqual(parseProductionQuantity("53件280瓶"), { ok: true, data: { caseQuantity: 53, extraPackageQuantity: 280, extraUnit: "瓶" } });
  assert.deepEqual(parseProductionQuantity("120件"), { ok: true, data: { caseQuantity: 120, extraPackageQuantity: 0, extraUnit: null } });
});

test("multiplies every packaging factor before the rightmost containers-per-case factor", () => {
  assert.deepEqual(parsePackagingNote("12片/板*2*400盒/件"), { ok: true, data: { packagesPerCase: 400, unitsPerPackage: 24, packageUnit: "盒" } });
  assert.deepEqual(parsePackagingNote("5片/板*300盒/件"), { ok: true, data: { packagesPerCase: 300, unitsPerPackage: 5, packageUnit: "盒" } });
  assert.deepEqual(parsePackagingNote("100片/瓶*480瓶/件"), { ok: true, data: { packagesPerCase: 480, unitsPerPackage: 100, packageUnit: "瓶" } });
  assert.deepEqual(parsePackagingNote("8片/板*2板*300盒/件"), { ok: true, data: { packagesPerCase: 300, unitsPerPackage: 16, packageUnit: "盒" } });
});

test("rejects ambiguous source text instead of guessing", () => {
  assert.equal(parseProductionQuantity("49件210件").ok, false);
  assert.equal(parseProductionQuantity("168.5件").ok, false);
  assert.equal(parsePackagingNote("12片/板*2").ok, false);
});

test("requires an actual 202x date batch number and non-negative integer quantities", () => {
  const base = {
    year: 2026, month: 5, productId: 9,
    batchNumber: "20260508", inputQuantityTenThousands: 250,
    workPoints: 446, caseQuantity: 0, extraPackageQuantity: 0, packagingNote: "100片/瓶*360瓶/件",
  };
  assert.equal(InventoryReceiptCreateSchema.safeParse(base).success, true);
  assert.equal(InventoryReceiptCreateSchema.safeParse({ ...base, batchNumber: "20420515" }).success, false);
  assert.equal(InventoryReceiptCreateSchema.safeParse({ ...base, batchNumber: "20260230" }).success, false);
  assert.equal(InventoryReceiptCreateSchema.safeParse({ ...base, caseQuantity: 1.5 }).success, false);
  assert.equal(InventoryReceiptCreateSchema.safeParse({ ...base, extraPackageQuantity: -1 }).success, false);
  assert.equal(InventoryReceiptCreateSchema.safeParse({ ...base, workPoints: -1 }).success, false);
  assert.equal(buildReceiptCreateCommand(base, 1).ok, true);
  assert.equal(buildReceiptCreateCommand({ ...base, batchNumber: "20260230" }, 1).ok, false);
  assert.equal(buildReceiptCreateCommand({ ...base, caseQuantity: 1.5 }, 1).ok, false);
  assert.equal(buildReceiptCreateCommand({ ...base, extraPackageQuantity: -1 }, 1).ok, false);
  assert.equal(buildReceiptCreateCommand({ ...base, productWorkPointVersion: 4 }, 1).ok, true);
});

test("builds the production quantity label from structured case and tail inputs", () => {
  const result = buildReceiptCreateCommand({
    year: 2026,
    month: 5,
    productId: 9,
    batchNumber: "20260508",
    inputQuantityTenThousands: 250,
    workPoints: 446,
    caseQuantity: 67,
    extraPackageQuantity: 110,
    packagingNote: "100片/瓶*360瓶/件",
  }, 1);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.data.productionQuantityText, "67件110瓶");
    assert.equal(result.data.extraPackageQuantity, 110);
    assert.equal(result.data.packageUnit, "瓶");
  }
});

test("rejects a package tail that should be carried into a complete case", () => {
  const result = buildReceiptCreateCommand({
    year: 2026,
    month: 5,
    productId: 9,
    batchNumber: "20260508",
    inputQuantityTenThousands: 250,
    workPoints: 446,
    caseQuantity: 67,
    extraPackageQuantity: 360,
    packagingNote: "100片/瓶*360瓶/件",
  }, 1);
  assert.deepEqual(result, { ok: false, issue: { message: "尾数必须小于每件360瓶" } });
});

test("requires a report id and optimistic version for monthly confirmation and review", () => {
  assert.deepEqual(buildReceiptReportConfirmCommand(12, { expectedVersion: 3 }, 7), {
    ok: true,
    data: { reportId: 12, expectedVersion: 3, userId: 7 },
  });
  assert.deepEqual(buildReceiptReportReviewCommand(0, { expectedVersion: 3 }, 8), {
    ok: false,
    issue: { message: "无效月报ID" },
  });
});
