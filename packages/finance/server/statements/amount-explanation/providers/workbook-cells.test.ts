import assert from "node:assert/strict";
import test from "node:test";

import type { AmountExplanationDb } from "../db";
import type { NormalizedQuery } from "../query";
import { workbookCellProvider } from "./workbook-cells";
import type { ProviderContext } from "./provider";

/* eslint-disable @typescript-eslint/no-explicit-any */

const TARGET_FINGERPRINT = "target-fp-workbook";

function snapshotWithFormula() {
  return {
    dto: {
      version: 1,
      file: { fileName: "匿名化.xlsx", mimeType: "", fileSize: 1, sha256: "a".repeat(64) },
      workbookFingerprint: "b".repeat(64),
      parser: { id: "sheetjs-ce", version: "0.20.3" },
      calculation: { mode: null, fullCalcOnLoad: null },
      namedRanges: [],
      sheets: [
        {
          name: "报表一",
          index: 0,
          visibility: "visible",
          usedRange: "A1:B4",
          merges: [],
          mergesTruncated: false,
          cells: [
            { a1: "A2", row: 1, col: 0, type: "s", value: "长期股权投资", text: null, formula: null, numberFormat: null },
            { a1: "B2", row: 1, col: 1, type: "n", value: 88054250.6, text: null, formula: "B3+B4", cachedValue: 88054250.6, numberFormat: "#,##0.00" },
            { a1: "B3", row: 2, col: 1, type: "n", value: 82000000, text: null, formula: null, numberFormat: null },
            { a1: "B4", row: 3, col: 1, type: "n", value: 6054250.6, text: null, formula: null, numberFormat: null },
          ],
        },
      ],
      scan: { sheetCount: 1, cellCount: 4, formulaCellCount: 1, rejectedExternalLinks: 0, warnings: [], unsupported: [] },
    },
    recalculation: {
      adapterId: "platform.formula.workbook-hyperformula",
      adapterVersion: "3.3.0",
      truncated: false,
      adapterError: null,
      cells: {
        "报表一!B2": {
          formula: "B3+B4",
          cachedValue: 88054250.6,
          cachedValueProvided: true,
          recalculatedValue: 88054250.6,
          recalculatedError: null,
          evaluation: "ok",
          trust: "recalculated_match",
          precedents: ["报表一!B3", "报表一!B4"],
          dependents: [],
          unsupportedFeatures: [],
        },
      },
      diagnostics: [],
      stats: { visitedNodes: 3, maxDepthReached: 1, edgeCount: 2 },
    },
  };
}

function makeDb(overrides: { mapping?: any; pkg?: any } = {}): AmountExplanationDb {
  const mapping = overrides.mapping === undefined
    ? {
        id: 11,
        packageId: 22,
        workbookSha256: "a".repeat(64),
        targetCompanyId: 7,
        targetCompanyCode: "C007",
        targetCompanyName: "示例公司",
        targetParentCompanyId: null,
        targetParentCompanyCode: null,
        targetParentCompanyName: null,
        year: 2024,
        month: 6,
      }
    : overrides.mapping;
  const pkg = overrides.pkg === undefined
    ? {
        id: 22,
        fileName: "匿名化.xlsx",
        sha256: "a".repeat(64),
        workbookSnapshot: snapshotWithFormula(),
      }
    : overrides.pkg;
  return {
    financeStatementComparisonMapping: {
      findFirst: async () => mapping,
    },
    financeStatementComparisonPackage: {
      findUnique: async () => pkg,
    },
  } as unknown as AmountExplanationDb;
}

function makeCtx(db: AmountExplanationDb, workbookCell: string | null): ProviderContext {
  const query = {
    reportContext: workbookCell === null
      ? null
      : {
          target: {
            kind: "entity" as const,
            companyId: 7,
            year: 2024,
            month: 6,
            periodKind: "monthly" as const,
            reportType: "balance" as const,
            targetFingerprint: TARGET_FINGERPRINT,
          },
          lineCode: "longTermInvest",
          workbookCell,
        },
    currencyCode: "CNY",
  } as unknown as NormalizedQuery;
  return {
    db,
    query,
    scope: null as unknown as ProviderContext["scope"],
    windowUpperMinor: 100_000_000_000n,
    candidateLimit: 50,
  };
}

test("未携带 workbookCell → skipped，零查询", async () => {
  const outcome = await workbookCellProvider().collect(makeCtx(makeDb(), null));
  assert.equal(outcome.diagnostics.status, "skipped");
  assert.equal(outcome.diagnostics.queryCount, 0);
  assert.equal(outcome.candidates.length, 0);
});

test("无已确认映射 → unavailable", async () => {
  const outcome = await workbookCellProvider().collect(makeCtx(makeDb({ mapping: null }), "报表一!B2"));
  assert.equal(outcome.diagnostics.status, "unavailable");
  assert.equal(outcome.candidates.length, 0);
});

test("sha 漂移 → unavailable（映射失效）", async () => {
  const outcome = await workbookCellProvider().collect(
    makeCtx(makeDb({ pkg: { id: 22, fileName: "x", sha256: "f".repeat(64), workbookSnapshot: {} } }), "报表一!B2"),
  );
  assert.equal(outcome.diagnostics.status, "unavailable");
});

test("目标单元格 + 公式前驱作为候选证据发射（金额取缓存值，符号原样）", async () => {
  const outcome = await workbookCellProvider().collect(makeCtx(makeDb(), "报表一!B2"));
  assert.equal(outcome.diagnostics.status, "ok");
  assert.equal(outcome.diagnostics.queryCount, 2);
  assert.equal(outcome.candidates.length, 3);

  const [root, b3, b4] = outcome.candidates;
  assert.equal(root!.evidence.amount, "88054250.60");
  assert.equal(root!.evidence.sourceRecordId, "comparisonPackage:22:报表一!B2");
  assert.deepEqual(root!.evidence.workbook, {
    packageId: 22,
    sheet: "报表一",
    cell: "B2",
    formula: "B3+B4",
    cachedValue: "88054250.60",
    recalculatedValue: "88054250.60",
    trust: "recalculated_match",
  });
  assert.deepEqual(root!.evidence.company, { id: 7, code: "C007", name: "示例公司" });
  assert.deepEqual(root!.evidence.period, { year: 2024, month: 6 });
  assert.equal(root!.lineCode, "longTermInvest");
  assert.match(root!.evidence.evidenceId, /^ev_workbookCell_[0-9a-f]{32}$/);

  assert.equal(b3!.evidence.amount, "82000000.00");
  assert.equal(b3!.evidence.workbook!.cell, "B3");
  assert.equal(b4!.evidence.amount, "6054250.60");

  // 确定性：providerOrder 严格递增，BFS 顺序固定。
  assert.ok(root!.providerOrder < b3!.providerOrder && b3!.providerOrder < b4!.providerOrder);
});

test("不存在的单元格 → unavailable", async () => {
  const outcome = await workbookCellProvider().collect(makeCtx(makeDb(), "报表一!Z99"));
  assert.equal(outcome.diagnostics.status, "unavailable");
});
