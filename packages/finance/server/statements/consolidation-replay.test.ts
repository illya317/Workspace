import assert from "node:assert/strict";
import test from "node:test";

import type {
  ConsolidationBatchSnapshot,
  ConsolidationControlDecisionSnapshot,
  ConsolidationEntitySnapshot,
  ConsolidationSourceSnapshot,
} from "@workspace/finance/types";
import {
  consolidationRateFingerprint,
  consolidationScopeFingerprint,
  consolidationSourceBatchFingerprint,
  consolidationSourceFactFingerprint,
} from "./consolidation-fingerprints";
import { buildConsolidationReplayPackage } from "./consolidation-replay";

function batch(status: ConsolidationBatchSnapshot["status"]): ConsolidationBatchSnapshot {
  const entities: ConsolidationEntitySnapshot[] = [
    { id: 1, companyId: 1, companyCode: "ZX01", companyName: "母公司", role: "parent", directParentCompanyId: null, directParentCode: null, relationId: null, relationUpdatedAt: null, relationEffectiveFrom: null, relationEffectiveTo: null, relationVersion: null, shareRatio: 1, isConsolidated: true, functionalCurrency: "CNY", currencyEvidence: "本位币确认", currencyDecidedBy: 9 },
    { id: 2, companyId: 2, companyCode: "ZX02", companyName: "子公司", role: "subsidiary", directParentCompanyId: 1, directParentCode: "ZX01", relationId: 5, relationUpdatedAt: "2026-06-30T00:00:00.000Z", relationEffectiveFrom: "2020-01-01T00:00:00.000Z", relationEffectiveTo: null, relationVersion: 2, shareRatio: 0.75, isConsolidated: true, functionalCurrency: "CNY", currencyEvidence: "本位币确认", currencyDecidedBy: 9 },
  ];
  const sources: ConsolidationSourceSnapshot[] = entities.flatMap((entity) =>
    ["balanceSheet", "incomeStatement", "cashFlow"].map((reportType, index) => {
      const source = {
        id: entity.id * 10 + index,
        entitySnapshotId: entity.id,
        reportType: reportType as ConsolidationSourceSnapshot["reportType"],
        sourceKind: "workpaper" as const,
        sourceStatus: "submitted" as const,
        workpaperId: 7 + entity.id * 10 + index,
        workpaperVersion: 3,
        sourceChecksum: "workpaper-checksum",
        workpaperUpdatedBy: 9,
        sourcePackageId: null,
        sourcePackageRevision: null,
        sourcePackageStatus: null,
        sourcePackageChecksum: null,
        sourcePackageUploadedBy: null,
        sourcePackageSubmittedBy: null,
        lineCount: 1,
        sourcedLineCount: 1,
        importedLineCount: 0,
        manualLineCount: 0,
        formulaLineCount: 0,
        evidence: "底稿",
        selectedBy: 9,
        selectedAt: "2026-07-14T23:00:00.000Z",
        reportPayload: { lines: [{ code: "cash", amount: 100 }] },
      };
      return {
        ...source,
        fingerprint: consolidationSourceFactFingerprint({ companyId: entity.companyId, ...source }),
      };
    }),
  );
  const controlDecisions: ConsolidationControlDecisionSnapshot[] = [
    "investmentEquity",
    "nonControllingInterest",
    "intercompanyBalance",
    "internalTrading",
    "internalLongTermAsset",
    "incomeDividend",
    "cashFlow",
  ].map((entryType, index) => ({
    id: index + 1,
    controlKey: `elimination:${entryType}` as ConsolidationControlDecisionSnapshot["controlKey"],
    decision: "notApplicable",
    conclusion: "本期无该类事项",
    evidence: "复核清单及往来核对记录",
    decidedBy: 9,
    decidedAt: "2026-07-15T00:00:00.000Z",
  }));
  controlDecisions.push({
    id: 8,
    controlKey: "tax",
    decision: "notApplicable",
    conclusion: "无抵销事项，未产生税务影响",
    evidence: "税务影响复核表",
    decidedBy: 9,
    decidedAt: "2026-07-15T00:00:00.000Z",
  });
  const exchangeRates: ConsolidationBatchSnapshot["exchangeRates"] = [];
  return {
    id: 3,
    parentCompanyId: 1,
    parentCompanyCode: "ZX01",
    parentCompanyName: "母公司",
    year: 2026,
    month: 6,
    periodKind: "month",
    version: 2,
    revision: status === "published" ? 5 : 4,
    status,
    baseBatchId: 1,
    scopeFingerprint: consolidationScopeFingerprint(entities),
    sourceFingerprint: consolidationSourceBatchFingerprint(sources.map((source) => ({
      companyId: entities.find((entity) => entity.id === source.entitySnapshotId)!.companyId,
      reportType: source.reportType,
      fingerprint: source.fingerprint,
    }))),
    rateFingerprint: consolidationRateFingerprint(exchangeRates),
    createdBy: 9,
    submittedBy: 9,
    submittedAt: "2026-07-15T00:00:00.000Z",
    reviewedBy: 10,
    reviewedAt: "2026-07-15T01:00:00.000Z",
    reviewNote: "同意",
    lockedBy: 10,
    lockedAt: "2026-07-15T02:00:00.000Z",
    publishedBy: null,
    publishedAt: null,
    entities,
    sources,
    exchangeRates,
    entries: [],
    controlDecisions,
    events: [
      { id: 1, eventType: "lifecycle", action: "create", fromStatus: "none", toStatus: "draft", note: null, actorUserId: 9, actorName: "编制人", batchRevision: 1, targetType: null, targetId: null, snapshot: null, createdAt: "2026-07-14T23:00:00.000Z" },
      { id: 2, eventType: "lifecycle", action: "submit", fromStatus: "draft", toStatus: "submitted", note: null, actorUserId: 9, actorName: "编制人", batchRevision: 2, targetType: null, targetId: null, snapshot: null, createdAt: "2026-07-15T00:00:00.000Z" },
      { id: 3, eventType: "lifecycle", action: "review", fromStatus: "submitted", toStatus: "reviewed", note: "同意", actorUserId: 10, actorName: "复核人", batchRevision: 3, targetType: null, targetId: null, snapshot: null, createdAt: "2026-07-15T01:00:00.000Z" },
      ...(status === "locked" || status === "published" ? [{ id: 4, eventType: "lifecycle" as const, action: "lock" as const, fromStatus: "reviewed", toStatus: "locked", note: null, actorUserId: 10, actorName: "复核人", batchRevision: 4, targetType: null, targetId: null, snapshot: null, createdAt: "2026-07-15T02:00:00.000Z" }] : []),
      ...(status === "published" ? [{ id: 5, eventType: "lifecycle" as const, action: "publish" as const, fromStatus: "locked", toStatus: "published", note: null, actorUserId: 10, actorName: "复核人", batchRevision: 5, targetType: null, targetId: null, snapshot: null, createdAt: "2026-07-15T03:00:00.000Z" }] : []),
    ],
  };
}

test("locked batches expose the exact frozen report payload for replay", () => {
  const result = buildConsolidationReplayPackage(batch("locked"));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.data.sources[0]?.reportPayload, { lines: [{ code: "cash", amount: 100 }] });
  assert.equal(result.data.controlDecisions.length, 8);
  assert.equal(result.data.fingerprintVerification.sources.stored, result.data.fingerprintVerification.sources.recomputed);
});

test("replay only requires elimination conclusions that are active in the current product scope", () => {
  const currentScope = batch("locked");
  currentScope.controlDecisions = currentScope.controlDecisions.filter((decision) => (
    decision.controlKey === "elimination:investmentEquity"
    || decision.controlKey === "elimination:intercompanyBalance"
    || decision.controlKey === "tax"
  ));
  const result = buildConsolidationReplayPackage(currentScope);
  assert.equal(result.ok, true);
});

test("draft batches cannot be replayed as official consolidation inputs", () => {
  const result = buildConsolidationReplayPackage(batch("draft"));
  assert.equal(result.ok, false);
});

test("replay rejects a frozen source payload that no longer matches its fingerprint", () => {
  const tampered = batch("locked");
  tampered.sources[0]!.reportPayload = { lines: [{ code: "cash", amount: 999 }] };
  const result = buildConsolidationReplayPackage(tampered);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.issue.field, "sourceFingerprint");
});

test("replay rejects a mismatch in each stored aggregate fingerprint", () => {
  for (const field of ["scopeFingerprint", "sourceFingerprint", "rateFingerprint"] as const) {
    const altered = batch("locked");
    altered[field] = "tampered";
    const result = buildConsolidationReplayPackage(altered);
    assert.equal(result.ok, false, field);
    if (!result.ok) assert.equal(result.issue.field, field);
  }
});

test("replay preserves entry and tax-effect audit metadata", () => {
  const audited = batch("locked");
  audited.entries = [{
    id: 20,
    entryNo: "E-001",
    entryType: "internalTrading",
    title: "内部交易抵销",
    description: null,
    evidence: "双方对账单",
    status: "approved",
    version: 1,
    supersedesEntryId: null,
    reversalOfEntryId: null,
    predecessorEntryId: null,
    preparedBy: 9,
    submittedBy: 9,
    submittedAt: "2026-07-15T00:00:00.000Z",
    approvedBy: 10,
    approvedAt: "2026-07-15T01:00:00.000Z",
    approvalNote: "对账一致",
    reversedBy: null,
    reversedAt: null,
    createdAt: "2026-07-14T23:00:00.000Z",
    updatedAt: "2026-07-15T01:00:00.000Z",
    lines: [
      { id: 21, lineNo: 1, entitySnapshotId: 1, companyId: 1, companyCode: "ZX01", statementType: "incomeStatement", lineCode: "revenue", accountCode: null, debit: 100, credit: 0, currencyCode: "CNY", note: null },
      { id: 22, lineNo: 2, entitySnapshotId: 2, companyId: 2, companyCode: "ZX02", statementType: "incomeStatement", lineCode: "cost", accountCode: null, debit: 0, credit: 100, currencyCode: "CNY", note: null },
    ],
    taxEffects: [{
      id: 30,
      effectKey: "inventory-profit",
      taxEffectType: "deductible",
      differenceAmount: 100,
      taxRate: 0.25,
      derivedTaxAmount: 25,
      recognition: "asset",
      reversalPeriod: "2026-07",
      recoverabilityConclusion: "预计可抵扣",
      evidence: "税率及转回测算",
      preparedBy: 9,
      createdAt: "2026-07-15T00:10:00.000Z",
      updatedAt: "2026-07-15T00:10:00.000Z",
    }],
  }];
  const result = buildConsolidationReplayPackage(audited);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.data.approvedEntries[0]?.approvalNote, "对账一致");
  assert.equal(result.data.approvedEntries[0]?.taxEffects[0]?.preparedBy, 9);
  assert.equal(result.data.approvedEntries[0]?.taxEffects[0]?.createdAt, "2026-07-15T00:10:00.000Z");
});
