import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDeleteConsolidationEntryCommand,
  buildReviewConsolidationEntryCommand,
  buildSaveConsolidationEntryCommand,
  buildSaveConsolidationTaxEffectCommand,
  isExactConsolidationReversal,
  validateConsolidationEntryReviewTarget,
  validateConsolidationEntryWriteMode,
  validateConsolidationVersionTarget,
} from "./consolidation-entry-validation";

const balancedEntry = {
  expectedRevision: 1,
  entryNo: "E-001",
  entryType: "intercompanyBalance" as const,
  title: "抵销内部往来",
  description: "双方余额逐项匹配",
  evidence: "双方对账单 2026-06",
  lines: [
    { entitySnapshotId: 1, statementType: "balanceSheet" as const, lineCode: "accountsPayable", debit: 100, credit: 0, matchSide: "left" as const, sourceKind: "auxiliaryBalance" as const, sourceRecordId: 11, counterpartyEntitySnapshotId: 2 },
    { entitySnapshotId: 2, statementType: "balanceSheet" as const, lineCode: "accountsReceivable", debit: 0, credit: 100, matchSide: "right" as const, sourceKind: "auxiliaryBalance" as const, sourceRecordId: 12, counterpartyEntitySnapshotId: 1 },
  ],
};

test("accepts balanced typed elimination lines", () => {
  const result = buildSaveConsolidationEntryCommand(7, balancedEntry, 9);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.data.input.lines.length, 2);
});

test("accepts a manually prepared group adjustment without bilateral matching facts", () => {
  const result = buildSaveConsolidationEntryCommand(7, {
    expectedRevision: 1,
    entryNo: "2026-06-合-0013",
    postingDate: "2026-06-30",
    documentType: "groupAdjustment",
    postingLevel: "30",
    entryType: "groupAdjustment",
    title: "在建工程历史集团调整",
    description: "江苏欣晨建设工程有限公司在建工程款",
    evidence: "人工底稿：借记在建工程，贷记其他应付款",
    lines: [
      { entitySnapshotId: 1, statementType: "balanceSheet", lineCode: "constructionInProgress", accountCode: "1604", debit: 94_191_934.71, credit: 0 },
      { entitySnapshotId: 1, statementType: "balanceSheet", lineCode: "otherPayables", accountCode: "2241", debit: 0, credit: 94_191_934.71 },
    ],
  }, 9);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.data.input.entryType, "groupAdjustment");
  assert.equal(result.data.input.documentType, "groupAdjustment");
  assert.equal(result.data.input.postingLevel, "30");
});

test("rejects an unbalanced elimination entry", () => {
  const result = buildSaveConsolidationEntryCommand(7, {
    ...balancedEntry,
    lines: [balancedEntry.lines[0]!, { ...balancedEntry.lines[1]!, credit: 99 }],
  }, 9);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.issue.field, "lines");
});

test("approved entries cannot be edited in place", () => {
  const result = validateConsolidationEntryWriteMode("draft", "approved");
  assert.equal(result.ok, false);
});

test("validates tax rate and preserves the accounting conclusion", () => {
  const result = buildSaveConsolidationTaxEffectCommand(7, 12, {
    expectedRevision: 2,
    entitySnapshotId: 4,
    effectKey: "inventory-profit",
    taxEffectType: "deductible",
    differenceAmount: 100,
    taxRate: 0.25,
    recognition: "asset",
    jurisdiction: "中国大陆",
    recognitionLocation: "profitOrLoss",
    balanceSheetLineCode: "deferredTaxAssets",
    counterpartLineCode: "incomeTax",
    recoverabilityConclusion: "预计次年销售转回且有足够应纳税所得额",
    evidence: "内部销售及存货去向表",
  }, 9);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.data.input.taxRate, 0.25);
});

test("requires structured bilateral source facts for internal matching", () => {
  const result = buildSaveConsolidationEntryCommand(7, {
    ...balancedEntry,
    lines: balancedEntry.lines.map(({ matchSide: _matchSide, ...line }) => line),
  }, 9);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.issue.field, "matching");
});

test("requires a selected source record for each matching side", () => {
  const result = buildSaveConsolidationEntryCommand(7, {
    ...balancedEntry,
    lines: [balancedEntry.lines[0]!, { ...balancedEntry.lines[1]!, sourceRecordId: null }],
  }, 9);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.issue.field, "matching");
});

test("exact reversal compares a currency-aware one-to-one multiset", () => {
  const original = [
    { entitySnapshotId: 1, statementType: "balanceSheet", lineCode: "receivable", accountCode: "1122", debit: 100, credit: 0, currencyCode: "CAD" },
    { entitySnapshotId: 1, statementType: "balanceSheet", lineCode: "receivable", accountCode: "1122", debit: 100, credit: 0, currencyCode: "CAD" },
  ];
  const exact = [
    { entitySnapshotId: 1, statementType: "balanceSheet", lineCode: "receivable", accountCode: "1122", debit: 0, credit: 100, currencyCode: "CAD" },
    { entitySnapshotId: 1, statementType: "balanceSheet", lineCode: "receivable", accountCode: "1122", debit: 0, credit: 100, currencyCode: "CAD" },
  ];
  assert.equal(isExactConsolidationReversal(original, exact), true);
  assert.equal(isExactConsolidationReversal(original, [
    exact[0]!,
    { ...exact[1]!, currencyCode: "CNY" },
  ]), false);
  assert.equal(isExactConsolidationReversal([
    original[0]!,
    { ...original[1]!, debit: 200 },
  ], exact), false);
});

test("revision and reversal targets must be the direct base current head", () => {
  assert.equal(validateConsolidationVersionTarget(
    { baseBatchId: 5 },
    { batchId: 5, status: "approved", hasSuccessor: false },
  ).ok, true);
  assert.equal(validateConsolidationVersionTarget(
    { baseBatchId: 5 },
    { batchId: 4, status: "approved", hasSuccessor: false },
  ).ok, false);
  assert.equal(validateConsolidationVersionTarget(
    { baseBatchId: 5 },
    { batchId: 5, status: "approved", hasSuccessor: true },
  ).ok, false);
});

test("delete commands require the client revision and an audit reason", () => {
  const missingReason = buildDeleteConsolidationEntryCommand(7, 12, {
    expectedRevision: 3,
    note: " ",
  }, 9);
  assert.equal(missingReason.ok, false);

  const command = buildDeleteConsolidationEntryCommand(7, 12, {
    expectedRevision: 3,
    note: "重复录入",
  }, 9);
  assert.deepEqual(command, {
    ok: true,
    data: { batchId: 7, entryId: 12, expectedRevision: 3, note: "重复录入", userId: 9 },
  });
});

test("builds audited per-entry approve and return commands", () => {
  assert.deepEqual(buildReviewConsolidationEntryCommand("approve", 7, 12, {
    expectedRevision: 3,
    note: " 凭证一致 ",
  }, 9), {
    ok: true,
    data: { action: "approve", batchId: 7, entryId: 12, userId: 9, expectedRevision: 3, note: "凭证一致" },
  });
  assert.equal(buildReviewConsolidationEntryCommand("return", 7, 0, {
    expectedRevision: 3,
  }, 9).ok, false);
});

test("review target accepts generated matches and manual group journals in draft batches", () => {
  assert.deepEqual(validateConsolidationEntryReviewTarget("approve", {
    batchStatus: "draft",
    entryOrigin: "system",
    entryStatus: "draft",
    generationKey: "pair-1",
    matchStatus: "matched",
  }), { ok: true, data: { entryStatus: "approved", matchStatus: "accepted" } });
  assert.deepEqual(validateConsolidationEntryReviewTarget("return", {
    batchStatus: "draft",
    entryOrigin: "system",
    entryStatus: "approved",
    generationKey: "pair-1",
    matchStatus: "accepted",
  }), { ok: true, data: { entryStatus: "draft", matchStatus: "rejected" } });
  assert.equal(validateConsolidationEntryReviewTarget("approve", {
    batchStatus: "submitted",
    entryOrigin: "system",
    entryStatus: "draft",
    generationKey: "pair-1",
    matchStatus: "matched",
  }).ok, false);
  assert.deepEqual(validateConsolidationEntryReviewTarget("approve", {
    batchStatus: "draft",
    entryOrigin: "manual",
    entryStatus: "draft",
    generationKey: null,
    matchStatus: null,
  }), { ok: true, data: { entryStatus: "approved", matchStatus: null } });
  const pendingEvidence = validateConsolidationEntryReviewTarget("approve", {
    batchStatus: "draft",
    entryOrigin: "manual",
    entryStatus: "draft",
    generationKey: null,
    matchStatus: null,
    evidence: "固定人民币金额已确认；具体设立日及对应科目待补证。",
  });
  assert.equal(pendingEvidence.ok, false);
  if (!pendingEvidence.ok) {
    assert.equal(pendingEvidence.issue.field, "evidence");
    assert.match(pendingEvidence.issue.message, /补齐来源/);
  }
  const samePersonReview = validateConsolidationEntryReviewTarget("approve", {
    batchStatus: "draft",
    entryOrigin: "manual",
    entryStatus: "draft",
    generationKey: null,
    matchStatus: null,
    preparedBy: 9,
    reviewerId: 9,
  });
  assert.equal(samePersonReview.ok, false);
  if (!samePersonReview.ok) assert.match(samePersonReview.issue.message, /编制人与复核人必须分离/);
});
