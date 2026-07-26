import assert from "node:assert/strict";
import test from "node:test";

import type { DataSurfaceCellSpec } from "@workspace/core/ui";
import type {
  ConsolidationAdjustmentComparison,
  ConsolidationEntityCoverage,
  StatementSourceCoverage,
} from "@workspace/finance/types";

import {
  adjustmentComparisonExpandedRow,
  consolidationEntityColumns,
  createAdjustmentComparisonColumns,
  sourceCoverageTone,
} from "./consolidation-columns";

const comparison: ConsolidationAdjustmentComparison = {
  key: "intercompanyBalance:1:2",
  entryId: 41,
  category: "intercompany",
  title: "示例集团 → 示例子公司甲 往来款",
  entrySummary: "借：其他应付款；贷：其他应收款",
  leftCompany: "示例集团",
  leftAccount: "122101 其他应收款-单位",
  leftDirection: "借",
  leftAmount: 1_668_000,
  leftSources: [{
    voucherItemId: 101,
    sourceKind: "voucher",
    voucherNo: "2025-12-记-0046",
    voucherDate: "2025-12-25",
    accountCode: "122101",
    accountName: "其他应收款-单位",
    description: "代付集团内工资",
    direction: "借",
    amount: 1_668_000,
    currencyCode: "CNY",
  }],
  leftHistoricalSourceCount: 0,
  rightCompany: "示例子公司甲",
  rightAccount: "224101 其他应付款-单位",
  rightDirection: "贷",
  rightAmount: 1_668_000,
  rightSources: [{
    voucherItemId: 202,
    sourceKind: "voucher",
    voucherNo: "2025-12-记-0106",
    voucherDate: "2025-12-25",
    accountCode: "224101",
    accountName: "其他应付款-单位",
    description: "集团内工资往来",
    direction: "贷",
    amount: 1_668_000,
    currencyCode: "CNY",
  }],
  rightHistoricalSourceCount: 0,
  displayPeriodLabel: "2026年",
  sourceDisplayNote: "勾稽计算覆盖全部历史；仅显示2026年。",
  difference: 0,
  status: "equal",
  reviewStatus: "pending",
  matchingRule: "双方公司辅助核算互指且借贷金额一致",
};

test("keeps the adjustment review summary inside four flexible columns", () => {
  const columns = createAdjustmentComparisonColumns({
    expandedKeys: new Set([comparison.key]),
  });

  assert.deepEqual(columns.map((column) => column.key), ["entry", "left", "right", "review"]);
  assert.ok(columns.every((column) => column.width === undefined));

  const reviewCell = columns.at(-1)?.cell(comparison) as DataSurfaceCellSpec;
  assert.equal(reviewCell.kind, "group");
  assert.match(JSON.stringify(reviewCell), /拟抵销分录/);
  assert.match(JSON.stringify(reviewCell), /待审阅/);
  assert.doesNotMatch(JSON.stringify(reviewCell), /"kind":"actions"/);

  const entryCell = columns[0]!.cell(comparison) as DataSurfaceCellSpec;
  assert.doesNotMatch(JSON.stringify(entryCell), /双方公司辅助核算互指/);
});

test("compares source vouchers in two ledger columns without repeating companies", () => {
  const expanded = adjustmentComparisonExpandedRow({
    ...comparison,
    leftSources: [
      ...comparison.leftSources,
      { ...comparison.leftSources[0]!, voucherItemId: 102, voucherNo: "2025-12-记-0047" },
    ],
  });

  assert.equal(expanded.kind, "group");
  if (expanded.kind !== "group") return;
  const dataCell = expanded.items.find((item) => item.kind === "data");
  assert.equal(dataCell?.kind, "data");
  if (!dataCell || dataCell.kind !== "data" || dataCell.data.kind !== "table") return;
  assert.equal(dataCell.data.rows.length, 2);
  assert.deepEqual(dataCell.data.columns.map((column) => column.key), ["left", "right"]);
  assert.deepEqual(dataCell.data.columns.map((column) => column.label), [
    "账面一｜示例集团",
    "账面二｜示例子公司甲",
  ]);
  assert.ok(dataCell.data.columns.every((column) => column.width === undefined));
  assert.deepEqual(dataCell.data.scroll, { y: "hidden" });

  const firstLeftCell = dataCell.data.columns[0]!.cell(dataCell.data.rows[0]!);
  assert.doesNotMatch(JSON.stringify(firstLeftCell), /示例集团有限公司/);
  assert.match(JSON.stringify(firstLeftCell), /2025-12-记-0046/);
  assert.doesNotMatch(JSON.stringify(firstLeftCell), /2025-12-25/);
  assert.equal(dataCell.data.rows[1]!.right, null);
});

test("renders cached comparison rows without newly added history metadata", () => {
  const legacy = { ...comparison } as ConsolidationAdjustmentComparison & Record<string, unknown>;
  Reflect.deleteProperty(legacy, "displayPeriodLabel");
  Reflect.deleteProperty(legacy, "sourceDisplayNote");
  Reflect.deleteProperty(legacy, "leftHistoricalSourceCount");
  Reflect.deleteProperty(legacy, "rightHistoricalSourceCount");

  const columns = createAdjustmentComparisonColumns({
    expandedKeys: new Set(),
  });
  const entry = columns[0]!.cell(legacy) as DataSurfaceCellSpec;
  const expanded = adjustmentComparisonExpandedRow(legacy);

  assert.doesNotMatch(JSON.stringify(entry), /undefined/);
  assert.doesNotMatch(JSON.stringify(expanded), /undefined/);
  assert.match(JSON.stringify(entry), /本期/);
});

test("uses only ready and not-ready tones for individual statements", () => {
  const source: StatementSourceCoverage = {
    kind: "system",
    status: "available",
    label: "系统账来源",
    detail: "期间事实",
    lineCount: 0,
    sourcedLineCount: 0,
    manualLineCount: 0,
    importedLineCount: 0,
    formulaLineCount: 0,
  };

  assert.equal(sourceCoverageTone(source), "green");
  assert.equal(sourceCoverageTone({ ...source, evidence: "已核对并冻结" }), "green");
  assert.equal(sourceCoverageTone({ ...source, kind: "workpaper", status: "draft" }), "green");
  assert.equal(sourceCoverageTone({ ...source, kind: "workpaper", status: "submitted" }), "green");
  assert.equal(sourceCoverageTone({ ...source, kind: "missing", status: "missing" }), "red");
});

test("keeps ownership beside the company instead of a separate column", () => {
  const entity = {
    name: "加拿大",
    fullName: "The Palace Institute of Medical Biology Co Ltd",
    code: "05",
    parentCode: "02",
    parentName: "示例子公司甲",
    role: "子公司",
    shareRatio: 0.75,
  } as ConsolidationEntityCoverage;

  assert.deepEqual(consolidationEntityColumns.map((column) => column.key), [
    "company",
    "balance",
    "income",
    "cash-flow",
  ]);
  const companyCell = consolidationEntityColumns[0]!.cell(entity) as DataSurfaceCellSpec;
  assert.equal(companyCell.kind, "group");
  assert.match(JSON.stringify(companyCell), /持股 75\.00%/);
  assert.match(JSON.stringify(companyCell), /The Palace Institute of Medical Biology Co Ltd/);
  assert.match(JSON.stringify(companyCell), /示例子公司甲 → 加拿大/);
  assert.doesNotMatch(JSON.stringify(companyCell), /02 → 05/);
  assert.doesNotMatch(JSON.stringify(companyCell), /"wrap":"truncate"/);
});
