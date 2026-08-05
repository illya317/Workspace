import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";

import type { ConsolidatedReportOutputPackage } from "@workspace/finance/types";

import { buildNciEquityWorkpaperWorkbook } from "./nci-equity-workpaper-workbook";

test("exports the NCI rollforward, voucher trail, and independent cross-check", () => {
  const report = {
    batch: { parentCompanyName: "示例集团", year: 2026, month: 6 },
    nciEquityWorkpaper: {
      openingBalance: 100,
      contributions: 25,
      profitLoss: 10,
      otherComprehensiveIncome: 5,
      distributions: -3,
      ownershipChanges: 0,
      otherAdjustments: 0,
      calculatedClosingBalance: 137,
      reportedClosingBalance: 137,
      rollforwardDifference: 0,
      netAssetsCrossCheck: 137,
      crossCheckDifference: 0,
      status: "reconciled",
      crossCheckStatus: "reconciled",
      movements: [{
        key: "profit",
        movementType: "profitLoss",
        label: "少数股东应占净利润",
        postingDate: "2026-06-30",
        amount: 10,
        entitySnapshotId: 2,
        companyCode: "S01",
        companyName: "子公司",
        entryId: 9,
        entryNo: "合-0009",
        evidence: "六月净利润及月平均汇率",
      }],
    },
  } as ConsolidatedReportOutputPackage;
  const workbook = XLSX.read(buildNciEquityWorkpaperWorkbook(report), { type: "buffer", cellNF: true });
  assert.deepEqual(workbook.SheetNames, ["少数股东权益变动底稿"]);
  const sheet = workbook.Sheets["少数股东权益变动底稿"]!;
  assert.equal(sheet.A1?.v, "少数股东权益变动表");
  assert.equal(sheet.B11?.v, 137);
  assert.equal(sheet.B11?.f, "ROUND(B4+SUM(B5:B10),2)");
  assert.equal(sheet.B13?.v, 0);
  assert.equal(sheet.C15?.v, "不生成补数凭证");
  assert.equal(sheet.D18?.v, "合-0009");
});
