import assert from "node:assert/strict";
import test from "node:test";

import type { ConsolidationBatchSnapshot } from "@workspace/finance/types";

import { buildConsolidatedReportOutput } from "./consolidated-output";
import {
  buildConsolidatedPreviewFromBatchSnapshot,
  buildConsolidatedOutputFromBatchSnapshot,
  prepareLockedConsolidatedOutputSnapshot,
} from "./consolidated-output-service";
import {
  CONSOLIDATED_OUTPUT_SNAPSHOT_VERSION,
  readConsolidatedOutputSnapshot,
} from "./consolidated-output-snapshots";
import {
  consolidationRateFingerprint,
  consolidationScopeFingerprint,
  consolidationSourceBatchFingerprint,
  consolidationSourceFactFingerprint,
} from "./consolidation-fingerprints";
import type { ConsolidationReplayPackage } from "./consolidation-replay";
function line(
  lineCode: string,
  amount: number,
  input: Partial<{
    section: string;
    side: "debit" | "credit";
    direction: "in" | "out" | "net";
    currentMonthAmount: number;
    subtract: boolean;
    isTotal: boolean;
    isGrandTotal: boolean;
  }> = {},
) {
  return {
    lineCode,
    label: lineCode,
    code: lineCode,
    amount,
    ...(input.currentMonthAmount === undefined ? {} : { currentMonthAmount: input.currentMonthAmount }),
    previousAmount: 0,
    section: input.section ?? "operating",
    side: input.side ?? "debit",
    ...(input.direction ? { direction: input.direction } : {}),
    ...(input.subtract ? { subtract: true } : {}),
    ...(input.isTotal ? { isTotal: true } : {}),
    ...(input.isGrandTotal ? { isGrandTotal: true } : {}),
  };
}
function replayPackage(): ConsolidationReplayPackage {
  return {
    batch: {
      id: 1,
      parentCompanyId: 1,
      parentCompanyCode: "ZX01",
      parentCompanyName: "母公司",
      year: 2026,
      month: 12, periodKind: "month",
      version: 1,
      revision: 4,
      status: "locked",
      baseBatchId: null,
      scopeFingerprint: "scope",
      sourceFingerprint: "sources",
      rateFingerprint: "rates",
      createdBy: 1,
      submittedBy: 2,
      submittedAt: "2027-01-02T00:00:00.000Z",
      reviewedBy: 3,
      reviewedAt: "2027-01-03T00:00:00.000Z",
      reviewNote: "同意",
      lockedBy: 3,
      lockedAt: "2027-01-04T00:00:00.000Z",
      publishedBy: null,
      publishedAt: null,
    },
    entities: [{
      id: 101,
      companyId: 1,
      companyCode: "ZX01",
      companyName: "母公司",
      role: "parent",
      directParentCompanyId: null,
      directParentCode: null,
      relationId: null,
      relationUpdatedAt: null,
      relationEffectiveFrom: null,
      relationEffectiveTo: null,
      relationVersion: null,
      shareRatio: 1,
      isConsolidated: true,
      functionalCurrency: "CNY",
      currencyEvidence: "本位币确认",
      currencyDecidedBy: 1,
    }],
    exchangeRates: [],
    sources: [
      {
        id: 11,
        entitySnapshotId: 101,
        reportType: "balanceSheet",
        sourceKind: "workpaper",
        sourceStatus: "submitted",
        workpaperId: 1,
        workpaperVersion: 1,
        sourceChecksum: "balance-checksum",
        workpaperUpdatedBy: 1,
        sourcePackageId: null,
        sourcePackageRevision: null,
        sourcePackageStatus: null,
        sourcePackageChecksum: null,
        sourcePackageUploadedBy: null,
        sourcePackageSubmittedBy: null,
        lineCount: 8,
        sourcedLineCount: 8,
        importedLineCount: 0,
        manualLineCount: 0,
        formulaLineCount: 0,
        fingerprint: "balance",
        evidence: "submitted",
        selectedBy: 1,
        selectedAt: "2027-01-01T00:00:00.000Z",
        reportPayload: {
          httpStatus: 200,
          payload: {
            assets: [
              line("cash", 150, { section: "currentAssets" }),
              line("totalCurrentAssets", 150, { section: "currentAssets", isTotal: true }),
              line("totalAssets", 150, { section: "nonCurrentAssets", isGrandTotal: true }),
            ],
            liabilities: [
              line("payables", 80, { section: "currentLiabilities", side: "credit" }),
              line("totalCurrentLiabilities", 80, { section: "currentLiabilities", side: "credit", isTotal: true }),
              line("totalLiabilities", 80, { section: "liabilities", side: "credit", isGrandTotal: true }),
            ],
            equity: [
              line("paidInCapital", 70, { section: "equity", side: "credit" }),
              line("totalEquity", 70, { section: "equity", side: "credit", isTotal: true }),
            ],
          },
        },
      },
      {
        id: 12,
        entitySnapshotId: 101,
        reportType: "incomeStatement",
        sourceKind: "workpaper",
        sourceStatus: "submitted",
        workpaperId: 2,
        workpaperVersion: 1,
        sourceChecksum: "income-checksum",
        workpaperUpdatedBy: 1,
        sourcePackageId: null,
        sourcePackageRevision: null,
        sourcePackageStatus: null,
        sourcePackageChecksum: null,
        sourcePackageUploadedBy: null,
        sourcePackageSubmittedBy: null,
        lineCount: 5,
        sourcedLineCount: 5,
        importedLineCount: 0,
        manualLineCount: 0,
        formulaLineCount: 0,
        fingerprint: "income",
        evidence: "submitted",
        selectedBy: 1,
        selectedAt: "2027-01-01T00:00:00.000Z",
        reportPayload: {
          httpStatus: 200,
          payload: {
            lines: [
              line("revenue", 200, { side: "credit", currentMonthAmount: 30 }),
              line("cost", 120, { subtract: true, currentMonthAmount: 15 }),
              line("operatingProfit", 80, { isTotal: true, currentMonthAmount: 15 }),
              line("incomeTax", 20, { subtract: true, currentMonthAmount: 5 }),
              line("netProfit", 60, { isGrandTotal: true, currentMonthAmount: 10 }),
            ],
          },
        },
      },
      {
        id: 13,
        entitySnapshotId: 101,
        reportType: "cashFlow",
        sourceKind: "workpaper",
        sourceStatus: "submitted",
        workpaperId: 3,
        workpaperVersion: 1,
        sourceChecksum: "cash-flow-checksum",
        workpaperUpdatedBy: 1,
        sourcePackageId: null,
        sourcePackageRevision: null,
        sourcePackageStatus: null,
        sourcePackageChecksum: null,
        sourcePackageUploadedBy: null,
        sourcePackageSubmittedBy: null,
        lineCount: 15,
        sourcedLineCount: 15,
        importedLineCount: 0,
        manualLineCount: 0,
        formulaLineCount: 0,
        fingerprint: "cash-flow",
        evidence: "submitted",
        selectedBy: 1,
        selectedAt: "2027-01-01T00:00:00.000Z",
        reportPayload: {
          httpStatus: 200,
          payload: {
            lines: [
              line("salesReceipt", 100, { direction: "in", currentMonthAmount: 20 }),
              line("operatingInSubtotal", 100, { direction: "net", isTotal: true, currentMonthAmount: 20 }),
              line("purchasePayment", 50, { side: "credit", direction: "out", currentMonthAmount: 8 }),
              line("operatingOutSubtotal", 50, { direction: "net", isTotal: true, currentMonthAmount: 8 }),
              line("operatingNet", 50, { direction: "net", isTotal: true, currentMonthAmount: 12 }),
              line("investingInSubtotal", 0, { section: "investing", direction: "net", isTotal: true }),
              line("investingOutSubtotal", 0, { section: "investing", direction: "net", isTotal: true }),
              line("investingNet", 0, { section: "investing", direction: "net", isTotal: true }),
              line("financingInSubtotal", 0, { section: "financing", direction: "net", isTotal: true }),
              line("financingOutSubtotal", 0, { section: "financing", direction: "net", isTotal: true }),
              line("financingNet", 0, { section: "financing", direction: "net", isTotal: true }),
              line("fxEffect", 0, { direction: "in" }),
              line("netIncrease", 50, { direction: "net", isGrandTotal: true, currentMonthAmount: 12 }),
              line("openingCash", 100, { direction: "in", currentMonthAmount: 100 }),
              line("endingCash", 150, { direction: "net", isGrandTotal: true, currentMonthAmount: 112 }),
            ],
          },
        },
      },
    ],
    approvedEntries: [{
      id: 21,
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
      preparedBy: 1,
      submittedBy: 2,
      submittedAt: "2027-01-02T00:00:00.000Z",
      approvedBy: 3,
      approvedAt: "2027-01-03T00:00:00.000Z",
      approvalNote: "同意",
      reversedBy: null,
      reversedAt: null,
      createdAt: "2027-01-01T00:00:00.000Z",
      updatedAt: "2027-01-03T00:00:00.000Z",
      taxEffects: [],
      lines: [
        { id: 31, lineNo: 1, entitySnapshotId: 1, companyId: 1, companyCode: "ZX01", statementType: "balanceSheet", lineCode: "cash", accountCode: null, debit: 0, credit: 30, currencyCode: "CNY", note: null },
        { id: 32, lineNo: 2, entitySnapshotId: 2, companyId: 2, companyCode: "ZX02", statementType: "balanceSheet", lineCode: "payables", accountCode: null, debit: 30, credit: 0, currencyCode: "CNY", note: null },
        { id: 33, lineNo: 3, entitySnapshotId: 1, companyId: 1, companyCode: "ZX01", statementType: "incomeStatement", lineCode: "revenue", accountCode: null, debit: 20, credit: 0, currencyCode: "CNY", note: null },
        { id: 34, lineNo: 4, entitySnapshotId: 2, companyId: 2, companyCode: "ZX02", statementType: "incomeStatement", lineCode: "cost", accountCode: null, debit: 0, credit: 20, currencyCode: "CNY", note: null },
        { id: 35, lineNo: 5, entitySnapshotId: 1, companyId: 1, companyCode: "ZX01", statementType: "cashFlow", lineCode: "salesReceipt", accountCode: null, debit: 0, credit: 10, currencyCode: "CNY", note: null },
        { id: 36, lineNo: 6, entitySnapshotId: 2, companyId: 2, companyCode: "ZX02", statementType: "cashFlow", lineCode: "purchasePayment", accountCode: null, debit: 10, credit: 0, currencyCode: "CNY", note: null },
      ],
    }],
    controlDecisions: [],
    events: [
      { id: 1, eventType: "lifecycle", action: "create", fromStatus: "none", toStatus: "draft", note: null, actorUserId: 1, actorName: "创建人", batchRevision: 1, targetType: null, targetId: null, snapshot: null, createdAt: "2027-01-01T00:00:00.000Z" },
      { id: 2, eventType: "lifecycle", action: "submit", fromStatus: "draft", toStatus: "submitted", note: null, actorUserId: 2, actorName: "提交人", batchRevision: 2, targetType: null, targetId: null, snapshot: null, createdAt: "2027-01-02T00:00:00.000Z" },
      { id: 3, eventType: "lifecycle", action: "review", fromStatus: "submitted", toStatus: "reviewed", note: "同意", actorUserId: 3, actorName: "复核人", batchRevision: 3, targetType: null, targetId: null, snapshot: null, createdAt: "2027-01-03T00:00:00.000Z" },
      { id: 4, eventType: "lifecycle", action: "lock", fromStatus: "reviewed", toStatus: "locked", note: null, actorUserId: 3, actorName: "复核人", batchRevision: 4, targetType: null, targetId: null, snapshot: null, createdAt: "2027-01-04T00:00:00.000Z" },
    ],
    fingerprintVerification: {
      scope: { stored: "scope", recomputed: "scope" },
      sources: { stored: "sources", recomputed: "sources" },
      rates: { stored: "rates", recomputed: "rates" },
    },
  };
}
function batchSnapshot(status: ConsolidationBatchSnapshot["status"]): ConsolidationBatchSnapshot {
  const replay = replayPackage();
  const parent = replay.entities[0]!;
  const subsidiary = {
    ...parent,
    id: 102,
    companyId: 2,
    companyCode: "ZX02",
    companyName: "子公司",
    role: "subsidiary" as const,
    directParentCompanyId: 1,
    directParentCode: "01",
    relationId: 9,
    shareRatio: 1,
  };
  const entities = [parent, subsidiary];
  const companyIdByEntityId = new Map(entities.map((entity) => [entity.id, entity.companyId]));
  const sources = [
    ...replay.sources,
    ...replay.sources.map((source) => ({
      ...source,
      id: source.id + 100,
      entitySnapshotId: subsidiary.id,
    })),
  ].map((source) => ({
    ...source,
    fingerprint: consolidationSourceFactFingerprint({
      companyId: companyIdByEntityId.get(source.entitySnapshotId)!,
      ...source,
    }),
  }));
  const sourceFacts = sources.map((source) => ({
    companyId: companyIdByEntityId.get(source.entitySnapshotId)!,
    reportType: source.reportType,
    fingerprint: source.fingerprint,
  }));
  const controlDecisions: ConsolidationBatchSnapshot["controlDecisions"] = [
    ...(["investmentEquity", "nonControllingInterest", "intercompanyBalance", "internalLongTermAsset", "incomeDividend", "cashFlow"] as const)
      .map((entryType, index) => ({
        id: index + 1,
        controlKey: `elimination:${entryType}` as const,
        decision: "notApplicable" as const,
        conclusion: "本期无此类抵销",
        evidence: "财务复核确认",
        decidedBy: 3,
        decidedAt: "2027-01-03T00:00:00.000Z",
      })),
    {
      id: 20,
      controlKey: "tax",
      decision: "notApplicable",
      conclusion: "本期无抵销税务影响",
      evidence: "税务复核确认",
      decidedBy: 3,
      decidedAt: "2027-01-03T00:00:00.000Z",
    },
  ];
  return {
    ...replay.batch,
    revision: status === "published" ? 5 : replay.batch.revision,
    parentCompanyCode: "ZX01",
    parentCompanyName: "母公司",
    periodKind: "month",
    status,
    baseBatchId: null,
    scopeFingerprint: consolidationScopeFingerprint(entities),
    sourceFingerprint: consolidationSourceBatchFingerprint(sourceFacts),
    rateFingerprint: consolidationRateFingerprint(replay.exchangeRates),
    createdBy: 1,
    submittedBy: 2,
    submittedAt: "2027-01-02T00:00:00.000Z",
    reviewedBy: 3,
    reviewedAt: "2027-01-03T00:00:00.000Z",
    reviewNote: "同意",
    lockedBy: status === "locked" || status === "published" ? 3 : null,
    lockedAt: status === "locked" || status === "published" ? "2027-01-04T00:00:00.000Z" : null,
    publishedBy: status === "published" ? 4 : null,
    publishedAt: status === "published" ? "2027-01-05T00:00:00.000Z" : null,
    entities,
    sources,
    exchangeRates: replay.exchangeRates,
    entries: replay.approvedEntries,
    controlDecisions,
    events: status === "reviewed"
      ? replay.events.filter((event) => event.action !== "lock")
      : status === "published"
        ? [...replay.events, { id: 5, eventType: "lifecycle", action: "publish", fromStatus: "locked", toStatus: "published", note: null, actorUserId: 4, actorName: "发布人", batchRevision: 5, targetType: null, targetId: null, snapshot: null, createdAt: "2027-01-05T00:00:00.000Z" }]
        : replay.events,
  };
}
test("approved eliminations update detail lines and derived totals", () => {
  const result = buildConsolidatedReportOutput(replayPackage(), new Map([[101, "CNY"]]));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const balance = result.data.statements.find((statement) => statement.reportType === "balanceSheet")!;
  const income = result.data.statements.find((statement) => statement.reportType === "incomeStatement")!;
  const cashFlow = result.data.statements.find((statement) => statement.reportType === "cashFlow")!;
  const cash = balance.lines.find((item) => item.lineCode === "cash")!;
  assert.equal(cash.amount, 120);
  assert.deepEqual(cash.entityAmounts?.map((item) => [item.companyCode, item.amount]), [["ZX01", 150]]);
  assert.equal(balance.totals.totalAssets, 120);
  assert.equal(balance.totals.totalLiabilitiesAndEquity, 120);
  assert.equal(income.lines.find((item) => item.lineCode === "revenue")?.amount, 180);
  assert.equal(income.lines.find((item) => item.lineCode === "revenue")?.currentMonthAmount, 10);
  assert.equal(income.lines.find((item) => item.lineCode === "cost")?.amount, 100);
  assert.equal(income.totals.netProfit, 60);
  assert.equal(cashFlow.lines.find((item) => item.lineCode === "salesReceipt")?.amount, 90);
  assert.equal(cashFlow.lines.find((item) => item.lineCode === "salesReceipt")?.currentMonthAmount, 10);
  assert.equal(cashFlow.lines.find((item) => item.lineCode === "purchasePayment")?.amount, 40);
  assert.equal(cashFlow.totals.netIncrease, 50);
});

test("legacy snapshots without canonical lineCode are rejected", () => {
  const replay = replayPackage();
  const payload = replay.sources[0]!.reportPayload as { payload: { assets: Record<string, unknown>[] } };
  delete payload.payload.assets[0]!.lineCode;
  const result = buildConsolidatedReportOutput(replay, new Map([[101, "CNY"]]));
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.issue.message, /规范行标识/);
});

test("unbalanced consolidated balance sheets are rejected with the equation details", () => {
  const replay = replayPackage();
  replay.approvedEntries = [];
  const payload = replay.sources[0]!.reportPayload as {
    payload: { equity: Array<{ lineCode: string; amount: number }> };
  };
  payload.payload.equity.find((item) => item.lineCode === "paidInCapital")!.amount = 60;

  const result = buildConsolidatedReportOutput(replay, new Map([[101, "CNY"]]));
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.issue.field, "balanceEquation");
  assert.match(result.issue.message, /资产 150\.00，负债及权益 140\.00，差额 10\.00/);
});

test("official output only accepts locked or published batches", () => {
  const reviewed = buildConsolidatedOutputFromBatchSnapshot(batchSnapshot("reviewed"));
  assert.equal(reviewed.ok, false);
  if (reviewed.ok) return;
  assert.match(reviewed.issue.message, /只有已锁定或已发布/);
  assert.equal(buildConsolidatedOutputFromBatchSnapshot(batchSnapshot("locked")).ok, true);
  assert.equal(buildConsolidatedOutputFromBatchSnapshot(batchSnapshot("published")).ok, true);
});

test("period preview includes generated draft entries in the workpaper", () => {
  const draft = batchSnapshot("draft");
  draft.entries = draft.entries.map((entry) => ({ ...entry, status: "draft" }));
  draft.controlDecisions = [];

  const preview = buildConsolidatedPreviewFromBatchSnapshot(draft);
  assert.equal(preview.ok, true);
  if (!preview.ok) return;
  assert.equal(preview.data.batch.status, "draft");
  assert.equal(preview.data.approvedEntryCount, 1);
  assert.equal(preview.data.statements.length, 3);
});

test("period preview blocks when ERP functional currency facts are missing", () => {
  const draft = batchSnapshot("draft");
  draft.entities[0]!.functionalCurrency = null;
  const preview = buildConsolidatedPreviewFromBatchSnapshot(draft);
  assert.equal(preview.ok, false);
  if (!preview.ok) assert.equal(preview.issue.field, "functionalCurrency");
});

test("lock precheck builds from the reviewed batch entity functional currency", () => {
  const reviewed = batchSnapshot("reviewed");
  const valid = buildConsolidatedOutputFromBatchSnapshot(reviewed, "lockCandidate");
  assert.equal(valid.ok, true);

  reviewed.entities[0]!.functionalCurrency = null;
  const missingCurrency = buildConsolidatedOutputFromBatchSnapshot(reviewed, "lockCandidate");
  assert.equal(missingCurrency.ok, false);
  if (missingCurrency.ok) return;
  assert.match(missingCurrency.issue.message, /缺少批次冻结的本位币/);
});

test("lock preparation freezes the post-lock metadata and deterministic report payload", () => {
  const generatedAt = new Date("2027-01-04T08:09:10.123Z");
  const batch = batchSnapshot("reviewed");
  const prepared = prepareLockedConsolidatedOutputSnapshot(batch, 19, generatedAt);

  assert.equal(prepared.ok, true);
  if (!prepared.ok) return;
  assert.equal(prepared.data.report.batch.status, "locked");
  assert.equal(prepared.data.report.batch.revision, batch.revision + 1);
  assert.equal(prepared.data.report.batch.lockedBy, 19);
  assert.equal(prepared.data.report.batch.lockedAt, generatedAt.toISOString());
  assert.equal(prepared.data.report.generatedAt, generatedAt.toISOString());
  assert.equal(prepared.data.data.version, CONSOLIDATED_OUTPUT_SNAPSHOT_VERSION);
  assert.equal(prepared.data.data.inputFingerprint.length, 64);
  assert.equal(prepared.data.data.outputFingerprint.length, 64);

  const frozen = readConsolidatedOutputSnapshot(
    prepared.data.data,
    batch.id,
    prepared.data.inputBatch,
  );
  assert.equal(frozen.ok, true);
  if (!frozen.ok) return;
  assert.deepEqual(frozen.data, prepared.data.report);
});

test("frozen output rejects changed report payloads instead of silently recomputing", () => {
  const generatedAt = new Date("2027-01-04T08:09:10.123Z");
  const prepared = prepareLockedConsolidatedOutputSnapshot(batchSnapshot("reviewed"), 19, generatedAt);
  assert.equal(prepared.ok, true);
  if (!prepared.ok) return;

  const tampered = structuredClone(prepared.data.data.reportPayload) as {
    statements: Array<{ lines: Array<{ amount: number }> }>;
  };
  tampered.statements[0]!.lines[0]!.amount += 1;
  const frozen = readConsolidatedOutputSnapshot({
    ...prepared.data.data,
    reportPayload: tampered,
  }, prepared.data.data.batchId, prepared.data.inputBatch);

  assert.equal(frozen.ok, false);
  if (frozen.ok) return;
  assert.match(frozen.issue.message, /指纹不一致/);
});
test("frozen output requires its lock-time input fingerprint", () => {
  const generatedAt = new Date("2027-01-04T08:09:10.123Z");
  const prepared = prepareLockedConsolidatedOutputSnapshot(batchSnapshot("reviewed"), 19, generatedAt);
  assert.equal(prepared.ok, true);
  if (!prepared.ok) return;

  const frozen = readConsolidatedOutputSnapshot({
    ...prepared.data.data,
    inputFingerprint: "",
  }, prepared.data.data.batchId, prepared.data.inputBatch);

  assert.equal(frozen.ok, false);
  if (frozen.ok) return;
  assert.match(frozen.issue.message, /输入指纹无效/);
});

test("frozen output rechecks source inputs while ignoring later publish metadata", () => {
  const generatedAt = new Date("2027-01-04T08:09:10.123Z");
  const prepared = prepareLockedConsolidatedOutputSnapshot(batchSnapshot("reviewed"), 19, generatedAt);
  assert.equal(prepared.ok, true);
  if (!prepared.ok) return;

  const publishedBatch: ConsolidationBatchSnapshot = {
    ...prepared.data.inputBatch,
    revision: prepared.data.inputBatch.revision + 1,
    status: "published",
    publishedBy: 23,
    publishedAt: "2027-01-05T00:00:00.000Z",
  };
  assert.equal(readConsolidatedOutputSnapshot(
    prepared.data.data,
    prepared.data.data.batchId,
    publishedBatch,
  ).ok, true);

  const changedInputs = structuredClone(publishedBatch);
  const payload = changedInputs.sources[0]!.reportPayload as {
    payload: { assets: Array<{ amount: number }> };
  };
  payload.payload.assets[0]!.amount += 1;
  const changed = readConsolidatedOutputSnapshot(
    prepared.data.data,
    prepared.data.data.batchId,
    changedInputs,
  );
  assert.equal(changed.ok, false);
  if (changed.ok) return;
  assert.match(changed.issue.message, /输入指纹不一致/);
});
