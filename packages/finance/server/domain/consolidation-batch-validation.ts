import type {
  ConsolidationBatchStatus,
  ConsolidationBatchLifecycleAction as ConsolidationBatchLifecycleActionValue,
  ConsolidationBatchLifecycleInput,
  ConsolidationControlKey,
  ConsolidationRateApplicationSnapshot,
  EnsureConsolidationBatchInput,
  SaveConsolidationControlDecisionInput,
  SaveConsolidationSourcesInput,
  StatementReportType,
} from "@workspace/finance/types";
import type { StatementPeriodKind } from "@workspace/finance/types/statement-period";
import { validateConsolidationFxFacts } from "./consolidation-fx-validation";
import {
  ACTIVE_CONSOLIDATION_ENTRY_TYPES,
  CONSOLIDATION_COMPLETION_CONTROL_KEYS,
} from "./consolidation-batch-constants";
import {
  failCommand,
  okCommand,
  type DomainValidationResult,
} from "@workspace/platform/server/domain-validation";

const REPORT_TYPES = ["balanceSheet", "incomeStatement", "cashFlow"] as const;

function validActor(userId: number) {
  return Number.isInteger(userId) && userId > 0;
}

function positiveId(value: unknown) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function normalizedText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export interface EnsureConsolidationBatchCommand {
  input: Omit<EnsureConsolidationBatchInput, "periodKind"> & { periodKind: StatementPeriodKind };
  userId: number;
}

export function buildEnsureConsolidationBatchCommand(
  raw: EnsureConsolidationBatchInput,
  userId: number,
): DomainValidationResult<EnsureConsolidationBatchCommand> {
  if (!validActor(userId)) return failCommand("当前用户无效", 401);
  const parentCompanyId = positiveId(raw.parentCompanyId);
  if (!parentCompanyId) return failCommand("母公司ID无效", 400, "parentCompanyId");
  if (!Number.isInteger(raw.year) || raw.year < 1900 || raw.year > 2099) {
    return failCommand("合并年度无效", 400, "year");
  }
  if (!Number.isInteger(raw.month) || raw.month < 1 || raw.month > 12) {
    return failCommand("合并月份无效", 400, "month");
  }
  const periodKind = raw.periodKind ?? "month";
  if (periodKind === "year" && raw.month !== 12) {
    return failCommand("年度报表必须选择12月作为期末", 400, "month");
  }
  if (periodKind === "quarter" && raw.month % 3 !== 0) {
    return failCommand("季度报表必须选择季度末月份", 400, "month");
  }
  const baseBatchId = raw.baseBatchId == null ? null : positiveId(raw.baseBatchId);
  if (raw.baseBatchId != null && !baseBatchId) return failCommand("基础批次ID无效", 400, "baseBatchId");
  return okCommand({
    userId,
    input: { parentCompanyId, year: raw.year, month: raw.month, periodKind, baseBatchId },
  });
}

export interface SaveConsolidationSourcesCommand {
  batchId: number;
  input: SaveConsolidationSourcesInput;
  userId: number;
}

export function buildSaveConsolidationSourcesCommand(
  batchIdValue: unknown,
  raw: SaveConsolidationSourcesInput,
  userId: number,
): DomainValidationResult<SaveConsolidationSourcesCommand> {
  if (!validActor(userId)) return failCommand("当前用户无效", 401);
  const batchId = positiveId(batchIdValue);
  if (!batchId) return failCommand("合并批次ID无效", 400, "batchId");
  const expectedRevision = positiveId(raw.expectedRevision);
  if (!expectedRevision) return failCommand("合并批次修订号无效", 400, "expectedRevision");
  if (raw.intent !== "refresh" && raw.intent !== "completePreparation") {
    return failCommand("合并准备动作无效", 400, "intent");
  }
  return okCommand({
    batchId,
    userId,
    input: { expectedRevision, intent: raw.intent },
  });
}

export interface SaveConsolidationControlDecisionCommand {
  batchId: number;
  input: SaveConsolidationControlDecisionInput;
  decisions: Array<{
    controlKey: ConsolidationControlKey;
    decision: "completed" | "requiresReview" | "notApplicable";
    conclusion: string;
    evidence: string;
  }>;
  userId: number;
}

export function buildSaveConsolidationControlDecisionCommand(
  batchIdValue: unknown,
  raw: SaveConsolidationControlDecisionInput,
  userId: number,
): DomainValidationResult<SaveConsolidationControlDecisionCommand> {
  if (!validActor(userId)) return failCommand("当前用户无效", 401);
  const batchId = positiveId(batchIdValue);
  if (!batchId) return failCommand("合并批次ID无效", 400, "batchId");
  const expectedRevision = positiveId(raw.expectedRevision);
  if (!expectedRevision) return failCommand("合并批次修订号无效", 400, "expectedRevision");
  if (raw.mode === "setAll") {
    const completed = raw.decision === "completed";
    const conclusion = completed ? "已完成" : "需复核";
    const evidence = completed
      ? "编制人已统一确认；客观控制点仍以系统事实校验结果为准"
      : "编制人标记为需复核；完成复核前不得视为人工控制已完成";
    return okCommand({
      batchId,
      userId,
      input: { mode: "setAll", expectedRevision, decision: raw.decision },
      decisions: CONSOLIDATION_COMPLETION_CONTROL_KEYS.map((controlKey) => ({
        controlKey,
        decision: raw.decision,
        conclusion,
        evidence,
      })),
    });
  }
  const conclusion = normalizedText(raw.conclusion);
  const evidence = normalizedText(raw.evidence);
  if (!conclusion) return failCommand("必须填写处理结论", 400, "conclusion");
  if (!evidence) return failCommand("必须填写结论依据", 400, "evidence");
  const activeExceptionKeys = ACTIVE_CONSOLIDATION_ENTRY_TYPES.map((entryType) => `elimination:${entryType}` as const);
  if (!activeExceptionKeys.some((controlKey) => controlKey === raw.controlKey)) {
    return failCommand("当前阶段只能对投资权益或内部往来抵销记录不适用结论", 400, "controlKey");
  }
  return okCommand({
    batchId,
    userId,
    input: {
      mode: "notApplicable",
      expectedRevision,
      controlKey: raw.controlKey,
      conclusion,
      evidence,
    },
    decisions: [{
      controlKey: raw.controlKey,
      decision: "notApplicable",
      conclusion,
      evidence,
    }],
  });
}

export type ConsolidationBatchLifecycleAction = Exclude<ConsolidationBatchLifecycleActionValue, "create">;

export interface ConsolidationBatchLifecycleCommand {
  batchId: number;
  userId: number;
  action: ConsolidationBatchLifecycleAction;
  expectedRevision: number;
  note: string | null;
}

export function buildConsolidationBatchLifecycleCommand(
  action: ConsolidationBatchLifecycleAction,
  batchIdValue: unknown,
  userId: number,
  input: ConsolidationBatchLifecycleInput,
): DomainValidationResult<ConsolidationBatchLifecycleCommand> {
  if (!validActor(userId)) return failCommand("当前用户无效", 401);
  const batchId = positiveId(batchIdValue);
  if (!batchId) return failCommand("合并批次ID无效", 400, "batchId");
  const expectedRevision = positiveId(input.expectedRevision);
  if (!expectedRevision) return failCommand("合并批次修订号无效", 400, "expectedRevision");
  const normalizedNote = normalizedText(input.note) || null;
  if (action === "return" && !normalizedNote) return failCommand("退回必须填写原因", 400, "note");
  return okCommand({ batchId, userId, action, expectedRevision, note: normalizedNote });
}

const EXPECTED_STATUSES: Record<ConsolidationBatchLifecycleAction, readonly ConsolidationBatchStatus[]> = {
  submit: ["draft"],
  return: ["submitted", "reviewed"],
  review: ["submitted"],
  lock: ["draft", "reviewed"],
  publish: ["locked"],
};

const NEXT_STATUS: Record<ConsolidationBatchLifecycleAction, ConsolidationBatchStatus> = {
  submit: "submitted",
  return: "draft",
  review: "reviewed",
  lock: "locked",
  publish: "published",
};

export function validateConsolidationBatchTransition(
  batch: {
    status: ConsolidationBatchStatus;
    createdBy: number;
    submittedBy: number | null;
    reviewedBy: number | null;
    contributorUserIds?: readonly number[];
  },
  action: ConsolidationBatchLifecycleAction,
  userId: number,
): DomainValidationResult<{ nextStatus: ConsolidationBatchStatus }> {
  if (!EXPECTED_STATUSES[action].includes(batch.status)) {
    return failCommand(`当前批次状态 ${batch.status} 不能执行 ${action}`, 409, "status");
  }
  if ((action === "review" || action === "return") && (
    userId === batch.createdBy
    || userId === batch.submittedBy
    || batch.contributorUserIds?.includes(userId)
  )) {
    return failCommand(
      action === "review"
        ? "复核人必须独立于批次全部编制贡献者和提交人"
        : "退回处理人必须独立于批次全部编制贡献者和提交人",
      409,
      action === "review" ? "reviewedBy" : "returnedBy",
    );
  }
  if (action === "lock" && batch.status === "reviewed" && (
    !batch.reviewedBy
    || batch.reviewedBy === batch.createdBy
    || batch.reviewedBy === batch.submittedBy
  )) {
    return failCommand("批次尚未完成独立复核", 409, "reviewedBy");
  }
  return okCommand({ nextStatus: NEXT_STATUS[action] });
}

export interface ConsolidationSubmissionFacts {
  entities: {
    id: number;
    companyId: number;
    role: string;
    directParentCompanyId?: number | null;
    shareRatio: number | null;
    functionalCurrency: string | null;
    currencyEvidence: string | null;
  }[];
  sources: {
    entitySnapshotId: number;
    reportType: StatementReportType;
    sourceKind: string;
    sourceStatus: string;
    workpaperId: number | null;
    workpaperVersion: number | null;
    evidence: string | null;
    reportPayload: unknown;
  }[];
  exchangeRates: {
    exchangeRateId: number;
    rateKind: string;
    rateDate: string;
    recordedBy: number | null;
    recordedAt: string | null;
    applications: ConsolidationRateApplicationSnapshot[];
  }[];
  controlDecisions: { controlKey: string; decision: string; evidence: string }[];
  entries: {
    entryType: string;
    matchDifference?: number | null;
    differenceResolution?: string | null;
    lines: {
      companyId: number;
      statementType?: StatementReportType;
      lineCode?: string;
      periodBasis?: "current" | "comparative";
      debit: number;
      credit: number;
      matchSide?: "left" | "right" | null;
      sourceKind?: string | null;
      sourceId?: string | null;
      sourceFingerprint?: string | null;
      sourceAmount?: number | null;
      sourceCurrency?: string | null;
      counterpartyCompanyId?: number | null;
    }[];
  }[];
  taxEffectCount: number;
  taxEffects?: {
    recognition: string;
    entitySnapshotId: number | null;
    jurisdiction: string | null;
    recognitionLocation: string | null;
    balanceSheetLineCode: string | null;
    counterpartLineCode: string | null;
  }[];
  requiredInvestmentVoucherIds: number[];
  periodEnd: string;
}

function hasPayload(value: unknown, reportType: StatementReportType) {
  if (value === null || typeof value !== "object") return false;
  const envelope = value as { httpStatus?: unknown; payload?: unknown };
  if (typeof envelope.httpStatus !== "number" || envelope.httpStatus < 200 || envelope.httpStatus >= 300) return false;
  if (envelope.payload === null || typeof envelope.payload !== "object") return false;
  const payload = envelope.payload as {
    type?: unknown;
    lines?: unknown;
    assets?: unknown;
    liabilities?: unknown;
    equity?: unknown;
  };
  const expectedType = reportType === "balanceSheet" ? "balance" : reportType === "incomeStatement" ? "income" : "cashflow";
  if (payload.type !== expectedType) return false;
  if (reportType === "balanceSheet") {
    return Array.isArray(payload.assets)
      && Array.isArray(payload.liabilities)
      && Array.isArray(payload.equity)
      && payload.assets.length + payload.liabilities.length + payload.equity.length > 0;
  }
  return Array.isArray(payload.lines) && payload.lines.length > 0;
}

function hasNonZeroComparative(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasNonZeroComparative);
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  if (typeof row.previousAmount === "number" && Math.abs(row.previousAmount) >= 0.005) return true;
  return Object.values(row).some(hasNonZeroComparative);
}

function comparativePeriodEnd(periodEnd: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(periodEnd);
  if (!match) return "";
  const year = Number(match[1]);
  const month = Number(match[2]);
  return new Date(Date.UTC(year - 1, month, 0)).toISOString().slice(0, 10);
}

export function validateConsolidationSubmission(
  facts: ConsolidationSubmissionFacts,
): DomainValidationResult<{ ready: true }> {
  if (facts.entities.length < 2) return failCommand("合并范围至少需要母公司和一家子公司", 409, "scope");
  for (const entity of facts.entities) {
    if (entity.role !== "subsidiary") continue;
    if (entity.shareRatio === null || !Number.isFinite(entity.shareRatio) || entity.shareRatio <= 0 || entity.shareRatio > 1) {
      return failCommand("子公司直接持股比例必须大于0且不超过1", 409, "shareRatio");
    }
  }
  for (const entity of facts.entities) {
    for (const reportType of REPORT_TYPES) {
      const source = facts.sources.find((item) => item.entitySnapshotId === entity.id && item.reportType === reportType);
      if (!source || source.sourceKind === "missing" || !hasPayload(source.reportPayload, reportType)) {
        return failCommand("所有合并实体必须冻结完整个别三表", 409, "sources");
      }
    }
  }
  const fxValidation = validateConsolidationFxFacts({
    periodEnd: facts.periodEnd,
    comparativePeriodEnd: comparativePeriodEnd(facts.periodEnd),
    entities: facts.entities.map((entity) => ({
      id: entity.id,
      functionalCurrency: entity.functionalCurrency,
      currencyEvidence: entity.currencyEvidence,
    })),
    rates: facts.exchangeRates,
    requiredInvestmentVoucherIds: facts.requiredInvestmentVoucherIds,
    requiredComparativeEntityIds: facts.entities
      .filter((entity) => entity.functionalCurrency === "CAD")
      .filter((entity) => facts.sources.some((source) => (
        source.entitySnapshotId === entity.id && hasNonZeroComparative(source.reportPayload)
      )))
      .map((entity) => entity.id),
  });
  if (!fxValidation.ok) return fxValidation;
  const decisions = new Map(facts.controlDecisions.map((item) => [item.controlKey, item]));
  const companyIds = new Set(facts.entities.map((entity) => entity.companyId));
  const matchedTypes = new Set(["investmentEquity", "intercompanyBalance"]);
  for (const entry of facts.entries) {
    if (entry.lines.some((line) => !companyIds.has(line.companyId))) {
      return failCommand("抵销分录引用了批次范围外公司，必须人工修订后再提交", 409, "entries");
    }
    const debit = entry.lines.reduce((sum, line) => sum + Math.round(line.debit * 100), 0);
    const credit = entry.lines.reduce((sum, line) => sum + Math.round(line.credit * 100), 0);
    if (entry.lines.length < 2 || debit !== credit) {
      return failCommand("抵销分录借贷不平衡，必须人工修订后再提交", 409, "entries");
    }
    if (matchedTypes.has(entry.entryType)) {
      const matchingLines = entry.lines.filter((line) => line.lineCode !== "otherComprehensiveIncome");
      const complete = matchingLines.every((line) => (
        (line.matchSide === "left" || line.matchSide === "right")
        && Boolean(line.sourceKind?.trim())
        && Boolean(line.sourceId?.trim())
        && Boolean(line.sourceFingerprint?.trim())
        && Number.isFinite(line.sourceAmount)
        && Number(line.sourceAmount) > 0
        && Boolean(line.sourceCurrency?.trim())
        && Boolean(line.counterpartyCompanyId)
        && companyIds.has(Number(line.counterpartyCompanyId))
        && line.counterpartyCompanyId !== line.companyId
      ));
      const sides = new Set(matchingLines.map((line) => line.matchSide));
      if (!complete || !sides.has("left") || !sides.has("right")) {
        return failCommand("内部往来、交易和资金抵销必须保留双方结构化来源及指纹", 409, "matching");
      }
      if (Number(entry.matchDifference ?? 0) > 0 && !entry.differenceResolution?.trim()) {
        return failCommand("内部配对差额必须有明确处置结论", 409, "differenceResolution");
      }
    }
  }
  for (const entryType of ACTIVE_CONSOLIDATION_ENTRY_TYPES) {
    const decision = decisions.get(`elimination:${entryType}`);
    if (!facts.entries.some((entry) => entry.entryType === entryType)
      && (decision?.decision !== "notApplicable" || !decision.evidence.trim())) {
      return failCommand(`抵销事项 ${entryType} 必须有分录或明确无适用事项结论`, 409, `elimination:${entryType}`);
    }
  }
  for (const tax of facts.taxEffects ?? []) {
    if (!tax.entitySnapshotId || !facts.entities.some((entity) => entity.id === tax.entitySnapshotId) || !tax.jurisdiction?.trim()) {
      return failCommand("税务影响必须绑定批次内纳税主体和税辖区", 409, "tax");
    }
    if (tax.recognition !== "unrecognized" && (
      !tax.recognitionLocation
      || !tax.balanceSheetLineCode
      || !tax.counterpartLineCode
    )) {
      return failCommand("已确认税务影响必须明确递延税及对应损益/权益报表行", 409, "tax");
    }
  }
  return okCommand({ ready: true });
}
