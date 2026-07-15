import assert from "node:assert/strict";
import test from "node:test";

import {
  buildEnsureConsolidationBatchCommand,
  buildConsolidationBatchLifecycleCommand,
  buildSaveConsolidationSourcesCommand,
  validateConsolidationBatchTransition,
  validateConsolidationSubmission,
} from "./consolidation-batch-validation";

test("builds an explicit parent and period consolidation command", () => {
  const result = buildEnsureConsolidationBatchCommand({ parentCompanyId: 1, year: 2026, month: 6 }, 9);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.data.input.parentCompanyId, 1);
  assert.equal(result.data.input.baseBatchId, null);
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

test("normalizes explicit currency policies and rate applications for source freezing", () => {
  const result = buildSaveConsolidationSourcesCommand(3, {
    expectedRevision: 1,
    selections: [{ entitySnapshotId: 2, reportType: "balanceSheet", acceptSystemSource: true, evidence: "  已核对总账  " }],
    exchangeRateIds: [10],
    currencyPolicies: [{ entitySnapshotId: 2, functionalCurrency: " cad ", evidence: "  加拿大经营环境  " }],
    rateApplications: [{ exchangeRateId: 10, applicationType: "closing", periodBasis: "current", entitySnapshotId: 2, evidence: "  期末折算  " }],
  }, 9);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.data.input.currencyPolicies, [{
    entitySnapshotId: 2,
    functionalCurrency: "CAD",
    evidence: "加拿大经营环境",
  }]);
  assert.equal(result.data.input.rateApplications[0]?.evidence, "期末折算");
});

test("rejects frozen rates that have no explicit application target", () => {
  const result = buildSaveConsolidationSourcesCommand(3, {
    expectedRevision: 1,
    selections: [{ entitySnapshotId: 1, reportType: "balanceSheet", acceptSystemSource: true, evidence: "已核对总账" }],
    exchangeRateIds: [10],
    currencyPolicies: [{ entitySnapshotId: 1, functionalCurrency: "CNY", evidence: "境内经营" }],
    rateApplications: [],
  }, 9);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.issue.field, "exchangeRateIds");
});

test("submission requires immutable three-statement snapshots and explicit no-item decisions", () => {
  const sources = [1, 2].flatMap((entitySnapshotId) => ["balanceSheet", "incomeStatement", "cashFlow"].map((reportType) => ({
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

test("non-wholly-owned subsidiaries cannot bypass NCI equity and profit allocation", () => {
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
      ...["investmentEquity", "intercompanyBalance", "internalTrading", "internalLongTermAsset", "incomeDividend", "cashFlow"].map((entryType) => ({ controlKey: `elimination:${entryType}`, decision: "notApplicable", evidence: "本期无该类抵销事项" })),
      { controlKey: "tax", decision: "notApplicable", evidence: "无抵销故无税务影响" },
    ],
    taxEffectCount: 0,
    requiredInvestmentVoucherIds: [],
    periodEnd: "2026-06-30",
  };
  const missing = validateConsolidationSubmission({ ...base, entries: [] });
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.issue.field, "elimination:nonControllingInterest");

  const nciEntries = [{
      entryType: "nonControllingInterest",
      lines: [
        { companyId: 102, statementType: "balanceSheet" as const, lineCode: "nonControllingInterests", debit: 0, credit: 25 },
        { companyId: 101, statementType: "balanceSheet" as const, lineCode: "undistributedProfit", debit: 25, credit: 0 },
        { companyId: 102, statementType: "incomeStatement" as const, lineCode: "netProfitAttributableToNci", debit: 0, credit: 5 },
        { companyId: 101, statementType: "incomeStatement" as const, lineCode: "netProfitAttributableToParent", debit: 5, credit: 0 },
      ],
    }];
  const completed = validateConsolidationSubmission({
    ...base,
    entries: nciEntries,
  });
  assert.equal(completed.ok, true);

  const secondPartialSubsidiary = validateConsolidationSubmission({
    ...base,
    entities: [
      ...base.entities,
      { id: 3, companyId: 103, role: "subsidiary", shareRatio: 0.8, functionalCurrency: "CNY", currencyEvidence: "境内经营" },
    ],
    sources: [
      ...base.sources,
      ...base.sources.filter((source) => source.entitySnapshotId === 2).map((source) => ({
        ...source,
        entitySnapshotId: 3,
      })),
    ],
    entries: nciEntries,
  });
  assert.equal(secondPartialSubsidiary.ok, false);
  if (!secondPartialSubsidiary.ok) assert.match(secondPartialSubsidiary.issue.message, /103/);
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

test("submission requires a verified closing-rate snapshot near period end", () => {
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
      verifiedBy: 10,
      verifiedAt: "2026-06-02T00:00:00.000Z",
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
      verifiedBy: 10,
      verifiedAt: "2026-06-30T08:00:00.000Z",
      applications: [{ applicationType: "closing", periodBasis: "current", entitySnapshotId: 2, voucherItemId: null, targetDate: "2026-06-30", evidence: "期末折算", voucher: null }],
    }],
  });
  assert.equal(current.ok, true);
});
