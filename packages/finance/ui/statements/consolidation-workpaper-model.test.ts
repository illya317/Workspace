import assert from "node:assert/strict";
import test from "node:test";

import type {
  ConsolidatedOutputLine,
  ConsolidatedReportOutputPackage,
  ConsolidationAdjustmentComparison,
  ConsolidationEntrySnapshot,
  ConsolidationEntitySnapshot,
} from "@workspace/finance/types";

import {
  consolidationWorkpaperAdjustmentAmounts,
  consolidationWorkpaperEntities,
  consolidationWorkpaperEntityAmount,
  consolidationWorkpaperEntryEffects,
  consolidationWorkpaperLines,
  consolidationWorkpaperOpenItems,
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
  const zeroAmountEntity = {
    id: 3,
    companyCode: "ZX03",
    companyName: "零发生子公司",
    role: "subsidiary",
    isConsolidated: true,
  } as ConsolidationEntitySnapshot;
  assert.deepEqual(
    consolidationWorkpaperEntities(report, [zeroAmountEntity]).map((entity) => entity.companyCode),
    ["ZX01", "ZX02", "ZX03"],
  );
  assert.equal(consolidationWorkpaperEntityAmount(line, 1), 60);
  assert.equal(consolidationWorkpaperEntityAmount(line, 999), 0);
});

test("workpaper summarizes draft and approved entry effects once per group voucher", () => {
  const entries = [{
    id: 9,
    entryNo: "E-009",
    entryType: "intercompanyBalance",
    title: "内部往来抵销",
    status: "draft",
    lines: [
      { id: 91, statementType: "balanceSheet", lineCode: "receivables", periodBasis: "current", companyCode: "ZX01", debit: 0, credit: 30, note: "抵销内部应收" },
      { id: 93, statementType: "balanceSheet", lineCode: "receivables", periodBasis: "current", companyCode: "ZX02", debit: 10, credit: 0, note: "抵销内部应付" },
      { id: 92, statementType: "balanceSheet", lineCode: "receivables", periodBasis: "comparative", companyCode: "ZX01", debit: 0, credit: 5, note: null },
    ],
  }] as ConsolidationEntrySnapshot[];
  assert.deepEqual(consolidationWorkpaperEntryEffects(entries, "balanceSheet", line), [{
    key: "9-receivables",
    entryNo: "E-009",
    title: "内部往来抵销",
    typeLabel: "内部往来",
    companies: "ZX01 ↔ ZX02",
    amount: -20,
    note: "抵销内部应收；抵销内部应付",
  }]);
});

test("workpaper open items exclude comparisons already represented by an active group voucher", () => {
  const entries = [{ id: 9, status: "draft" }] as ConsolidationEntrySnapshot[];
  const base = {
    category: "intercompany",
    title: "内部往来",
    entrySummary: "内部往来核对",
    leftCompany: "母公司",
    leftAccount: "其他应收款",
    leftDirection: "借",
    leftAmount: 100,
    leftCurrencyCode: "CNY",
    leftSources: [],
    leftHistoricalSourceCount: 0,
    rightCompany: "子公司",
    rightAccount: "其他应付款",
    rightDirection: "贷",
    rightAmount: 100,
    rightCurrencyCode: "CNY",
    rightSources: [],
    rightHistoricalSourceCount: 0,
    displayPeriodLabel: "2026年",
    sourceDisplayNote: "来源说明",
    difference: 0,
    differenceCurrencyCode: "CNY",
    matchingRule: "往来匹配",
    treatmentKind: "eliminate",
    treatmentLabel: "生成抵销分录",
    treatmentDetail: "双方一致",
  } as const;
  const comparisons = [{
    ...base,
    key: "included",
    entryId: 9,
    status: "equal",
    reviewStatus: "pending",
  }, {
    ...base,
    key: "open",
    entryId: null,
    status: "missingCounterpart",
    reviewStatus: "exception",
    rightAmount: 0,
    difference: 100,
  }] as ConsolidationAdjustmentComparison[];
  assert.deepEqual(consolidationWorkpaperOpenItems(comparisons, entries), [{
    key: "open",
    categoryLabel: "内部往来",
    title: "内部往来",
    parties: "母公司 ↔ 子公司",
    bookAmounts: "借 100.00 CNY / 贷 0.00 CNY",
    difference: 100,
    currencyCode: "CNY",
    statusLabel: "缺少对方",
    actionLabel: "生成抵销分录",
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

test("income workpaper carries entity net profit into the parent-attribution base", () => {
  const entityAmounts = [{
    entitySnapshotId: 1,
    companyCode: "ZX01",
    companyName: "母公司",
    role: "parent" as const,
    amount: -60,
    previousAmount: -50,
  }];
  const netProfit = { ...line, lineCode: "netProfit", amount: -60, sourceAmount: -60, entityAmounts };
  const parent = { ...line, lineCode: "netProfitAttributableToParent", amount: -50, sourceAmount: -60, entityAmounts: entityAmounts.map((entity) => ({ ...entity, amount: 0 })) };
  const nci = { ...line, lineCode: "netProfitAttributableToNci", amount: -10, sourceAmount: 0, entityAmounts: entityAmounts.map((entity) => ({ ...entity, amount: 0 })) };
  const rows = consolidationWorkpaperLines({
    reportType: "incomeStatement",
    label: "合并利润表",
    lines: [netProfit, parent, nci],
    totals: {},
  });
  assert.equal(consolidationWorkpaperEntityAmount(rows[1]!, 1), -60);
  assert.equal(consolidationWorkpaperEntityAmount(rows[2]!, 1), 0);
});
