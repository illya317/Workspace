import assert from "node:assert/strict";
import test from "node:test";

import {
  buildEnsureConsolidationBatchCommand,
  buildConsolidationBatchLifecycleCommand,
  buildSaveConsolidationSourcesCommand,
  validateConsolidationBatchTransition,
  validateConsolidationSubmission,
} from "./consolidation-batch-validation";
import { buildDeleteConsolidationBatchCommand } from "./consolidation-batch-delete-validation";

test("builds an explicit parent and period consolidation command", () => {
  const result = buildEnsureConsolidationBatchCommand({ parentCompanyId: 1, year: 2026, month: 6 }, 9);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.data.input.parentCompanyId, 1);
  assert.equal(result.data.input.periodKind, "month");
  assert.equal(result.data.input.baseBatchId, null);
});

test("requires annual and quarterly batches to end at their accounting boundary", () => {
  const annual = buildEnsureConsolidationBatchCommand({
    parentCompanyId: 1,
    year: 2026,
    month: 12,
    periodKind: "year",
  }, 9);
  assert.equal(annual.ok, true);

  const badAnnual = buildEnsureConsolidationBatchCommand({
    parentCompanyId: 1,
    year: 2026,
    month: 6,
    periodKind: "year",
  }, 9);
  assert.equal(badAnnual.ok, false);

  const badQuarter = buildEnsureConsolidationBatchCommand({
    parentCompanyId: 1,
    year: 2026,
    month: 5,
    periodKind: "quarter",
  }, 9);
  assert.equal(badQuarter.ok, false);
});

test("draft batch deletion requires a revision and reason", () => {
  assert.equal(buildDeleteConsolidationBatchCommand(3, { expectedRevision: 2, note: "" }, 9).ok, false);
  const result = buildDeleteConsolidationBatchCommand(3, {
    expectedRevision: 2,
    note: "  来源报表有误，删除后重建  ",
  }, 9);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.data.note, "来源报表有误，删除后重建");
});

test("requires an independent batch reviewer", () => {
  const sameUser = validateConsolidationBatchTransition({
    status: "submitted",
    createdBy: 9,
    submittedBy: 9,
    reviewedBy: null,
  }, "review", 9);
  assert.equal(sameUser.ok, false);

  const independent = validateConsolidationBatchTransition({
    status: "submitted",
    createdBy: 9,
    submittedBy: 9,
    reviewedBy: null,
  }, "review", 10);
  assert.deepEqual(independent, { ok: true, data: { nextStatus: "reviewed" } });
});

test("allows an authorized workpaper confirmation to lock a draft directly", () => {
  const result = validateConsolidationBatchTransition({
    status: "draft",
    createdBy: 9,
    submittedBy: null,
    reviewedBy: null,
    contributorUserIds: [9],
  }, "lock", 9);
  assert.deepEqual(result, { ok: true, data: { nextStatus: "locked" } });
});

test("accepts automatic refresh and preparation completion intents", () => {
  const result = buildSaveConsolidationSourcesCommand(3, {
    expectedRevision: 1,
    intent: "completePreparation",
  }, 9);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.data.input.intent, "completePreparation");
});

test("rejects an unknown automatic preparation intent", () => {
  const result = buildSaveConsolidationSourcesCommand(3, {
    expectedRevision: 1,
    intent: "invalid" as never,
  }, 9);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.issue.field, "intent");
});

test("submission requires immutable three-statement snapshots and explicit no-item decisions", () => {
  const sources = [1, 2].flatMap((entitySnapshotId) => ["balanceSheet", "incomeStatement", "cashFlow"].map((reportType) => ({
    entitySnapshotId,
    reportType: reportType as "balanceSheet" | "incomeStatement" | "cashFlow",
    sourceKind: "system",
    sourceStatus: "available",
    workpaperId: null,
    workpaperVersion: null,
    evidence: null,
    reportPayload: reportType === "balanceSheet"
      ? { httpStatus: 200, payload: { type: "balance", assets: [{ code: "cash" }], liabilities: [], equity: [] } }
      : { httpStatus: 200, payload: { type: reportType === "incomeStatement" ? "income" : "cashflow", lines: [{ code: "x", amount: 1 }] } },
  })));
  const result = validateConsolidationSubmission({
    entities: [
      { id: 1, companyId: 101, role: "parent", shareRatio: 1, functionalCurrency: "CNY", currencyEvidence: "境内经营" },
      { id: 2, companyId: 102, role: "subsidiary", shareRatio: 1, functionalCurrency: "CNY", currencyEvidence: "境内经营" },
    ],
    sources,
    exchangeRates: [],
    controlDecisions: [
      ...["investmentEquity", "nonControllingInterest", "intercompanyBalance", "internalTrading", "internalLongTermAsset", "incomeDividend", "cashFlow"].map((entryType) => ({ controlKey: `elimination:${entryType}`, decision: "notApplicable", evidence: "本期无该类抵销事项" })),
      { controlKey: "tax", decision: "notApplicable", evidence: "无抵销故无税务影响" },
    ],
    entries: [],
    taxEffectCount: 0,
    requiredInvestmentVoucherIds: [],
    periodEnd: "2026-06-30",
  });
  assert.equal(result.ok, true);
});

test("requires an NCI allocation or explicit conclusion for a partially owned subsidiary", () => {
  const base = {
    entities: [
      { id: 1, companyId: 101, role: "parent", shareRatio: 1, functionalCurrency: "CNY", currencyEvidence: "境内经营" },
      { id: 2, companyId: 102, role: "subsidiary", shareRatio: 0.75, functionalCurrency: "CNY", currencyEvidence: "境内经营" },
    ],
    sources: [1, 2].flatMap((entitySnapshotId) => ["balanceSheet", "incomeStatement", "cashFlow"].map((reportType) => ({
      entitySnapshotId,
      reportType: reportType as "balanceSheet" | "incomeStatement" | "cashFlow",
      sourceKind: "system",
      sourceStatus: "available",
      workpaperId: null,
      workpaperVersion: null,
      evidence: "会计确认系统账已结账",
      reportPayload: reportType === "balanceSheet"
        ? { httpStatus: 200, payload: { type: "balance", assets: [{ code: "cash" }], liabilities: [], equity: [] } }
        : { httpStatus: 200, payload: { type: reportType === "incomeStatement" ? "income" : "cashflow", lines: [{ code: "x", amount: 1 }] } },
    }))),
    exchangeRates: [],
    controlDecisions: [
      ...["investmentEquity", "intercompanyBalance"].map((entryType) => ({ controlKey: `elimination:${entryType}`, decision: "notApplicable", evidence: "本期无该类抵销事项" })),
    ],
    taxEffectCount: 0,
    requiredInvestmentVoucherIds: [],
    periodEnd: "2026-06-30",
  };
  const result = validateConsolidationSubmission({ ...base, entries: [] });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.issue.field, "elimination:nonControllingInterest");
});

test("return requires a revision, a reason, and an independent executor", () => {
  const missingReason = buildConsolidationBatchLifecycleCommand(
    "return",
    7,
    10,
    { expectedRevision: 3 },
  );
  assert.equal(missingReason.ok, false);

  const command = buildConsolidationBatchLifecycleCommand(
    "return",
    7,
    10,
    { expectedRevision: 3, note: "来源证据需要补充" },
  );
  assert.equal(command.ok, true);
  if (!command.ok) return;
  assert.equal(command.data.expectedRevision, 3);

  const contributor = validateConsolidationBatchTransition({
    status: "submitted",
    createdBy: 9,
    submittedBy: 9,
    reviewedBy: null,
    contributorUserIds: [10],
  }, "return", 10);
  assert.equal(contributor.ok, false);

  const independent = validateConsolidationBatchTransition({
    status: "submitted",
    createdBy: 9,
    submittedBy: 9,
    reviewedBy: null,
    contributorUserIds: [9],
  }, "return", 10);
  assert.deepEqual(independent, { ok: true, data: { nextStatus: "draft" } });

  const reviewed = validateConsolidationBatchTransition({
    status: "reviewed",
    createdBy: 9,
    submittedBy: 9,
    reviewedBy: 10,
    contributorUserIds: [9],
  }, "return", 10);
  assert.deepEqual(reviewed, { ok: true, data: { nextStatus: "draft" } });
});

test("submission rejects a non-null but invalid ownership ratio", () => {
  const result = validateConsolidationSubmission({
    entities: [
      { id: 1, companyId: 101, role: "parent", shareRatio: 1, functionalCurrency: "CNY", currencyEvidence: "境内经营" },
      { id: 2, companyId: 102, role: "subsidiary", shareRatio: 100, functionalCurrency: "CNY", currencyEvidence: "境内经营" },
    ],
    sources: [],
    exchangeRates: [],
    controlDecisions: [],
    entries: [],
    taxEffectCount: 0,
    requiredInvestmentVoucherIds: [],
    periodEnd: "2026-06-30",
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.issue.field, "shareRatio");
});

test("submission requires a saved closing-rate snapshot near period end", () => {
  const baseFacts = {
    entities: [
      { id: 1, companyId: 101, role: "parent", shareRatio: 1, functionalCurrency: "CNY", currencyEvidence: "境内经营" },
      { id: 2, companyId: 102, role: "subsidiary", shareRatio: 1, functionalCurrency: "CAD", currencyEvidence: "加拿大经营环境" },
    ],
    sources: [1, 2].flatMap((entitySnapshotId) => ["balanceSheet", "incomeStatement", "cashFlow"].map((reportType) => ({
      entitySnapshotId,
      reportType: reportType as "balanceSheet" | "incomeStatement" | "cashFlow",
      sourceKind: "system",
      sourceStatus: "available",
      workpaperId: null,
      workpaperVersion: null,
      evidence: "已确认系统账快照",
      reportPayload: reportType === "balanceSheet"
        ? { httpStatus: 200, payload: { type: "balance", assets: [{ code: "cash" }], liabilities: [], equity: [] } }
        : { httpStatus: 200, payload: { type: reportType === "incomeStatement" ? "income" : "cashflow", lines: [{ code: "x", amount: 1 }] } },
    }))),
    controlDecisions: [
      ...["investmentEquity", "nonControllingInterest", "intercompanyBalance", "internalTrading", "internalLongTermAsset", "incomeDividend", "cashFlow"].map((entryType) => ({ controlKey: `elimination:${entryType}`, decision: "notApplicable", evidence: "无该类抵销事项" })),
      { controlKey: "tax", decision: "notApplicable", evidence: "无税务影响" },
    ],
    entries: [],
    taxEffectCount: 0,
    requiredInvestmentVoucherIds: [],
    periodEnd: "2026-06-30",
  };
  const stale = validateConsolidationSubmission({
    ...baseFacts,
    exchangeRates: [{
      exchangeRateId: 10,
      rateKind: "closing",
      rateDate: "2026-06-01",
      recordedBy: 10,
      recordedAt: "2026-06-02T00:00:00.000Z",
      applications: [{ applicationType: "closing", periodBasis: "current", entitySnapshotId: 2, voucherItemId: null, targetDate: "2026-06-30", evidence: "期末折算", voucher: null }],
    }],
  });
  assert.equal(stale.ok, false);
  if (!stale.ok) assert.equal(stale.issue.field, "rateApplications");

  const current = validateConsolidationSubmission({
    ...baseFacts,
    exchangeRates: [{
      exchangeRateId: 10,
      rateKind: "closing",
      rateDate: "2026-06-30",
      recordedBy: 10,
      recordedAt: "2026-06-30T08:00:00.000Z",
      applications: [{ applicationType: "closing", periodBasis: "current", entitySnapshotId: 2, voucherItemId: null, targetDate: "2026-06-30", evidence: "期末折算", voucher: null }],
    }],
  });
  assert.equal(current.ok, true);
});
