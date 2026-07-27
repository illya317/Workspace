import type {
  ConsolidationEntryStatus,
  DeleteConsolidationMutationInput,
  GenerateConsolidationEntriesInput,
  ReviewConsolidationEntryInput,
  SaveConsolidationEntryInput,
  SaveConsolidationTaxEffectInput,
} from "@workspace/finance/types";
import {
  failCommand,
  okCommand,
  type DomainValidationResult,
} from "@workspace/platform/server/domain-validation";

const ENTRY_TYPES = [
  "investmentEquity",
  "reclassification",
  "nonControllingInterest",
  "intercompanyBalance",
  "internalTrading",
  "internalLongTermAsset",
  "incomeDividend",
  "cashFlow",
] as const;
const REPORT_TYPES = ["balanceSheet", "incomeStatement", "cashFlow"] as const;
const MATCHED_ENTRY_TYPES = new Set(["intercompanyBalance", "internalTrading", "cashFlow"] as const);
const MATCH_SOURCE_KINDS = ["auxiliaryBalance", "openItem", "cashFlowAllocation", "workpaper", "voucher"] as const;

function positiveId(value: unknown) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function moneyCents(value: number) {
  return Math.round(value * 100);
}

export interface GenerateConsolidationEntriesCommand {
  batchId: number;
  userId: number;
  expectedRevision: number;
}

export function buildGenerateConsolidationEntriesCommand(
  batchIdValue: unknown,
  raw: GenerateConsolidationEntriesInput,
  userId: number,
): DomainValidationResult<GenerateConsolidationEntriesCommand> {
  const batchId = positiveId(batchIdValue);
  if (!batchId) return failCommand("合并批次ID无效", 400, "batchId");
  if (!positiveId(userId)) return failCommand("当前用户无效", 401);
  const expectedRevision = positiveId(raw.expectedRevision);
  if (!expectedRevision) return failCommand("合并批次修订号无效", 400, "expectedRevision");
  return okCommand({ batchId, userId, expectedRevision });
}

export type ConsolidationEntryReviewAction = "approve" | "return";

export interface ReviewConsolidationEntryCommand {
  action: ConsolidationEntryReviewAction;
  batchId: number;
  entryId: number;
  userId: number;
  expectedRevision: number;
  note: string | null;
}

export function consolidationEntryReviewBlockReason(facts: {
  entryOrigin: string | null;
  evidence: string | null;
}) {
  if (facts.entryOrigin !== "manual" || !facts.evidence?.includes("待补证")) return null;
  return "来源仍标记为待补证；补齐来源并更新集团凭证后才能复核";
}

export function buildReviewConsolidationEntryCommand(
  action: ConsolidationEntryReviewAction,
  batchIdValue: unknown,
  entryIdValue: unknown,
  raw: ReviewConsolidationEntryInput,
  userId: number,
): DomainValidationResult<ReviewConsolidationEntryCommand> {
  const batchId = positiveId(batchIdValue);
  const entryId = positiveId(entryIdValue);
  const expectedRevision = positiveId(raw.expectedRevision);
  if (!batchId) return failCommand("合并批次ID无效", 400, "batchId");
  if (!entryId) return failCommand("抵销分录ID无效", 400, "entryId");
  if (!positiveId(userId)) return failCommand("当前用户无效", 401);
  if (!expectedRevision) return failCommand("合并批次修订号无效", 400, "expectedRevision");
  return okCommand({
    action,
    batchId,
    entryId,
    userId,
    expectedRevision,
    note: text(raw.note) || null,
  });
}

export function validateConsolidationEntryReviewTarget(
  action: ConsolidationEntryReviewAction,
  facts: {
    batchStatus: string;
    entryOrigin: string | null;
    entryStatus: string;
    generationKey: string | null;
    matchStatus: string | null;
    evidence?: string | null;
    preparedBy?: number | null;
    reviewerId?: number | null;
  },
): DomainValidationResult<{ entryStatus: "approved" | "draft"; matchStatus: "accepted" | "rejected" | null }> {
  if (facts.batchStatus !== "draft") return failCommand("只有草稿批次允许逐项审阅抵销分录", 409, "status");
  if (action === "approve" && facts.preparedBy && facts.reviewerId === facts.preparedBy) {
    return failCommand("集团凭证编制人与复核人必须分离", 409, "reviewerId");
  }
  const reviewBlockReason = consolidationEntryReviewBlockReason({
    entryOrigin: facts.entryOrigin,
    evidence: facts.evidence ?? null,
  });
  if (action === "approve" && reviewBlockReason) {
    return failCommand(reviewBlockReason, 409, "evidence");
  }
  if (facts.entryOrigin === "manual" && !facts.generationKey && !facts.matchStatus) {
    if (action === "approve" && facts.entryStatus !== "draft") return failCommand("该集团凭证已经复核", 409, "status");
    if (action === "return" && facts.entryStatus !== "approved") return failCommand("只有已复核集团凭证可以退回", 409, "status");
    return okCommand(action === "approve"
      ? { entryStatus: "approved", matchStatus: null }
      : { entryStatus: "draft", matchStatus: null });
  }
  if (facts.entryOrigin !== "system" || !facts.generationKey || !facts.matchStatus) {
    return failCommand("集团凭证不是可审阅事项", 409, "entryId");
  }
  if (action === "approve" && !["matched", "rejected"].includes(facts.matchStatus)) {
    return failCommand(facts.matchStatus === "accepted" ? "该抵销分录已经通过审阅" : "当前匹配结果不能通过审阅", 409, "status");
  }
  if (action === "return" && !["matched", "accepted"].includes(facts.matchStatus)) {
    return failCommand(facts.matchStatus === "rejected" ? "该抵销分录已经退回" : "当前匹配结果不能退回", 409, "status");
  }
  return okCommand(action === "approve"
    ? { entryStatus: "approved", matchStatus: "accepted" }
    : { entryStatus: "draft", matchStatus: "rejected" });
}

type MoneyValue = number | { toString(): string };

interface ConsolidationReversalLineFact {
  entitySnapshotId: number;
  statementType: string;
  lineCode: string;
  accountCode?: string | null;
  debit: MoneyValue;
  credit: MoneyValue;
  currencyCode?: string | null;
  periodBasis?: string | null;
}

function canonicalReversalLine(
  line: ConsolidationReversalLineFact,
  reverse: boolean,
) {
  const debit = moneyCents(Number(reverse ? line.credit : line.debit));
  const credit = moneyCents(Number(reverse ? line.debit : line.credit));
  return JSON.stringify([
    line.entitySnapshotId,
    line.statementType,
    line.lineCode,
    line.accountCode ?? null,
    (line.currencyCode || "CNY").toUpperCase(),
    line.periodBasis || "current",
    debit,
    credit,
  ]);
}

export function isExactConsolidationReversal(
  original: readonly ConsolidationReversalLineFact[],
  reversal: readonly ConsolidationReversalLineFact[],
) {
  if (original.length !== reversal.length) return false;
  const expected = new Map<string, number>();
  for (const line of original) {
    const key = canonicalReversalLine(line, true);
    expected.set(key, (expected.get(key) ?? 0) + 1);
  }
  for (const line of reversal) {
    const key = canonicalReversalLine(line, false);
    const remaining = expected.get(key) ?? 0;
    if (remaining === 0) return false;
    if (remaining === 1) expected.delete(key);
    else expected.set(key, remaining - 1);
  }
  return expected.size === 0;
}

export function validateConsolidationVersionTarget(
  batch: { baseBatchId: number | null },
  target: { batchId: number; status: string; hasSuccessor: boolean },
): DomainValidationResult<{ valid: true }> {
  if (!batch.baseBatchId || target.batchId !== batch.baseBatchId || target.status !== "approved") {
    return failCommand("只能修订或冲销当前批次直接基础版本中的批准分录", 409, "baseBatchId");
  }
  if (target.hasSuccessor) {
    return failCommand("该批准分录已有后续修订或冲销，不能形成分支", 409, "predecessorEntryId");
  }
  return okCommand({ valid: true });
}

export interface SaveConsolidationEntryCommand {
  batchId: number;
  userId: number;
  input: SaveConsolidationEntryInput;
}

export function buildSaveConsolidationEntryCommand(
  batchIdValue: unknown,
  raw: SaveConsolidationEntryInput,
  userId: number,
): DomainValidationResult<SaveConsolidationEntryCommand> {
  const batchId = positiveId(batchIdValue);
  if (!batchId) return failCommand("合并批次ID无效", 400, "batchId");
  if (!positiveId(userId)) return failCommand("当前用户无效", 401);
  const expectedRevision = positiveId(raw.expectedRevision);
  if (!expectedRevision) return failCommand("合并批次修订号无效", 400, "expectedRevision");
  const entryId = raw.entryId == null ? null : positiveId(raw.entryId);
  if (raw.entryId != null && !entryId) return failCommand("抵销分录ID无效", 400, "entryId");
  const supersedesEntryId = raw.supersedesEntryId == null ? null : positiveId(raw.supersedesEntryId);
  if (raw.supersedesEntryId != null && !supersedesEntryId) return failCommand("被修订分录ID无效", 400, "supersedesEntryId");
  const reversalOfEntryId = raw.reversalOfEntryId == null ? null : positiveId(raw.reversalOfEntryId);
  if (raw.reversalOfEntryId != null && !reversalOfEntryId) return failCommand("被冲销分录ID无效", 400, "reversalOfEntryId");
  if (entryId && (supersedesEntryId || reversalOfEntryId)) {
    return failCommand("原地编辑与新版本/冲销不能同时提交", 400, "entryId");
  }
  if (supersedesEntryId && reversalOfEntryId) {
    return failCommand("修订分录与冲销分录必须二选一", 400, "supersedesEntryId");
  }
  if (!ENTRY_TYPES.includes(raw.entryType)) return failCommand("抵销分录类型无效", 400, "entryType");
  const entryNo = text(raw.entryNo);
  const postingDate = text(raw.postingDate) || null;
  const documentType = raw.documentType ?? "groupAdjustment";
  const postingLevel = raw.postingLevel ?? "30";
  const title = text(raw.title);
  const description = text(raw.description) || null;
  const evidence = text(raw.evidence);
  if (!entryNo) return failCommand("抵销分录编号不能为空", 400, "entryNo");
  if (postingDate && !/^\d{4}-\d{2}-\d{2}$/.test(postingDate)) return failCommand("凭证日期格式无效", 400, "postingDate");
  if (!["groupAdjustment", "elimination", "reclassification"].includes(documentType)) return failCommand("集团凭证类型无效", 400, "documentType");
  if (!["10", "20", "30"].includes(postingLevel)) return failCommand("集团凭证层级无效", 400, "postingLevel");
  if (!title) return failCommand("抵销分录标题不能为空", 400, "title");
  if (!evidence) return failCommand("抵销分录必须填写证据", 400, "evidence");
  if (MATCHED_ENTRY_TYPES.has(raw.entryType as "intercompanyBalance" | "internalTrading" | "cashFlow") && !description) {
    return failCommand("内部往来、交易和资金抵销必须填写配对与差额说明", 400, "description");
  }
  if (!Array.isArray(raw.lines) || raw.lines.length < 2) {
    return failCommand("抵销分录至少需要两行", 400, "lines");
  }
  let debitCents = 0;
  let creditCents = 0;
  const lines = [] as SaveConsolidationEntryInput["lines"];
  for (const [index, line] of raw.lines.entries()) {
    const entitySnapshotId = positiveId(line.entitySnapshotId);
    if (!entitySnapshotId) return failCommand(`第${index + 1}行合并主体无效`, 400, "entitySnapshotId");
    if (!REPORT_TYPES.includes(line.statementType)) return failCommand(`第${index + 1}行报表类型无效`, 400, "statementType");
    const lineCode = text(line.lineCode);
    if (!lineCode) return failCommand(`第${index + 1}行报表项目不能为空`, 400, "lineCode");
    if (!Number.isFinite(line.debit) || !Number.isFinite(line.credit) || line.debit < 0 || line.credit < 0) {
      return failCommand(`第${index + 1}行借贷金额无效`, 400, "lines");
    }
    const debit = moneyCents(line.debit) / 100;
    const credit = moneyCents(line.credit) / 100;
    if ((debit > 0) === (credit > 0)) {
      return failCommand(`第${index + 1}行必须且只能填写借方或贷方`, 400, "lines");
    }
    debitCents += moneyCents(debit);
    creditCents += moneyCents(credit);
    const matchSide = line.matchSide === "left" || line.matchSide === "right" ? line.matchSide : null;
    const sourceKind = MATCH_SOURCE_KINDS.includes(line.sourceKind as typeof MATCH_SOURCE_KINDS[number])
      ? line.sourceKind as typeof MATCH_SOURCE_KINDS[number]
      : null;
    const sourceRecordId = line.sourceRecordId == null ? null : positiveId(line.sourceRecordId);
    const counterpartyEntitySnapshotId = line.counterpartyEntitySnapshotId == null ? null : positiveId(line.counterpartyEntitySnapshotId);
    const counterpartyCompanyId = line.counterpartyCompanyId == null ? null : positiveId(line.counterpartyCompanyId);
    const groupAccountId = line.groupAccountId == null ? null : positiveId(line.groupAccountId);
    const periodBasis = line.periodBasis === "comparative" ? "comparative" : "current";
    if (line.sourceRecordId != null && !sourceRecordId) {
      return failCommand(`第${index + 1}行来源记录无效`, 400, "sourceRecordId");
    }
    if (line.counterpartyEntitySnapshotId != null && !counterpartyEntitySnapshotId) {
      return failCommand(`第${index + 1}行对方主体无效`, 400, "counterpartyEntitySnapshotId");
    }
    if (line.counterpartyCompanyId != null && !counterpartyCompanyId) return failCommand(`第${index + 1}行对方公司无效`, 400, "counterpartyCompanyId");
    if (line.groupAccountId != null && !groupAccountId) return failCommand(`第${index + 1}行集团科目无效`, 400, "groupAccountId");
    if (MATCHED_ENTRY_TYPES.has(raw.entryType as "intercompanyBalance" | "internalTrading" | "cashFlow")) {
      if (!matchSide || !sourceKind || !sourceRecordId || !counterpartyEntitySnapshotId) {
        return failCommand(`第${index + 1}行必须选择匹配侧、来源记录和对方主体`, 400, "matching");
      }
      if (counterpartyEntitySnapshotId === entitySnapshotId) {
        return failCommand(`第${index + 1}行对方主体不能与本方主体相同`, 400, "counterpartyEntitySnapshotId");
      }
    }
    lines.push({
      entitySnapshotId,
      statementType: line.statementType,
      lineCode,
      accountCode: text(line.accountCode) || null,
      groupAccountId,
      debit,
      credit,
      currencyCode: (text(line.currencyCode) || "CNY").toUpperCase(),
      periodBasis,
      note: text(line.note) || null,
      matchSide,
      sourceKind,
      sourceRecordId,
      counterpartyEntitySnapshotId,
      counterpartyCompanyId,
    });
  }
  if (debitCents !== creditCents) return failCommand("抵销分录借贷不平衡", 400, "lines");
  const differenceResolution = text(raw.differenceResolution) || null;
  return okCommand({
    batchId,
    userId,
    input: {
      expectedRevision,
      entryId,
      entryNo,
      postingDate: postingDate ?? undefined,
      documentType,
      postingLevel,
      entryType: raw.entryType,
      title,
      description,
      evidence,
      differenceResolution,
      supersedesEntryId,
      reversalOfEntryId,
      lines,
    },
  });
}

export function validateConsolidationEntryWriteMode(
  batchStatus: string,
  existingStatus: ConsolidationEntryStatus | null,
): DomainValidationResult<{ mode: "create" | "updateDraft" }> {
  if (batchStatus !== "draft") return failCommand("只有草稿批次允许编制抵销分录", 409, "status");
  if (!existingStatus) return okCommand({ mode: "create" });
  if (existingStatus !== "draft") {
    return failCommand("已提交或批准的分录不能原地修改，请新建修订或冲销版本", 409, "status");
  }
  return okCommand({ mode: "updateDraft" });
}

export interface SaveConsolidationTaxEffectCommand {
  batchId: number;
  entryId: number;
  userId: number;
  input: SaveConsolidationTaxEffectInput;
}

export function buildSaveConsolidationTaxEffectCommand(
  batchIdValue: unknown,
  entryIdValue: unknown,
  raw: SaveConsolidationTaxEffectInput,
  userId: number,
): DomainValidationResult<SaveConsolidationTaxEffectCommand> {
  const batchId = positiveId(batchIdValue);
  const entryId = positiveId(entryIdValue);
  if (!batchId) return failCommand("合并批次ID无效", 400, "batchId");
  if (!entryId) return failCommand("抵销分录ID无效", 400, "entryId");
  if (!positiveId(userId)) return failCommand("当前用户无效", 401);
  const expectedRevision = positiveId(raw.expectedRevision);
  if (!expectedRevision) return failCommand("合并批次修订号无效", 400, "expectedRevision");
  const effectKey = text(raw.effectKey);
  if (!effectKey) return failCommand("税务影响标识不能为空", 400, "effectKey");
  if (raw.taxEffectType !== "deductible" && raw.taxEffectType !== "taxable") {
    return failCommand("暂时性差异类型无效", 400, "taxEffectType");
  }
  if (!Number.isFinite(raw.differenceAmount) || raw.differenceAmount === 0) {
    return failCommand("暂时性差异金额不能为0", 400, "differenceAmount");
  }
  if (!Number.isFinite(raw.taxRate) || raw.taxRate <= 0 || raw.taxRate > 1) {
    return failCommand("适用税率必须大于0且不超过1", 400, "taxRate");
  }
  if (!["asset", "liability", "unrecognized"].includes(raw.recognition)) {
    return failCommand("递延税项确认结论无效", 400, "recognition");
  }
  const entitySnapshotId = positiveId(raw.entitySnapshotId);
  if (!entitySnapshotId) return failCommand("税务影响必须指定批次内纳税主体", 400, "entitySnapshotId");
  const jurisdiction = text(raw.jurisdiction);
  if (!jurisdiction) return failCommand("税务影响必须填写适用税辖区", 400, "jurisdiction");
  const recognitionLocation = raw.recognitionLocation ?? null;
  const balanceSheetLineCode = text(raw.balanceSheetLineCode) || null;
  const counterpartLineCode = text(raw.counterpartLineCode) || null;
  if (raw.recognition === "asset" && raw.taxEffectType !== "deductible") {
    return failCommand("递延所得税资产必须来源于可抵扣暂时性差异", 400, "taxEffectType");
  }
  if (raw.recognition === "liability" && raw.taxEffectType !== "taxable") {
    return failCommand("递延所得税负债必须来源于应纳税暂时性差异", 400, "taxEffectType");
  }
  if (raw.recognition !== "unrecognized") {
    if (!recognitionLocation || !["profitOrLoss", "otherComprehensiveIncome", "equity"].includes(recognitionLocation)) {
      return failCommand("确认递延税项必须选择计入损益、其他综合收益或权益", 400, "recognitionLocation");
    }
    const expectedBalanceLine = raw.recognition === "asset" ? "deferredTaxAssets" : "deferredTaxLiabilities";
    if (balanceSheetLineCode !== expectedBalanceLine) {
      return failCommand(`确认结论必须落到 ${expectedBalanceLine} 规范行`, 400, "balanceSheetLineCode");
    }
    if (!counterpartLineCode) return failCommand("确认递延税项必须指定对应损益或权益报表行", 400, "counterpartLineCode");
    if (recognitionLocation === "profitOrLoss" && counterpartLineCode !== "incomeTax") {
      return failCommand("计入损益的递延税影响必须对应所得税费用行", 400, "counterpartLineCode");
    }
    if (recognitionLocation === "otherComprehensiveIncome" && counterpartLineCode !== "otherComprehensiveIncome") {
      return failCommand("计入其他综合收益的递延税影响必须对应其他综合收益行", 400, "counterpartLineCode");
    }
  } else if (recognitionLocation || balanceSheetLineCode || counterpartLineCode) {
    return failCommand("不确认递延税项时不能设置入表位置", 400, "recognition");
  }
  const recoverabilityConclusion = text(raw.recoverabilityConclusion);
  const evidence = text(raw.evidence);
  if (!recoverabilityConclusion) return failCommand("必须填写可抵扣性结论", 400, "recoverabilityConclusion");
  if (!evidence) return failCommand("税务影响必须填写依据", 400, "evidence");
  return okCommand({
    batchId,
    entryId,
    userId,
    input: {
      expectedRevision,
      entitySnapshotId,
      effectKey,
      taxEffectType: raw.taxEffectType,
      differenceAmount: moneyCents(raw.differenceAmount) / 100,
      taxRate: raw.taxRate,
      recognition: raw.recognition,
      periodBasis: raw.periodBasis === "comparative" ? "comparative" : "current",
      jurisdiction,
      recognitionLocation,
      balanceSheetLineCode,
      counterpartLineCode,
      reversalPeriod: text(raw.reversalPeriod) || null,
      recoverabilityConclusion,
      evidence,
    },
  });
}

export interface DeleteConsolidationEntryCommand {
  batchId: number;
  entryId: number;
  expectedRevision: number;
  note: string;
  userId: number;
}

export interface DeleteConsolidationTaxEffectCommand extends DeleteConsolidationEntryCommand {
  taxEffectId: number;
}

export function buildDeleteConsolidationEntryCommand(
  batchIdValue: unknown,
  entryIdValue: unknown,
  raw: DeleteConsolidationMutationInput,
  userId: number,
): DomainValidationResult<DeleteConsolidationEntryCommand> {
  const batchId = positiveId(batchIdValue);
  const entryId = positiveId(entryIdValue);
  const expectedRevision = positiveId(raw.expectedRevision);
  const note = text(raw.note);
  if (!batchId) return failCommand("合并批次ID无效", 400, "batchId");
  if (!entryId) return failCommand("抵销分录ID无效", 400, "entryId");
  if (!expectedRevision) return failCommand("合并批次修订号无效", 400, "expectedRevision");
  if (!note) return failCommand("删除必须填写原因", 400, "note");
  if (!positiveId(userId)) return failCommand("当前用户无效", 401);
  return okCommand({ batchId, entryId, expectedRevision, note, userId });
}

export function buildDeleteConsolidationTaxEffectCommand(
  batchIdValue: unknown,
  entryIdValue: unknown,
  taxEffectIdValue: unknown,
  raw: DeleteConsolidationMutationInput,
  userId: number,
): DomainValidationResult<DeleteConsolidationTaxEffectCommand> {
  const entryCommand = buildDeleteConsolidationEntryCommand(batchIdValue, entryIdValue, raw, userId);
  if (!entryCommand.ok) return entryCommand;
  const taxEffectId = positiveId(taxEffectIdValue);
  if (!taxEffectId) return failCommand("税务影响ID无效", 400, "taxEffectId");
  return okCommand({ ...entryCommand.data, taxEffectId });
}
