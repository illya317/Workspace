import type {
  ConsolidationBatchStatus,
  ConsolidationBatchLifecycleAction as ConsolidationBatchLifecycleActionValue,
  ConsolidationBatchLifecycleInput,
  ConsolidationControlKey,
  ConsolidationEntryType,
  ConsolidationRateApplicationSnapshot,
  EnsureConsolidationBatchInput,
  SaveConsolidationControlDecisionInput,
  SaveConsolidationSourcesInput,
  StatementReportType,
} from "@workspace/finance/types";
import { validateConsolidationFxFacts } from "./consolidation-fx-validation";
import {
  failCommand,
  okCommand,
  type DomainValidationResult,
} from "@workspace/platform/server/domain-validation";

const REPORT_TYPES = ["balanceSheet", "incomeStatement", "cashFlow"] as const;
const ELIMINATION_TYPES: readonly ConsolidationEntryType[] = [
  "investmentEquity",
  "nonControllingInterest",
  "intercompanyBalance",
  "internalTrading",
  "internalLongTermAsset",
  "incomeDividend",
  "cashFlow",
];
const CONTROL_KEYS: readonly ConsolidationControlKey[] = [
  "scope",
  "ownership",
  "sources",
  "fx",
  "tax",
  ...ELIMINATION_TYPES.map((entryType) => `elimination:${entryType}` as const),
];
const DECISIONS = ["completed", "notApplicable"] as const;

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
  input: EnsureConsolidationBatchInput;
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
  const baseBatchId = raw.baseBatchId == null ? null : positiveId(raw.baseBatchId);
  if (raw.baseBatchId != null && !baseBatchId) return failCommand("基础批次ID无效", 400, "baseBatchId");
  return okCommand({
    userId,
    input: { parentCompanyId, year: raw.year, month: raw.month, baseBatchId },
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
  if (!Array.isArray(raw.selections) || raw.selections.length === 0) {
    return failCommand("至少选择一份个别报表来源", 400, "selections");
  }
  const seen = new Set<string>();
  const selections = [] as SaveConsolidationSourcesInput["selections"];
  for (const item of raw.selections) {
    const entitySnapshotId = positiveId(item.entitySnapshotId);
    if (!entitySnapshotId) return failCommand("合并实体快照ID无效", 400, "entitySnapshotId");
    if (!REPORT_TYPES.includes(item.reportType)) return failCommand("个别报表类型无效", 400, "reportType");
    const key = `${entitySnapshotId}:${item.reportType}`;
    if (seen.has(key)) return failCommand("同一实体的报表来源不能重复", 400, "selections");
    seen.add(key);
    const workpaperId = item.workpaperId == null ? null : positiveId(item.workpaperId);
    if (item.workpaperId != null && !workpaperId) return failCommand("底稿ID无效", 400, "workpaperId");
    if (!workpaperId && item.acceptSystemSource !== true) {
      return failCommand("未选择底稿时必须明确接受系统账快照", 400, "acceptSystemSource");
    }
    const evidence = normalizedText(item.evidence) || null;
    if (!workpaperId && !evidence) return failCommand("接受系统账快照必须填写依据", 400, "evidence");
    selections.push({
      entitySnapshotId,
      reportType: item.reportType,
      workpaperId,
      acceptSystemSource: !workpaperId,
      evidence,
    });
  }
  const exchangeRateIds = [...new Set(raw.exchangeRateIds.map(Number))];
  if (exchangeRateIds.some((id) => !Number.isInteger(id) || id <= 0)) {
    return failCommand("汇率证据ID无效", 400, "exchangeRateIds");
  }
  if (!Array.isArray(raw.currencyPolicies) || raw.currencyPolicies.length === 0) {
    return failCommand("必须确认批次内每个实体的本位币及依据", 400, "currencyPolicies");
  }
  const currencyPolicyIds = new Set<number>();
  const currencyPolicies = [] as SaveConsolidationSourcesInput["currencyPolicies"];
  for (const policy of raw.currencyPolicies) {
    const entitySnapshotId = positiveId(policy.entitySnapshotId);
    if (!entitySnapshotId) return failCommand("本位币政策实体ID无效", 400, "entitySnapshotId");
    if (currencyPolicyIds.has(entitySnapshotId)) return failCommand("同一实体的本位币政策不能重复", 400, "currencyPolicies");
    currencyPolicyIds.add(entitySnapshotId);
    const functionalCurrency = normalizedText(policy.functionalCurrency).toUpperCase();
    if (functionalCurrency !== "CNY" && functionalCurrency !== "CAD") {
      return failCommand("当前合并批次仅支持 CNY 或 CAD 本位币", 400, "functionalCurrency");
    }
    const policyEvidence = normalizedText(policy.evidence);
    if (!policyEvidence) return failCommand("本位币政策必须填写判断依据", 400, "evidence");
    currencyPolicies.push({ entitySnapshotId, functionalCurrency, evidence: policyEvidence });
  }
  if (!Array.isArray(raw.rateApplications)) {
    return failCommand("汇率应用关系参数无效", 400, "rateApplications");
  }
  const rateIds = new Set(exchangeRateIds);
  const usedRateIds = new Set<number>();
  const applicationKeys = new Set<string>();
  const rateApplications = [] as SaveConsolidationSourcesInput["rateApplications"];
  for (const application of raw.rateApplications) {
    const exchangeRateId = positiveId(application.exchangeRateId);
    const entitySnapshotId = positiveId(application.entitySnapshotId);
    if (!exchangeRateId || !rateIds.has(exchangeRateId)) {
      return failCommand("汇率应用必须引用本次冻结的汇率证据", 400, "exchangeRateId");
    }
    if (!entitySnapshotId) return failCommand("汇率应用实体ID无效", 400, "entitySnapshotId");
    if (application.applicationType !== "closing" && application.applicationType !== "historicalInvestment") {
      return failCommand("汇率应用类型无效", 400, "applicationType");
    }
    if (application.periodBasis !== "current" && application.periodBasis !== "comparative") {
      return failCommand("汇率应用期间口径无效", 400, "periodBasis");
    }
    const voucherItemId = application.voucherItemId == null ? null : positiveId(application.voucherItemId);
    if (application.voucherItemId != null && !voucherItemId) return failCommand("投资凭证明细ID无效", 400, "voucherItemId");
    if (application.applicationType === "historicalInvestment" && !voucherItemId) {
      return failCommand("投资日汇率必须绑定投资凭证明细", 400, "voucherItemId");
    }
    if (application.applicationType === "closing" && voucherItemId) {
      return failCommand("期末汇率不能绑定投资凭证明细", 400, "voucherItemId");
    }
    const applicationEvidence = normalizedText(application.evidence);
    if (!applicationEvidence) return failCommand("汇率应用必须填写采用依据", 400, "evidence");
    const key = application.applicationType === "closing"
      ? `closing:${application.periodBasis}:${entitySnapshotId}`
      : `historicalInvestment:${application.periodBasis}:${voucherItemId}`;
    if (applicationKeys.has(key)) return failCommand("同一汇率应用目标不能重复", 400, "rateApplications");
    applicationKeys.add(key);
    usedRateIds.add(exchangeRateId);
    rateApplications.push({
      exchangeRateId,
      applicationType: application.applicationType,
      periodBasis: application.periodBasis,
      entitySnapshotId,
      voucherItemId,
      evidence: applicationEvidence,
    });
  }
  if (exchangeRateIds.some((id) => !usedRateIds.has(id))) {
    return failCommand("每条冻结汇率都必须绑定明确的折算用途", 400, "exchangeRateIds");
  }
  return okCommand({
    batchId,
    userId,
    input: { expectedRevision, selections, exchangeRateIds, currencyPolicies, rateApplications },
  });
}

export interface SaveConsolidationControlDecisionCommand {
  batchId: number;
  input: SaveConsolidationControlDecisionInput;
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
  if (!CONTROL_KEYS.includes(raw.controlKey)) return failCommand("合并控制点无效", 400, "controlKey");
  if (!DECISIONS.includes(raw.decision)) return failCommand("处理结论无效", 400, "decision");
  const conclusion = normalizedText(raw.conclusion);
  const evidence = normalizedText(raw.evidence);
  if (!conclusion) return failCommand("必须填写处理结论", 400, "conclusion");
  if (!evidence) return failCommand("必须填写结论依据", 400, "evidence");
  return okCommand({
    batchId,
    userId,
    input: { ...raw, expectedRevision, conclusion, evidence },
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
  if ((action === "review" || action === "return") && !normalizedNote) {
    return failCommand(action === "review" ? "复核必须填写意见" : "退回必须填写原因", 400, "note");
  }
  return okCommand({ batchId, userId, action, expectedRevision, note: normalizedNote });
}

const EXPECTED_STATUS: Record<ConsolidationBatchLifecycleAction, ConsolidationBatchStatus> = {
  submit: "draft",
  return: "submitted",
  review: "submitted",
  lock: "reviewed",
  publish: "locked",
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
  if (batch.status !== EXPECTED_STATUS[action]) {
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
  if (action === "lock" && (!batch.reviewedBy || batch.reviewedBy === batch.createdBy || batch.reviewedBy === batch.submittedBy)) {
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
    verifiedBy: number | null;
    verifiedAt: string | null;
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
      if (source.sourceKind === "workpaper" && (!source.workpaperId || !source.workpaperVersion || source.sourceStatus !== "submitted")) {
        return failCommand("底稿来源必须引用已提交的明确版本", 409, "sources");
      }
      if (source.sourceKind === "system" && !source.evidence?.trim()) {
        return failCommand("系统账来源必须保留人工接受依据", 409, "sources");
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
  const matchedTypes = new Set(["intercompanyBalance", "internalTrading", "cashFlow"]);
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
      const complete = entry.lines.every((line) => (
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
      const sides = new Set(entry.lines.map((line) => line.matchSide));
      if (!complete || !sides.has("left") || !sides.has("right")) {
        return failCommand("内部往来、交易和资金抵销必须保留双方结构化来源及指纹", 409, "matching");
      }
      if (Number(entry.matchDifference ?? 0) > 0 && !entry.differenceResolution?.trim()) {
        return failCommand("内部配对差额必须有明确处置结论", 409, "differenceResolution");
      }
    }
  }
  const partialEntities = facts.entities.filter((entity) => (
    entity.role === "subsidiary"
    && entity.shareRatio !== null
    && entity.shareRatio < 1
  ));
  if (partialEntities.length > 0) {
    const nciEntries = facts.entries.filter((entry) => entry.entryType === "nonControllingInterest");
    if (nciEntries.length === 0) {
      return failCommand("存在非全资子公司，必须按股权关系表编制少数股东权益和损益分配", 409, "elimination:nonControllingInterest");
    }
    for (const entity of partialEntities) {
      const entityLines = nciEntries.flatMap((entry) => entry.lines)
        .filter((line) => line.companyId === entity.companyId);
      const currentLineCodes = new Set(entityLines
        .filter((line) => (line.periodBasis ?? "current") === "current")
        .map((line) => line.lineCode));
      if (!currentLineCodes.has("nonControllingInterests") || !currentLineCodes.has("netProfitAttributableToNci")) {
        return failCommand(`非全资子公司 ${entity.companyId} 必须同时编制少数股东权益和少数股东损益`, 409, "elimination:nonControllingInterest");
      }
      const entityHasComparative = facts.sources.some((source) => (
        source.entitySnapshotId === entity.id && hasNonZeroComparative(source.reportPayload)
      ));
      if (entityHasComparative) {
        const comparativeLineCodes = new Set(entityLines
          .filter((line) => line.periodBasis === "comparative")
          .map((line) => line.lineCode));
        if (!comparativeLineCodes.has("nonControllingInterests") || !comparativeLineCodes.has("netProfitAttributableToNci")) {
          return failCommand(`非全资子公司 ${entity.companyId} 存在比较期数，必须补齐比较期少数股东权益和损益分配`, 409, "elimination:nonControllingInterest");
        }
      }
    }
  }
  for (const entryType of ELIMINATION_TYPES) {
    const decision = decisions.get(`elimination:${entryType}`);
    if (!facts.entries.some((entry) => entry.entryType === entryType)
      && (decision?.decision !== "notApplicable" || !decision.evidence.trim())) {
      return failCommand(`抵销事项 ${entryType} 必须有分录或明确无适用事项结论`, 409, `elimination:${entryType}`);
    }
  }
  const taxDecision = decisions.get("tax");
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
  if (facts.taxEffectCount === 0
    && (taxDecision?.decision !== "notApplicable" || !taxDecision.evidence.trim())) {
    return failCommand("无税务影响时必须明确记录无适用事项的结论与依据", 409, "tax");
  }
  return okCommand({ ready: true });
}
