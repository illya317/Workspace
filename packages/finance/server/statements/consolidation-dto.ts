import type {
  ConsolidationBatchSnapshot,
  ConsolidationBatchEventSnapshot,
  ConsolidationControlDecisionSnapshot,
  ConsolidationEntitySnapshot,
  ConsolidationEntrySnapshot,
  ConsolidationRateReferenceSnapshot,
  ConsolidationSourceSnapshot,
} from "@workspace/finance/types";
import { Prisma, prisma } from "@workspace/platform/server/prisma";

export const CONSOLIDATION_BATCH_INCLUDE = {
  entities: { orderBy: [{ role: "asc" }, { companyCode: "asc" }] },
  sources: { orderBy: [{ entitySnapshotId: "asc" }, { reportType: "asc" }] },
  exchangeRates: { orderBy: [{ rateDate: "asc" }, { exchangeRateVersion: "asc" }] },
  entries: {
    orderBy: [{ entryNo: "asc" }, { version: "asc" }],
    include: {
      lines: { orderBy: { lineNo: "asc" } },
      taxEffects: { orderBy: { effectKey: "asc" } },
    },
  },
  controlDecisions: { orderBy: { controlKey: "asc" } },
  events: { orderBy: [{ batchRevision: "asc" }, { id: "asc" }] },
  matchGroups: {
    orderBy: [{ category: "asc" }, { generationKey: "asc" }],
    include: { entry: { select: { id: true, status: true } } },
  },
  outputSnapshot: true,
} satisfies Prisma.FinanceConsolidationBatchInclude;

export type ConsolidationBatchRow = Prisma.FinanceConsolidationBatchGetPayload<{
  include: typeof CONSOLIDATION_BATCH_INCLUDE;
}>;

function sourceSnapshot(row: ConsolidationBatchRow["sources"][number]): ConsolidationSourceSnapshot {
  return {
    id: row.id,
    entitySnapshotId: row.entitySnapshotId,
    reportType: row.reportType as ConsolidationSourceSnapshot["reportType"],
    sourceKind: row.sourceKind as ConsolidationSourceSnapshot["sourceKind"],
    sourceStatus: row.sourceStatus as ConsolidationSourceSnapshot["sourceStatus"],
    workpaperId: row.workpaperId,
    workpaperVersion: row.workpaperVersion,
    sourceChecksum: row.sourceChecksum,
    workpaperUpdatedBy: row.workpaperUpdatedBy,
    sourcePackageId: row.sourcePackageId,
    sourcePackageRevision: row.sourcePackageRevision,
    sourcePackageStatus: row.sourcePackageStatus,
    sourcePackageChecksum: row.sourcePackageChecksum,
    sourcePackageUploadedBy: row.sourcePackageUploadedBy,
    sourcePackageSubmittedBy: row.sourcePackageSubmittedBy,
    lineCount: row.lineCount,
    sourcedLineCount: row.sourcedLineCount,
    importedLineCount: row.importedLineCount,
    manualLineCount: row.manualLineCount,
    formulaLineCount: row.formulaLineCount,
    fingerprint: row.fingerprint,
    evidence: row.evidence,
    selectedBy: row.selectedBy,
    selectedAt: row.selectedAt.toISOString(),
    reportPayload: row.reportPayload,
  };
}

function entitySnapshot(row: ConsolidationBatchRow["entities"][number]): ConsolidationEntitySnapshot {
  return {
    id: row.id,
    companyId: row.companyId,
    companyCode: row.companyCode,
    companyName: row.companyName,
    role: row.role as ConsolidationEntitySnapshot["role"],
    directParentCompanyId: row.directParentCompanyId,
    directParentCode: row.directParentCode,
    relationId: row.relationId,
    relationUpdatedAt: row.relationUpdatedAt?.toISOString() ?? null,
    relationEffectiveFrom: row.relationEffectiveFrom?.toISOString() ?? null,
    relationEffectiveTo: row.relationEffectiveTo?.toISOString() ?? null,
    relationVersion: row.relationVersion,
    shareRatio: row.shareRatio === null ? null : Number(row.shareRatio),
    isConsolidated: row.isConsolidated,
    functionalCurrency: row.functionalCurrency,
    currencyEvidence: row.currencyEvidence,
    currencyDecidedBy: row.currencyDecidedBy,
  };
}

function rateSnapshot(row: ConsolidationBatchRow["exchangeRates"][number]): ConsolidationRateReferenceSnapshot {
  return {
    id: row.id,
    exchangeRateId: row.exchangeRateId,
    exchangeRateVersion: row.exchangeRateVersion,
    baseCurrency: row.baseCurrency,
    quoteCurrency: row.quoteCurrency,
    rateKind: row.rateKind as ConsolidationRateReferenceSnapshot["rateKind"],
    rateDate: row.rateDate,
    rate: Number(row.rate),
    sourceUrl: row.sourceUrl,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    recordedBy: row.recordedBy,
    recordedAt: row.recordedAt?.toISOString() ?? null,
    applications: Array.isArray(row.applications)
      ? row.applications as unknown as ConsolidationRateReferenceSnapshot["applications"]
      : [],
  };
}

function entrySnapshot(row: ConsolidationBatchRow["entries"][number]): ConsolidationEntrySnapshot {
  return {
    id: row.id,
    entryNo: row.entryNo,
    entryType: row.entryType as ConsolidationEntrySnapshot["entryType"],
    title: row.title,
    description: row.description,
    evidence: row.evidence,
    matchDifference: row.matchDifference == null ? null : Number(row.matchDifference),
    differenceResolution: row.differenceResolution,
    origin: row.origin as ConsolidationEntrySnapshot["origin"],
    generationKey: row.generationKey,
    generationFingerprint: row.generationFingerprint,
    generatedAt: row.generatedAt?.toISOString() ?? null,
    status: row.status as ConsolidationEntrySnapshot["status"],
    version: row.version,
    supersedesEntryId: row.supersedesEntryId,
    reversalOfEntryId: row.reversalOfEntryId,
    predecessorEntryId: row.predecessorEntryId,
    preparedBy: row.preparedBy,
    submittedBy: row.submittedBy,
    submittedAt: row.submittedAt?.toISOString() ?? null,
    approvedBy: row.approvedBy,
    approvedAt: row.approvedAt?.toISOString() ?? null,
    approvalNote: row.approvalNote,
    reversedBy: row.reversedBy,
    reversedAt: row.reversedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    lines: row.lines.map((line) => ({
      id: line.id,
      lineNo: line.lineNo,
      entitySnapshotId: line.entitySnapshotId,
      companyId: line.companyId,
      companyCode: line.companyCode,
      statementType: line.statementType as ConsolidationEntrySnapshot["lines"][number]["statementType"],
      lineCode: line.lineCode,
      accountCode: line.accountCode,
      debit: Number(line.debit),
      credit: Number(line.credit),
      currencyCode: line.currencyCode,
      periodBasis: line.periodBasis as ConsolidationEntrySnapshot["lines"][number]["periodBasis"],
      note: line.note,
      matchSide: line.matchSide as ConsolidationEntrySnapshot["lines"][number]["matchSide"],
      sourceKind: line.sourceKind as ConsolidationEntrySnapshot["lines"][number]["sourceKind"],
      sourceId: line.sourceId,
      sourceFingerprint: line.sourceFingerprint,
      sourceAmount: line.sourceAmount == null ? null : Number(line.sourceAmount),
      sourceCurrency: line.sourceCurrency,
      sourceRecordId: line.sourceSnapshotId
        ?? line.sourceAuxiliaryBalanceId
        ?? line.sourceOpenItemId
        ?? line.sourceCashFlowAllocationId
        ?? line.sourceVoucherItemId,
      counterpartyEntitySnapshotId: line.counterpartyEntitySnapshotId,
      counterpartyCompanyId: line.counterpartyCompanyId,
    })),
    taxEffects: row.taxEffects.map((tax) => ({
      id: tax.id,
      entitySnapshotId: tax.entitySnapshotId,
      effectKey: tax.effectKey,
      taxEffectType: tax.taxEffectType as ConsolidationEntrySnapshot["taxEffects"][number]["taxEffectType"],
      differenceAmount: Number(tax.differenceAmount),
      taxRate: Number(tax.taxRate),
      derivedTaxAmount: Math.round(Math.abs(Number(tax.differenceAmount) * Number(tax.taxRate)) * 100) / 100,
      recognition: tax.recognition as ConsolidationEntrySnapshot["taxEffects"][number]["recognition"],
      periodBasis: tax.periodBasis as ConsolidationEntrySnapshot["taxEffects"][number]["periodBasis"],
      jurisdiction: tax.jurisdiction,
      recognitionLocation: tax.recognitionLocation as ConsolidationEntrySnapshot["taxEffects"][number]["recognitionLocation"],
      balanceSheetLineCode: tax.balanceSheetLineCode,
      counterpartLineCode: tax.counterpartLineCode,
      reversalPeriod: tax.reversalPeriod,
      recoverabilityConclusion: tax.recoverabilityConclusion,
      evidence: tax.evidence,
      preparedBy: tax.preparedBy,
      createdAt: tax.createdAt.toISOString(),
      updatedAt: tax.updatedAt.toISOString(),
    })),
  };
}

function eventSnapshot(row: ConsolidationBatchRow["events"][number]): ConsolidationBatchEventSnapshot {
  return {
    id: row.id,
    eventType: row.eventType as ConsolidationBatchEventSnapshot["eventType"],
    action: row.action as ConsolidationBatchEventSnapshot["action"],
    fromStatus: row.fromStatus,
    toStatus: row.toStatus,
    note: row.note,
    actorUserId: row.actorUserId,
    actorName: row.actorName,
    batchRevision: row.batchRevision,
    targetType: row.targetType as ConsolidationBatchEventSnapshot["targetType"],
    targetId: row.targetId,
    snapshot: row.snapshot,
    createdAt: row.createdAt.toISOString(),
  };
}

function decisionSnapshot(row: ConsolidationBatchRow["controlDecisions"][number]): ConsolidationControlDecisionSnapshot {
  return {
    id: row.id,
    controlKey: row.controlKey as ConsolidationControlDecisionSnapshot["controlKey"],
    decision: row.decision as ConsolidationControlDecisionSnapshot["decision"],
    conclusion: row.conclusion,
    evidence: row.evidence,
    decidedBy: row.decidedBy,
    decidedAt: row.decidedAt.toISOString(),
  };
}

export function consolidationBatchSnapshot(row: ConsolidationBatchRow): ConsolidationBatchSnapshot {
  return {
    id: row.id,
    parentCompanyId: row.parentCompanyId,
    parentCompanyCode: row.parentCompanyCode,
    parentCompanyName: row.parentCompanyName,
    year: row.year,
    month: row.month,
    periodKind: row.periodKind as ConsolidationBatchSnapshot["periodKind"],
    version: row.version,
    revision: row.revision,
    status: row.status as ConsolidationBatchSnapshot["status"],
    baseBatchId: row.baseBatchId,
    scopeFingerprint: row.scopeFingerprint,
    sourceFingerprint: row.sourceFingerprint,
    rateFingerprint: row.rateFingerprint,
    createdBy: row.createdBy,
    submittedBy: row.submittedBy,
    submittedAt: row.submittedAt?.toISOString() ?? null,
    reviewedBy: row.reviewedBy,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    reviewNote: row.reviewNote,
    lockedBy: row.lockedBy,
    lockedAt: row.lockedAt?.toISOString() ?? null,
    publishedBy: row.publishedBy,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    entities: row.entities.map(entitySnapshot),
    sources: row.sources.map(sourceSnapshot),
    exchangeRates: row.exchangeRates.map(rateSnapshot),
    entries: row.entries.map(entrySnapshot),
    controlDecisions: row.controlDecisions.map(decisionSnapshot),
    events: row.events.map(eventSnapshot),
  };
}

export async function loadConsolidationBatchRow(batchId: number) {
  return prisma.financeConsolidationBatch.findUnique({
    where: { id: batchId },
    include: CONSOLIDATION_BATCH_INCLUDE,
  });
}
