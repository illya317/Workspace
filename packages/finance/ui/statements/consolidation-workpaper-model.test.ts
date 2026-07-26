import assert from "node:assert/strict";
import test from "node:test";

import type {
  ConsolidatedOutputLine,
  ConsolidatedReportOutputPackage,
  ConsolidationEntrySnapshot,
} from "@workspace/finance/types";

import {
  consolidationWorkpaperAdjustmentAmounts,
  consolidationWorkpaperEntities,
  consolidationWorkpaperEntityAmount,
  consolidationWorkpaperEntryEffects,
  consolidationWorkpaperLines,
} from "./consolidation-workpaper-model";

const line: ConsolidatedOutputLine = {
  lineCode: "receivables",
  label: "应收账款",
  code: null,
  amount: 70,
  previousAmount: 60,
  section: "currentAssets",
  side: "debit",
  direction: null,
  subtract: false,
  isHeader: false,
  isTotal: false,
  isGrandTotal: false,
  sourceAmount: 100,
  adjustmentAmount: -30,
  entityAmounts: [
    { entitySnapshotId: 2, companyCode: "ZX02", companyName: "子公司", role: "subsidiary", amount: 40, previousAmount: 20 },
    { entitySnapshotId: 1, companyCode: "ZX01", companyName: "母公司", role: "parent", amount: 60, previousAmount: 40 },
  ],
};

test("workpaper retains parent-first entity columns and translated source amounts", () => {
  const report = {
    statements: [{ reportType: "balanceSheet", label: "合并资产负债表", lines: [line], totals: {} }],
  } as ConsolidatedReportOutputPackage;
  assert.deepEqual(
    consolidationWorkpaperEntities(report).map((entity) => entity.companyCode),
    ["ZX01", "ZX02"],
  );
  assert.equal(consolidationWorkpaperEntityAmount(line, 1), 60);
  assert.equal(consolidationWorkpaperEntityAmount(line, 999), 0);
});

test("workpaper traces approved current-period entry effects using the report line side", () => {
  const entries = [{
    id: 9,
    entryNo: "E-009",
    entryType: "intercompanyBalance",
    title: "内部往来抵销",
    status: "approved",
    lines: [
      { id: 91, statementType: "balanceSheet", lineCode: "receivables", periodBasis: "current", companyCode: "ZX01", debit: 0, credit: 30, note: "抵销内部应收" },
      { id: 92, statementType: "balanceSheet", lineCode: "receivables", periodBasis: "comparative", companyCode: "ZX01", debit: 0, credit: 5, note: null },
    ],
  }] as ConsolidationEntrySnapshot[];
  assert.deepEqual(consolidationWorkpaperEntryEffects(entries, "balanceSheet", line), [{
    key: "9-91",
    title: "内部往来抵销",
    typeLabel: "内部往来",
    companyCode: "ZX01",
    debit: 0,
    credit: 30,
    amount: -30,
    note: "抵销内部应收",
  }]);
});

test("workpaper presents net eliminations in formal debit and credit columns", () => {
  assert.deepEqual(consolidationWorkpaperAdjustmentAmounts(line), { debit: 0, credit: 30 });
  assert.deepEqual(
    consolidationWorkpaperAdjustmentAmounts({ ...line, side: "credit", adjustmentAmount: 30 }),
    { debit: 0, credit: 30 },
  );
  assert.deepEqual(
    consolidationWorkpaperAdjustmentAmounts({ ...line, side: "credit", adjustmentAmount: -30 }),
    { debit: 30, credit: 0 },
  );
});

test("balance sheet workpaper adds the liabilities and equity bridge total", () => {
  const totalLiabilities = { ...line, lineCode: "totalLiabilities", label: "负债合计", amount: 30, sourceAmount: 40, adjustmentAmount: -10 };
  const totalEquity = { ...line, lineCode: "totalEquity", label: "所有者权益合计", amount: 40, sourceAmount: 60, adjustmentAmount: -20 };
  const rows = consolidationWorkpaperLines({ reportType: "balanceSheet", label: "合并资产负债表", lines: [totalLiabilities, totalEquity], totals: {} });
  const total = rows.at(-1)!;
  assert.equal(total.lineCode, "totalLiabilitiesAndEquity");
  assert.deepEqual([total.sourceAmount, total.adjustmentAmount, total.amount], [100, -30, 70]);
});
