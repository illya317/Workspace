import {
  failCommand,
  okCommand,
  type DomainValidationResult,
} from "@workspace/platform/server/domain-validation";
import {
  buildFinanceIdCommand,
  buildFinancePeriodScopeCommand,
  finiteNumber,
  positiveId,
  requiredText,
  validMonth,
  validYear,
  type FinanceIdCommand,
  type FinancePeriodScopeCommand,
} from "../domain/shared-validation";

const RECLASS_ACTIONS = new Set(["approve", "adjust", "revert", "mark_pending"]);
const RECLASS_SIDES = new Set(["debit", "credit", "both"]);
const RECLASS_BASES = new Set(["account_net", "counterparty_gross"]);

export function buildSideBalanceAddCommand(code: unknown, debit: unknown, credit: unknown) {
  const accountCode = requiredText(code, "accountCode");
  if (!accountCode.ok) return accountCode;
  const debitValue = finiteNumber(debit, "debit");
  if (!debitValue.ok) return debitValue;
  const creditValue = finiteNumber(credit, "credit");
  if (!creditValue.ok) return creditValue;
  return okCommand({ code: accountCode.data, debit: debitValue.data, credit: creditValue.data });
}

export function buildFinanceAccountCreateCommand<T extends { code: string; name: string; category: string }>(
  input: T,
  userId: unknown,
): DomainValidationResult<{ input: T; userId: number }> {
  for (const field of ["code", "name", "category"] as const) {
    const value = requiredText(input[field], field);
    if (!value.ok) return value;
  }
  const editor = positiveId(userId, "userId");
  if (!editor.ok) return editor;
  return okCommand({ input, userId: editor.data });
}

export function buildFinanceAccountUpdateCommand<T>(
  id: unknown,
  input: T,
  userId: unknown,
): DomainValidationResult<{ id: number; input: T; userId: number }> {
  const accountId = positiveId(id);
  if (!accountId.ok) return accountId;
  const editor = positiveId(userId, "userId");
  if (!editor.ok) return editor;
  return okCommand({ id: accountId.data, input, userId: editor.data });
}

export function buildBalanceSnapshotCommand<T>(
  input: T,
  accountCodeToId?: Map<string, number>,
): DomainValidationResult<{ input: T; accountCodeToId?: Map<string, number> }> {
  if (accountCodeToId && !(accountCodeToId instanceof Map)) return failCommand("accountCodeToId must be a Map", 400);
  return okCommand({ input, accountCodeToId });
}

export function buildBalanceComputeCommand(periodId: unknown): DomainValidationResult<FinanceIdCommand> {
  return buildFinanceIdCommand(periodId, "periodId");
}

export function buildBalanceRangeCommand(input: {
  companyCode: unknown;
  year: unknown;
  monthStart: unknown;
  monthEnd: unknown;
}): DomainValidationResult<{ companyCode: string; year: number; monthStart: number; monthEnd: number }> {
  const scope = buildFinancePeriodScopeCommand({ companyCode: input.companyCode, year: input.year });
  if (!scope.ok) return scope;
  const monthStart = validMonth(input.monthStart, "monthStart");
  if (!monthStart.ok) return monthStart;
  const monthEnd = validMonth(input.monthEnd, "monthEnd");
  if (!monthEnd.ok) return monthEnd;
  if (monthStart.data > monthEnd.data) return failCommand("monthStart cannot be after monthEnd", 400);
  return okCommand({ ...scope.data, monthStart: monthStart.data, monthEnd: monthEnd.data });
}

export function buildFinancePeriodCreateCommand<T extends { year: number; month: number; companyCode?: string }>(
  input: T,
): DomainValidationResult<{ input: T & { year: number; month: number; companyCode: string } }> {
  const year = validYear(input.year);
  if (!year.ok) return year;
  const month = validMonth(input.month);
  if (!month.ok) return month;
  return okCommand({ input: { ...input, year: year.data, month: month.data, companyCode: input.companyCode || "" } });
}

export function buildFinancePeriodUpdateCommand<T>(
  id: unknown,
  input: T,
): DomainValidationResult<{ id: number; input: T }> {
  const periodId = positiveId(id);
  if (!periodId.ok) return periodId;
  return okCommand({ id: periodId.data, input });
}

export function buildReclassReviewCommand<T extends { id?: number; payload?: { action?: string }; userId?: number }>(
  params: T,
): DomainValidationResult<{ params: T }> {
  const id = positiveId(params.id, "id");
  if (!id.ok) return id;
  const userId = positiveId(params.userId, "userId");
  if (!userId.ok) return userId;
  if (!RECLASS_ACTIONS.has(String(params.payload?.action))) return failCommand("无效的审核动作", 400, "action");
  return okCommand({ params });
}

export function buildManualReclassCommand<T extends {
  periodId: number;
  voucherItemId: number;
  targetAccount: string;
  amount: number;
  userId: number;
}>(params: T): DomainValidationResult<{ params: T }> {
  for (const field of ["periodId", "voucherItemId", "userId"] as const) {
    const id = positiveId(params[field], field);
    if (!id.ok) return id;
  }
  const target = requiredText(params.targetAccount, "targetAccount");
  if (!target.ok) return target;
  const amount = finiteNumber(params.amount, "amount");
  if (!amount.ok) return amount;
  if (amount.data <= 0) return failCommand("金额必须大于 0", 400, "amount");
  return okCommand({ params: { ...params, targetAccount: target.data, amount: amount.data } });
}

export function buildReclassRuleScopeCommand(companyCode: unknown, year: unknown): DomainValidationResult<FinancePeriodScopeCommand> {
  return buildFinancePeriodScopeCommand({ companyCode, year });
}

export function buildMaterializeReclassAdjustmentsCommand(
  changedSourceGroupAccountIds: readonly number[],
): DomainValidationResult<{ sourceGroupAccountIds: number[] }> {
  if (!Array.isArray(changedSourceGroupAccountIds)) {
    return failCommand("sourceGroupAccountIds must be an array", 400, "sourceGroupAccountIds");
  }
  const sourceGroupAccountIds: number[] = [];
  for (const rawGroupAccountId of new Set(changedSourceGroupAccountIds)) {
    const groupAccountId = positiveId(rawGroupAccountId, "sourceGroupAccountId");
    if (!groupAccountId.ok) return groupAccountId;
    sourceGroupAccountIds.push(groupAccountId.data);
  }
  return okCommand({ sourceGroupAccountIds });
}

export type SaveReclassRuleChangeSetInput = {
  userId: number;
  policyVersionId: number;
  changes: Array<{
    sourceGroupAccountId: number;
    abnormalSide: "debit" | "credit" | "both";
    targetGroupAccountId: number | null;
    basis?: "account_net" | "counterparty_gross" | null;
  }>;
};

export function buildSaveReclassRuleChangeSetCommand(
  input: SaveReclassRuleChangeSetInput,
): DomainValidationResult<{ input: SaveReclassRuleChangeSetInput }> {
  const userId = positiveId(input.userId, "userId");
  if (!userId.ok) return userId;
  const policyVersionId = positiveId(input.policyVersionId, "policyVersionId");
  if (!policyVersionId.ok) return policyVersionId;
  if (!Array.isArray(input.changes) || input.changes.length === 0) {
    return failCommand("至少需要一项重分类规则变更", 400, "changes");
  }
  if (input.changes.length > 500) return failCommand("批量保存上限 500 项", 400, "changes");

  const seen = new Set<string>();
  const changes: SaveReclassRuleChangeSetInput["changes"] = [];
  for (const change of input.changes) {
    const source = positiveId(change.sourceGroupAccountId, "sourceGroupAccountId");
    if (!source.ok) return source;
    if (!RECLASS_SIDES.has(change.abnormalSide)) return failCommand("异常方向无效", 400, "abnormalSide");
    const target = change.targetGroupAccountId === null
      ? null
      : positiveId(change.targetGroupAccountId, "targetGroupAccountId");
    if (target !== null && !target.ok) return target;
    const targetGroupAccountId = target === null ? null : target.data;
    if (targetGroupAccountId === source.data) return failCommand("目标集团科目不能与源集团科目相同", 400, "targetGroupAccountId");
    if (change.basis !== undefined && change.basis !== null && !RECLASS_BASES.has(change.basis)) {
      return failCommand("计算口径无效", 400, "basis");
    }
    const basis = change.basis ?? null;
    const key = `${source.data}::${change.abnormalSide}`;
    if (seen.has(key)) return failCommand("同一版本、源集团科目和异常方向不能重复提交", 400, "changes");
    seen.add(key);
    changes.push({
      sourceGroupAccountId: source.data,
      abnormalSide: change.abnormalSide,
      targetGroupAccountId,
      basis,
    });
  }

  return okCommand({
    input: {
      userId: userId.data,
      policyVersionId: policyVersionId.data,
      changes,
    },
  });
}

export type SaveBalanceReclassAdjustmentChangeSetInput = {
  userId: number;
  changes: Array<{
    operation: "manual" | "restore_auto";
    periodId: number;
    sourceAccountCode: string;
    decision?: "reclassify" | "no_reclass";
    targetAccountCode?: string | null;
  }>;
};

export function buildSaveBalanceReclassAdjustmentChangeSetCommand(
  input: SaveBalanceReclassAdjustmentChangeSetInput,
): DomainValidationResult<{ input: SaveBalanceReclassAdjustmentChangeSetInput }> {
  const userId = positiveId(input.userId, "userId");
  if (!userId.ok) return userId;
  if (!Array.isArray(input.changes) || input.changes.length === 0) {
    return failCommand("至少需要一项重分类调整", 400, "changes");
  }
  if (input.changes.length > 500) return failCommand("批量保存上限 500 项", 400, "changes");
  const seen = new Set<string>();
  const changes: SaveBalanceReclassAdjustmentChangeSetInput["changes"] = [];
  for (const change of input.changes) {
    const periodId = positiveId(change.periodId, "periodId");
    if (!periodId.ok) return periodId;
    const source = requiredText(change.sourceAccountCode, "sourceAccountCode");
    if (!source.ok) return source;
    if (change.operation !== "manual" && change.operation !== "restore_auto") {
      return failCommand("无效的重分类调整操作", 400, "operation");
    }
    const key = `${periodId.data}::${source.data}`;
    if (seen.has(key)) return failCommand("同一期间和源科目不能重复提交", 400, "changes");
    seen.add(key);
    if (change.operation === "restore_auto") {
      changes.push({ operation: "restore_auto", periodId: periodId.data, sourceAccountCode: source.data });
      continue;
    }
    if (change.decision !== "reclassify" && change.decision !== "no_reclass") {
      return failCommand("人工分类必须明确重分类或无需处理", 400, "decision");
    }
    if (change.decision === "no_reclass") {
      if (change.targetAccountCode != null && change.targetAccountCode.trim()) {
        return failCommand("无需处理时不能设置目标科目", 400, "targetAccountCode");
      }
      changes.push({
        operation: "manual",
        periodId: periodId.data,
        sourceAccountCode: source.data,
        decision: "no_reclass",
        targetAccountCode: null,
      });
      continue;
    }
    const target = requiredText(change.targetAccountCode, "targetAccountCode");
    if (!target.ok) return target;
    if (source.data === target.data) return failCommand("目标科目不能与源科目相同", 400, "targetAccountCode");
    changes.push({
      operation: "manual",
      periodId: periodId.data,
      sourceAccountCode: source.data,
      decision: "reclassify",
      targetAccountCode: target.data,
    });
  }
  return okCommand({ input: { userId: userId.data, changes } });
}

export function buildMaterializeAutomaticReclassAdjustmentsCommand(input: {
  periodIds?: readonly number[];
  policyVersionId?: number;
  sourceGroupAccountIds?: readonly number[];
  actorUserId?: number | null;
}): DomainValidationResult<{
  periodIds: number[];
  policyVersionId?: number;
  sourceGroupAccountIds: number[];
  actorUserId: number | null;
}> {
  const periodIds: number[] = [];
  for (const rawPeriodId of input.periodIds ?? []) {
    const periodId = positiveId(rawPeriodId, "periodId");
    if (!periodId.ok) return periodId;
    periodIds.push(periodId.data);
  }
  let policyVersionId: number | undefined;
  if (input.policyVersionId !== undefined) {
    const versionId = positiveId(input.policyVersionId, "policyVersionId");
    if (!versionId.ok) return versionId;
    policyVersionId = versionId.data;
  }
  const sourceGroupAccountIds: number[] = [];
  for (const rawGroupAccountId of input.sourceGroupAccountIds ?? []) {
    const groupAccountId = positiveId(rawGroupAccountId, "sourceGroupAccountId");
    if (!groupAccountId.ok) return groupAccountId;
    sourceGroupAccountIds.push(groupAccountId.data);
  }
  let actorUserId: number | null = null;
  if (input.actorUserId !== undefined && input.actorUserId !== null) {
    const actor = positiveId(input.actorUserId, "actorUserId");
    if (!actor.ok) return actor;
    actorUserId = actor.data;
  }
  return okCommand({
    periodIds: [...new Set(periodIds)],
    policyVersionId,
    sourceGroupAccountIds: [...new Set(sourceGroupAccountIds)],
    actorUserId,
  });
}

export function buildArchiveBalanceReclassAdjustmentCommand(input: {
  adjustmentId: number;
  periodId: number;
  archiveReason: string;
  archivedBy?: number | null;
}): DomainValidationResult<{
  adjustmentId: number;
  periodId: number;
  archiveReason: string;
  archivedBy: number | null;
}> {
  const adjustmentId = positiveId(input.adjustmentId, "adjustmentIdSnapshot");
  if (!adjustmentId.ok) return adjustmentId;
  const periodId = positiveId(input.periodId, "periodId");
  if (!periodId.ok) return periodId;
  const archiveReason = requiredText(input.archiveReason, "archiveReason");
  if (!archiveReason.ok) return archiveReason;
  let archivedBy: number | null = null;
  if (input.archivedBy !== undefined && input.archivedBy !== null) {
    const actor = positiveId(input.archivedBy, "archivedBy");
    if (!actor.ok) return actor;
    archivedBy = actor.data;
  }
  return okCommand({
    adjustmentId: adjustmentId.data,
    periodId: periodId.data,
    archiveReason: archiveReason.data,
    archivedBy,
  });
}

export function buildReclassBuildCommand(periodId: unknown): DomainValidationResult<FinanceIdCommand> {
  return buildFinanceIdCommand(periodId, "periodId");
}

export function buildVoucherWriteCommand(body: Record<string, unknown>, editorId: unknown): DomainValidationResult<{ body: Record<string, unknown>; editorId: number }> {
  const editor = positiveId(editorId, "editorId");
  if (!editor.ok) return editor;
  if (!body || typeof body !== "object" || Array.isArray(body)) return failCommand("请求体必须为对象", 400);
  return okCommand({ body, editorId: editor.data });
}

export function buildVoucherUpdateCommand(voucherId: unknown, body: Record<string, unknown>, editorId: unknown) {
  const id = positiveId(voucherId, "voucherId");
  if (!id.ok) return id;
  const write = buildVoucherWriteCommand(body, editorId);
  if (!write.ok) return write;
  return okCommand({ voucherId: id.data, body: write.data.body, editorId: write.data.editorId });
}
