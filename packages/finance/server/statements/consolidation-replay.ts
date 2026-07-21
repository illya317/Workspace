import type {
  ConsolidationBatchSnapshot,
  ConsolidationBatchStatus,
  ConsolidationBatchEventSnapshot,
  ConsolidationControlDecisionSnapshot,
  ConsolidationEntitySnapshot,
  ConsolidationEntrySnapshot,
  ConsolidationRateReferenceSnapshot,
  ConsolidationSourceSnapshot,
} from "@workspace/finance/types";
import { failCommand, okCommand, type DomainValidationResult } from "@workspace/platform/server/domain-validation";
import { validateConsolidationFxFacts } from "../domain/consolidation-fx-validation";
import {
  comparativeEntitySnapshotIds,
  comparativePeriodEndDate,
} from "./consolidation-comparative";
import {
  consolidationRateFingerprint,
  consolidationScopeFingerprint,
  consolidationSourceBatchFingerprint,
  consolidationSourceFactFingerprint,
} from "./consolidation-fingerprints";

const ELIMINATION_TYPES = [
  "investmentEquity",
  "nonControllingInterest",
  "intercompanyBalance",
  "internalTrading",
  "internalLongTermAsset",
  "incomeDividend",
  "cashFlow",
] as const;

export interface ConsolidationReplayPackage {
  batch: {
    id: number;
    parentCompanyId: number;
    year: number;
    month: number;
    version: number;
    revision: number;
    status: ConsolidationBatchStatus;
    baseBatchId: number | null;
    parentCompanyCode: string;
    parentCompanyName: string;
    scopeFingerprint: string;
    sourceFingerprint: string;
    rateFingerprint: string;
    createdBy: number;
    submittedBy: number | null;
    submittedAt: string | null;
    reviewedBy: number | null;
    reviewedAt: string | null;
    reviewNote: string | null;
    lockedBy: number | null;
    lockedAt: string | null;
    publishedBy: number | null;
    publishedAt: string | null;
  };
  entities: ConsolidationEntitySnapshot[];
  sources: ConsolidationSourceSnapshot[];
  exchangeRates: ConsolidationRateReferenceSnapshot[];
  approvedEntries: ConsolidationEntrySnapshot[];
  controlDecisions: ConsolidationControlDecisionSnapshot[];
  events: ConsolidationBatchEventSnapshot[];
  fingerprintVerification: {
    scope: { stored: string; recomputed: string };
    sources: { stored: string; recomputed: string };
    rates: { stored: string; recomputed: string };
  };
}

function replayBatchHeader(batch: ConsolidationBatchSnapshot): ConsolidationReplayPackage["batch"] {
  return {
    id: batch.id,
    parentCompanyId: batch.parentCompanyId,
    year: batch.year,
    month: batch.month,
    version: batch.version,
    revision: batch.revision,
    status: batch.status,
    baseBatchId: batch.baseBatchId,
    parentCompanyCode: batch.parentCompanyCode,
    parentCompanyName: batch.parentCompanyName,
    scopeFingerprint: batch.scopeFingerprint,
    sourceFingerprint: batch.sourceFingerprint,
    rateFingerprint: batch.rateFingerprint,
    createdBy: batch.createdBy,
    submittedBy: batch.submittedBy,
    submittedAt: batch.submittedAt,
    reviewedBy: batch.reviewedBy,
    reviewedAt: batch.reviewedAt,
    reviewNote: batch.reviewNote,
    lockedBy: batch.lockedBy,
    lockedAt: batch.lockedAt,
    publishedBy: batch.publishedBy,
    publishedAt: batch.publishedAt,
  };
}

export function buildConsolidationPreviewPackage(
  batch: ConsolidationBatchSnapshot,
): ConsolidationReplayPackage {
  const scopeFingerprint = consolidationScopeFingerprint(batch.entities);
  const entityBySnapshotId = new Map(batch.entities.map((entity) => [entity.id, entity]));
  const sourceFacts = batch.sources.map((source) => ({
    companyId: entityBySnapshotId.get(source.entitySnapshotId)?.companyId ?? 0,
    reportType: source.reportType,
    fingerprint: source.fingerprint,
  }));
  const sourceFingerprint = consolidationSourceBatchFingerprint(sourceFacts);
  const rateFingerprint = consolidationRateFingerprint(batch.exchangeRates);
  return {
    batch: replayBatchHeader(batch),
    entities: batch.entities,
    sources: batch.sources,
    exchangeRates: batch.exchangeRates,
    approvedEntries: batch.entries.filter((entry) => entry.status !== "reversed"),
    controlDecisions: batch.controlDecisions,
    events: batch.events,
    fingerprintVerification: {
      scope: { stored: batch.scopeFingerprint, recomputed: scopeFingerprint },
      sources: { stored: batch.sourceFingerprint, recomputed: sourceFingerprint },
      rates: { stored: batch.rateFingerprint, recomputed: rateFingerprint },
    },
  };
}

export function buildConsolidationReplayPackage(
  batch: ConsolidationBatchSnapshot,
): DomainValidationResult<ConsolidationReplayPackage> {
  if (batch.status !== "locked" && batch.status !== "published") {
    return failCommand("只有已锁定或已发布的合并批次可以重放", 409, "status");
  }
  const orderedEvents = [...batch.events].sort((left, right) =>
    left.batchRevision - right.batchRevision || left.id - right.id,
  );
  if (orderedEvents.length === 0
    || orderedEvents[0]?.action !== "create"
    || orderedEvents.some((event, index) =>
      event.batchRevision > batch.revision
      || (index > 0 && event.batchRevision <= orderedEvents[index - 1]!.batchRevision),
    )) {
    return failCommand("批次生命周期事件链不完整或顺序无效", 409, "events");
  }
  if (batch.entities.filter((entity) => entity.role === "parent").length !== 1 || batch.entities.length < 2) {
    return failCommand("批次缺少可重放的完整合并范围", 409, "entities");
  }
  const entityIds = new Set(batch.entities.map((entity) => entity.id));
  const companyIds = new Set(batch.entities.map((entity) => entity.companyId));
  if (batch.sources.some((source) => source.reportPayload === null || typeof source.reportPayload !== "object")) {
    return failCommand("批次存在无法重放的个别报表来源", 409, "sources");
  }
  const reportTypes = ["balanceSheet", "incomeStatement", "cashFlow"] as const;
  for (const entity of batch.entities) {
    for (const reportType of reportTypes) {
      const matches = batch.sources.filter((source) => source.entitySnapshotId === entity.id && source.reportType === reportType);
      if (matches.length !== 1) return failCommand("批次个别三表快照不完整或重复", 409, "sources");
    }
  }
  if (batch.sources.some((source) => !entityIds.has(source.entitySnapshotId))) {
    return failCommand("批次来源引用了范围外实体", 409, "sources");
  }
  const entityBySnapshotId = new Map(batch.entities.map((entity) => [entity.id, entity]));
  const recomputedSourceFacts = batch.sources.map((source) => {
    const entity = entityBySnapshotId.get(source.entitySnapshotId)!;
    const fingerprint = consolidationSourceFactFingerprint({
      companyId: entity.companyId,
      ...source,
    });
    return { companyId: entity.companyId, reportType: source.reportType, fingerprint };
  });
  if (batch.sources.some((source, index) => source.fingerprint !== recomputedSourceFacts[index]?.fingerprint)) {
    return failCommand("个别报表来源内容指纹不一致，批次不能重放", 409, "sourceFingerprint");
  }
  const approvedEntries = batch.entries.filter((entry) => entry.status === "approved");
  if (approvedEntries.length !== batch.entries.length) {
    return failCommand("批次存在未批准抵销分录，不能重放", 409, "entries");
  }
  if (approvedEntries.some((entry) => entry.lines.some((line) => !companyIds.has(line.companyId)))) {
    return failCommand("抵销分录引用了冻结范围外公司", 409, "entries");
  }
  const decisionByKey = new Map(batch.controlDecisions.map((decision) => [decision.controlKey, decision]));
  for (const entryType of ELIMINATION_TYPES) {
    const decision = decisionByKey.get(`elimination:${entryType}`);
    if (!approvedEntries.some((entry) => entry.entryType === entryType)
      && (decision?.decision !== "notApplicable" || !decision.evidence.trim())) {
      return failCommand("批次抵销分录与不适用结论不完整", 409, `elimination:${entryType}`);
    }
  }
  const taxEffectCount = approvedEntries.reduce((sum, entry) => sum + entry.taxEffects.length, 0);
  const taxDecision = decisionByKey.get("tax");
  if (taxEffectCount === 0 && (taxDecision?.decision !== "notApplicable" || !taxDecision.evidence.trim())) {
    return failCommand("批次缺少抵销税务影响或不适用结论", 409, "tax");
  }
  const historicalVoucherIds = batch.exchangeRates.flatMap((rate) => rate.applications
    .filter((application) => (
      application.applicationType === "historicalInvestment"
      && application.periodBasis === "current"
      && application.voucherItemId
    ))
    .map((application) => application.voucherItemId!));
  const periodEnd = new Date(Date.UTC(batch.year, batch.month, 0)).toISOString().slice(0, 10);
  const comparativePeriodEnd = comparativePeriodEndDate(periodEnd);
  const cadEntityIds = new Set(batch.entities
    .filter((entity) => entity.functionalCurrency === "CAD")
    .map((entity) => entity.id));
  const fxValidation = validateConsolidationFxFacts({
    periodEnd,
    comparativePeriodEnd,
    entities: batch.entities.map((entity) => ({
      id: entity.id,
      functionalCurrency: entity.functionalCurrency,
      currencyEvidence: entity.currencyEvidence,
    })),
    rates: batch.exchangeRates.map((rate) => ({
      exchangeRateId: rate.exchangeRateId,
      rateKind: rate.rateKind,
      rateDate: rate.rateDate,
      recordedBy: rate.recordedBy,
      recordedAt: rate.recordedAt,
      applications: rate.applications,
    })),
    requiredInvestmentVoucherIds: historicalVoucherIds,
    requiredComparativeEntityIds: comparativeEntitySnapshotIds(batch.sources)
      .filter((entityId) => cadEntityIds.has(entityId)),
  });
  if (!fxValidation.ok) return fxValidation;
  const recomputedScopeFingerprint = consolidationScopeFingerprint(batch.entities);
  const recomputedSourceFingerprint = consolidationSourceBatchFingerprint(recomputedSourceFacts);
  const recomputedRateFingerprint = consolidationRateFingerprint(batch.exchangeRates);
  if (batch.scopeFingerprint !== recomputedScopeFingerprint) {
    return failCommand("合并范围指纹不一致，批次不能重放", 409, "scopeFingerprint");
  }
  if (batch.sourceFingerprint !== recomputedSourceFingerprint) {
    return failCommand("个别报表来源汇总指纹不一致，批次不能重放", 409, "sourceFingerprint");
  }
  if (batch.rateFingerprint !== recomputedRateFingerprint) {
    return failCommand("汇率证据指纹不一致，批次不能重放", 409, "rateFingerprint");
  }
  return okCommand({
    batch: replayBatchHeader(batch),
    entities: batch.entities,
    sources: batch.sources,
    exchangeRates: batch.exchangeRates,
    approvedEntries,
    controlDecisions: batch.controlDecisions,
    events: orderedEvents,
    fingerprintVerification: {
      scope: { stored: batch.scopeFingerprint, recomputed: recomputedScopeFingerprint },
      sources: { stored: batch.sourceFingerprint, recomputed: recomputedSourceFingerprint },
      rates: { stored: batch.rateFingerprint, recomputed: recomputedRateFingerprint },
    },
  });
}
