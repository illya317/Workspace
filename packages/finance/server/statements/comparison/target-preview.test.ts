import assert from "node:assert/strict";
import test from "node:test";

import { StatementComparisonStateError } from "./service";
import { previewStatementComparisonTarget } from "./target-preview";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * 目标预览测试（Package 7）：注入 fake db / fake 报表加载，不触真实 prisma。
 */

test("entity target preview resolves company and a deterministic fingerprint", async () => {
  const db: any = {
    systemConfig: { findUnique: async () => ({ value: "true" }) },
    company: {
      findUnique: async () => ({
        id: 7,
        code: "02",
        party: { name: "测试公司" },
        financeCurrencyPolicy: { currency: { code: "CNY" } },
      }),
    },
  };
  const loadLines = async () => [
    { lineCode: "cash", label: "货币资金", amount: 90 },
    { lineCode: "ar", label: "应收账款", amount: 10 },
  ];

  const preview = await previewStatementComparisonTarget({
    kind: "entity",
    companyCode: "02",
    year: 2026,
    month: 6,
    periodKind: "cumulative",
    reportType: "balance",
  }, db, loadLines);

  assert.equal(preview.target.kind, "entity");
  if (preview.target.kind !== "entity") return;
  assert.equal(preview.target.companyId, 7);
  assert.equal(preview.lineCount, 2);
  assert.equal(preview.currencyCode, "CNY");
  assert.ok(preview.target.targetFingerprint.length > 0);
  const again = await previewStatementComparisonTarget({
    kind: "entity",
    companyCode: "02",
    year: 2026,
    month: 6,
    periodKind: "cumulative",
    reportType: "balance",
  }, db, loadLines);
  assert.equal(preview.target.targetFingerprint, (again.target as typeof preview.target).targetFingerprint);
});

test("consolidated target preview binds the batch output snapshot", async () => {
  const db: any = {
    systemConfig: { findUnique: async () => ({ value: "true" }) },
    financeConsolidationBatch: {
      findUnique: async () => ({
        id: 22,
        parentCompanyId: 1,
        parentCompanyName: "集团",
        year: 2026,
        month: 6,
        version: 3,
      }),
    },
    financeConsolidationOutputSnapshot: {
      findUnique: async () => ({
        id: 5,
        batchId: 22,
        outputFingerprint: "fp-consolidated-output",
        reportPayload: {
          batch: { presentationCurrency: "CNY" },
          // 真实快照 payload 使用合并词表（balanceSheet/incomeStatement/cashFlow）。
          statements: [{
            reportType: "balanceSheet",
            lines: [{ lineCode: "cash", label: "货币资金", amount: 90 }],
          }],
        },
      }),
    },
  };

  const preview = await previewStatementComparisonTarget({
    kind: "consolidated",
    batchId: 22,
    reportType: "balance",
  }, db);

  assert.equal(preview.target.kind, "consolidated");
  if (preview.target.kind !== "consolidated") return;
  assert.equal(preview.target.batchId, 22);
  assert.equal(preview.target.outputSnapshotId, 5);
  assert.equal(preview.target.targetFingerprint, "fp-consolidated-output");
  assert.equal(preview.lineCount, 1);
});

test("consolidated target preview fails closed when the batch has no output snapshot", async () => {
  const db: any = {
    systemConfig: { findUnique: async () => ({ value: "true" }) },
    financeConsolidationBatch: {
      findUnique: async () => ({
        id: 22,
        parentCompanyId: 1,
        parentCompanyName: "集团",
        year: 2026,
        month: 6,
        version: 3,
      }),
    },
    financeConsolidationOutputSnapshot: { findUnique: async () => null },
  };

  await assert.rejects(
    () => previewStatementComparisonTarget({ kind: "consolidated", batchId: 22, reportType: "balance" }, db),
    StatementComparisonStateError,
  );
});
