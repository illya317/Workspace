import type {
  ReclassBasis,
  ReclassClassification,
  ReclassDecision,
  ReclassEntry,
  ReclassHistoricalMethod,
  ReclassWorkbenchStatus,
  ReclassWorkbenchSummary,
} from "@workspace/finance/types";

import {
  normalizeReclassBasis,
  oppositeBalanceSide,
  resolveGroupReclassRule,
} from "../ledger/reclass-rules/resolution";

export interface BalanceInput {
  closingDebit: number;
  closingCredit: number;
  account: {
    id: number;
    code: string;
    name: string;
    balanceDirection: string;
    parentId: number | null;
    groupAccount?: { id: number; code: string; name: string; balanceDirection: string; parentId: number | null };
  };
}

export interface AdjustmentInput {
  id: number;
  periodId: number;
  sourceAccountCode: string;
  targetAccountCode: string | null;
  amount: number;
  decision: string;
  basis: string;
  sourceType: string;
  status: string;
  note: string | null;
  ruleId?: number | null;
}

interface HistoryInput {
  id: number;
  periodId: number;
  sourceAccountCode: string;
  targetAccountCode: string | null;
  amount: number;
  decision: string;
  sourceType: string;
  status: string;
  note: string | null;
  ruleIdSnapshot?: number | null;
  archivedAt: Date | string;
  archiveReason: string;
}

export interface RuleInput {
  id: number;
  enabled?: boolean;
  policyVersionId?: number;
  sourceGroupAccountId?: number;
  targetGroupAccountId?: number | null;
  sourceAccountCode: string;
  abnormalSide: string;
  decision: string;
  targetAccountCode: string | null;
  basis?: string;
}

interface LegacyInput {
  sourceAccount: string;
  targetAccount: string;
  amount: number;
  status: string;
}

export function buildReclassificationWorkbench(
  balances: readonly BalanceInput[],
  adjustments: readonly AdjustmentInput[],
  rules: readonly RuleInput[],
  legacyRows: readonly LegacyInput[] = [],
  accountNames: ReadonlyMap<string, string> = new Map(),
  periodId = 0,
  accountDirections: ReadonlyMap<string, string> = new Map(),
  historyRows: readonly HistoryInput[] = [],
  auxiliaryGrossByAccountCode: ReadonlyMap<string, number | null> = new Map(),
  groupAccountParents: ReadonlyMap<number, number | null> = new Map(),
): ReclassEntry[] {
  const parentIds = new Set(balances.map((row) => row.account.parentId).filter((id): id is number => id !== null));
  const parentCodes = new Set<string>();
  for (const left of balances) {
    if (parentIds.has(left.account.id)) parentCodes.add(left.account.code);
    else if (balances.some((right) => right.account.code !== left.account.code && right.account.code.startsWith(left.account.code))) {
      parentCodes.add(left.account.code);
    }
  }
  const adjustmentMap = new Map(adjustments.map((row) => [row.sourceAccountCode, row]));
  const handledAdjustmentSources = new Set<string>();
  const balanceById = new Map(balances.map((row) => [row.account.id, row]));
  const balancesBySpecificity = [...balances].sort((left, right) => right.account.code.length - left.account.code.length);
  const parentByLocalCode = new Map(balances.map((balance) => {
    const explicitParent = balance.account.parentId === null ? null : balanceById.get(balance.account.parentId) ?? null;
    const prefixParent = explicitParent ?? balancesBySpecificity.find((candidate) => (
      candidate.account.code !== balance.account.code
      && balance.account.code.startsWith(candidate.account.code)
    )) ?? null;
    return [balance.account.code, prefixParent] as const;
  }));
  const parentByGroupAccountId = new Map(groupAccountParents);
  for (const balance of balances) {
    const groupAccount = balance.account.groupAccount;
    if (groupAccount && !parentByGroupAccountId.has(groupAccount.id)) {
      parentByGroupAccountId.set(groupAccount.id, groupAccount.parentId);
    }
  }

  const entries = balances.flatMap((balance): ReclassEntry[] => {
    if (parentCodes.has(balance.account.code)) return [];
    const net = roundMoney(balance.closingDebit - balance.closingCredit);
    if (net === 0) return [];
    const naturalSide = (balance.account.groupAccount?.balanceDirection ?? balance.account.balanceDirection) === "credit" ? "credit" : "debit";
    const balanceSide = net > 0 ? "debit" : "credit";
    if (balanceSide === naturalSide) return [];
    const adjustment = adjustmentMap.get(balance.account.code);
    if (adjustment) handledAdjustmentSources.add(balance.account.code);
    const rule = resolveWorkbenchRule(balance, balanceSide, rules, parentByGroupAccountId);
    if (!adjustment && isCoveredByAncestorAutomaticResult(balance, rule, parentByLocalCode, adjustmentMap)) return [];
    return [buildBalanceEntry(
      balance,
      balanceSide,
      naturalSide,
      Math.abs(net),
      adjustment,
      rule,
      accountNames,
      periodId,
      auxiliaryGrossByAccountCode,
    )];
  });

  const balanceMap = new Map(balances.map((row) => [row.account.code, row]));
  for (const adjustment of adjustments) {
    if (handledAdjustmentSources.has(adjustment.sourceAccountCode)) continue;
    const balance = balanceMap.get(adjustment.sourceAccountCode);
    const naturalSide = resolveNaturalSide(
      balance?.account.balanceDirection ?? accountDirections.get(adjustment.sourceAccountCode),
      adjustment.sourceAccountCode,
    );
    const basis = normalizeReclassBasis(adjustment.basis);
    const gross = basis === "counterparty_gross";
    const current = balance ? reverseBalanceAmount(balance) : null;
    const abnormalSide = oppositeBalanceSide(naturalSide);
    const grossCurrent = gross ? auxiliaryGrossByAccountCode.get(adjustment.sourceAccountCode) ?? null : null;
    const currentAbnormalAmount = gross ? grossCurrent : (current?.amount ?? (balance ? 0 : null));
    const stale = isStaleAdjustment(adjustment.amount, currentAbnormalAmount);
    const status = currentStatus(adjustment);
    entries.push({
      id: `balance:${adjustment.sourceAccountCode}`,
      periodId: adjustment.periodId || periodId,
      accountCode: adjustment.sourceAccountCode,
      accountName: balance?.account.name ?? accountNames.get(adjustment.sourceAccountCode) ?? adjustment.sourceAccountCode,
      balanceSide: current?.side ?? abnormalSide,
      naturalSide,
      closingDebit: balance?.closingDebit ?? 0,
      closingCredit: balance?.closingCredit ?? 0,
      amount: adjustment.amount,
      currentAbnormalAmount,
      stale,
      classification: "reclass_candidate",
      status,
      decision: normalizeDecision(adjustment.decision),
      historicalMethod: null,
      targetAccountCode: adjustment.targetAccountCode,
      targetAccountName: adjustment.targetAccountCode ? accountNames.get(adjustment.targetAccountCode) ?? null : null,
      sourceType: adjustment.sourceType,
      detailCount: readDetailCount(adjustment.note),
      abnormalSide,
      basis,
      ruleId: adjustment.ruleId ?? null,
      adjustmentId: adjustment.id,
      historyAt: null,
      archiveReason: null,
      reason: gross
        ? grossCurrent === null
          ? "当前结果按往来户逐户口径计算，但本期无辅助余额事实，请复核后人工修改。"
          : stale
            ? "当前结果金额与本期逐户毛额重算值不一致，请复核后人工修改。"
            : reasonFor(status, adjustment.sourceType, adjustment.decision)
        : current
          ? stale
            ? "当前结果金额与本期反向余额不一致，请复核后人工修改。"
            : reasonFor(status, adjustment.sourceType, adjustment.decision)
          : "已有当前结果，但源科目本期已无反向余额或余额事实缺失，请复核后人工修改。",
    });
  }

  for (const history of historyRows) {
    const historicalMethod = historyMethod(history.sourceType, history.decision);
    entries.push({
      id: `history:${history.id}`,
      periodId: history.periodId || periodId,
      accountCode: history.sourceAccountCode,
      accountName: accountNames.get(history.sourceAccountCode) ?? history.sourceAccountCode,
      balanceSide: resolveHistorySide(history.sourceAccountCode, accountDirections),
      naturalSide: resolveNaturalSide(accountDirections.get(history.sourceAccountCode), history.sourceAccountCode),
      closingDebit: 0,
      closingCredit: 0,
      amount: history.amount,
      currentAbnormalAmount: null,
      stale: false,
      classification: "reclass_candidate",
      status: "historical",
      decision: normalizeDecision(history.decision),
      historicalMethod,
      targetAccountCode: history.targetAccountCode,
      targetAccountName: history.targetAccountCode ? accountNames.get(history.targetAccountCode) ?? null : null,
      sourceType: history.sourceType,
      detailCount: readDetailCount(history.note),
      abnormalSide: resolveHistorySide(history.sourceAccountCode, accountDirections),
      basis: "account_net",
      ruleId: history.ruleIdSnapshot ?? null,
      adjustmentId: null,
      historyAt: toIsoString(history.archivedAt),
      archiveReason: history.archiveReason,
      reason: historicalReason(historicalMethod, history.decision),
    });
  }

  const legacyGroups = new Map<string, LegacyInput>();
  for (const row of legacyRows) {
    const key = `${row.sourceAccount}::${row.targetAccount}::${row.status}`;
    const current = legacyGroups.get(key);
    legacyGroups.set(key, { ...row, amount: roundMoney((current?.amount ?? 0) + row.amount) });
  }
  for (const row of legacyGroups.values()) {
    entries.push({
      id: `legacy:${row.sourceAccount}:${row.targetAccount}:${row.status}`,
      periodId,
      accountCode: row.sourceAccount,
      accountName: accountNames.get(row.sourceAccount) ?? row.sourceAccount,
      balanceSide: "debit",
      naturalSide: "credit",
      closingDebit: 0,
      closingCredit: 0,
      amount: row.amount,
      currentAbnormalAmount: null,
      stale: false,
      classification: "legacy_voucher_adjustment",
      status: "historical",
      decision: row.status === "rejected" ? "no_reclass" : "reclassify",
      historicalMethod: legacyMethod(row.status),
      targetAccountCode: row.targetAccount,
      targetAccountName: accountNames.get(row.targetAccount) ?? null,
      sourceType: "legacy_voucher",
      detailCount: 0,
      abnormalSide: "debit",
      basis: "account_net",
      ruleId: null,
      adjustmentId: null,
      historyAt: null,
      archiveReason: "legacy_voucher_record",
      reason: "旧版凭证明细重分类记录，仅供所选期间追溯；当前报表不再消费。",
    });
  }
  return entries.sort((left, right) => statusOrder(left.status) - statusOrder(right.status)
    || compareHistoryDate(left.historyAt, right.historyAt)
    || right.amount - left.amount);
}

function isCoveredByAncestorAutomaticResult(
  balance: BalanceInput,
  rule: RuleInput | undefined,
  parentByLocalCode: ReadonlyMap<string, BalanceInput | null>,
  adjustmentByLocalCode: ReadonlyMap<string, AdjustmentInput>,
) {
  if (!rule) return false;
  let ancestor = parentByLocalCode.get(balance.account.code) ?? null;
  while (ancestor) {
    const adjustment = adjustmentByLocalCode.get(ancestor.account.code);
    if (adjustment?.sourceType === "automatic_rule"
      && normalizeReclassBasis(adjustment.basis) === "account_net"
      && normalizeReclassBasis(rule.basis) === "account_net"
      && normalizeDecision(adjustment.decision) === normalizeDecision(rule.decision)
      && adjustment.targetAccountCode === (rule.decision === "reclassify" ? rule.targetAccountCode : null)) {
      return true;
    }
    ancestor = parentByLocalCode.get(ancestor.account.code) ?? null;
  }
  return false;
}

function buildBalanceEntry(
  balance: BalanceInput,
  balanceSide: "debit" | "credit",
  naturalSide: "debit" | "credit",
  amount: number,
  adjustment: AdjustmentInput | undefined,
  rule: RuleInput | undefined,
  accountNames: ReadonlyMap<string, string>,
  periodId: number,
  auxiliaryGrossByAccountCode: ReadonlyMap<string, number | null>,
): ReclassEntry {
  const basis: ReclassBasis = adjustment ? normalizeReclassBasis(adjustment.basis) : normalizeReclassBasis(rule?.basis);
  const gross = basis === "counterparty_gross";
  const grossCurrent = gross ? auxiliaryGrossByAccountCode.get(balance.account.code) ?? null : null;
  const currentAbnormalAmount = gross ? grossCurrent : amount;
  const classification = classify(balance.account.code, balance.account.name, adjustment, rule);
  const decision = adjustment ? normalizeDecision(adjustment.decision) : normalizeDecision(rule?.decision);
  const targetAccountCode = adjustment?.targetAccountCode ?? (rule?.decision === "reclassify" ? rule.targetAccountCode : null);
  const stale = adjustment ? isStaleAdjustment(adjustment.amount, currentAbnormalAmount) : false;
  const status = adjustment
    ? currentStatus(adjustment)
    : rule?.decision === "no_reclass" || isExempt(classification)
      ? "no_process"
      : "pending";
  return {
    id: `balance:${balance.account.code}`,
    periodId,
    accountCode: balance.account.code,
    accountName: balance.account.name,
    balanceSide,
    naturalSide,
    closingDebit: balance.closingDebit,
    closingCredit: balance.closingCredit,
    amount: adjustment?.amount ?? amount,
    currentAbnormalAmount,
    stale,
    classification,
    status,
    decision,
    historicalMethod: null,
    targetAccountCode,
    targetAccountName: targetAccountCode ? accountNames.get(targetAccountCode) ?? null : null,
    sourceType: adjustment?.sourceType ?? (rule ? "rule_unapplied" : "closing_balance"),
    detailCount: readDetailCount(adjustment?.note),
    abnormalSide: balanceSide,
    basis,
    ruleId: adjustment?.ruleId ?? rule?.id ?? null,
    adjustmentId: adjustment?.id ?? null,
    historyAt: null,
    archiveReason: null,
    reason: stale
      ? gross && grossCurrent === null
        ? "当前结果按往来户逐户口径计算，但本期无辅助余额事实，请复核后人工修改。"
        : gross
          ? "当前结果金额与本期逐户毛额重算值不一致，请复核后人工修改。"
          : "当前结果金额与本期反向余额不一致，请复核后人工修改。"
      : adjustment
        ? reasonFor(status, adjustment.sourceType, adjustment.decision)
        : rule?.decision === "reclassify"
          ? gross && grossCurrent === null
            ? "科目规则按往来户逐户口径计算，但本期无辅助余额事实；导入本期辅助余额后会自动应用。"
            : "科目规则已确认，但本期尚未生成当前结果；保存规则或重新导入本期余额后会自动应用。"
          : rule?.decision === "no_reclass"
            ? "科目规则已确认无需处理。"
            : reasonFor(status, "closing_balance", null, classification),
  };
}

function resolveWorkbenchRule(
  balance: BalanceInput,
  abnormalSide: "debit" | "credit",
  rules: readonly RuleInput[],
  parentByGroupAccountId: ReadonlyMap<number, number | null>,
) {
  const groupAccount = balance.account.groupAccount;
  const versionedRules = rules.filter((rule): rule is RuleInput & {
    policyVersionId: number;
    sourceGroupAccountId: number;
    targetGroupAccountId: number | null;
  } => rule.policyVersionId !== undefined && rule.sourceGroupAccountId !== undefined);
  if (groupAccount && versionedRules.length > 0) {
    return resolveGroupReclassRule(groupAccount.id, abnormalSide, versionedRules, parentByGroupAccountId);
  }
  return rules
    .filter((rule) => (rule.abnormalSide === abnormalSide || rule.abnormalSide === "both")
      && balance.account.code.startsWith(rule.sourceAccountCode))
    .sort((left, right) => right.sourceAccountCode.length - left.sourceAccountCode.length || right.id - left.id)[0];
}

function classify(code: string, name: string, adjustment?: AdjustmentInput, rule?: RuleInput): ReclassClassification {
  if (adjustment || rule) return "reclass_candidate";
  if (/坏账准备|累计折旧|累计摊销|跌价准备|减值准备/.test(name)) return "contra_account";
  if (/固定资产清理|未分配利润/.test(name)) return "allowed_negative";
  if (/^[56]/.test(code)) return "non_balance_sheet_negative";
  return "pending_review";
}

function reasonFor(
  status: ReclassWorkbenchStatus,
  sourceType?: string,
  decision?: string | null,
  classification?: ReclassClassification,
) {
  if (status === "manual") return decision === "no_reclass"
    ? "已由财务人工确认无需处理；后续规则或导入不会覆盖。"
    : "已由财务人工分类；后续规则或导入不会覆盖。";
  if (status === "automatic" && sourceType === "auxiliary_balance") return "已按客户、供应商或个人的期末辅助余额自动分类。";
  if (status === "automatic") return "已按确认的科目规则自动分类并应用到本期报表。";
  if (status === "no_process") {
    if (decision === "no_reclass") return "已按确认的科目规则自动判定为无需处理。";
    if (classification === "contra_account") return "资产抵减科目按净额列示，无需普通重分类。";
    if (classification === "allowed_negative") return "该项目允许负数列示，无需自动转列。";
    if (classification === "non_balance_sheet_negative") return "损益或成本类余额不属于资产负债表普通重分类对象。";
    return "当前事项无需处理。";
  }
  return "尚未配置可用科目规则，请先在科目规则中确认处理口径。";
}

function currentStatus(adjustment: AdjustmentInput): ReclassWorkbenchStatus {
  if (adjustment.sourceType === "manual") return "manual";
  return adjustment.decision === "no_reclass" ? "no_process" : "automatic";
}

function normalizeDecision(decision?: string | null): ReclassDecision | null {
  return decision === "reclassify" || decision === "no_reclass" ? decision : null;
}

function historyMethod(sourceType: string, decision: string): ReclassHistoricalMethod {
  if (sourceType === "manual") return "manual";
  return decision === "no_reclass" ? "no_process" : "automatic";
}

function legacyMethod(status: string): ReclassHistoricalMethod {
  if (status === "adjusted") return "manual";
  if (status === "rejected") return "no_process";
  return "legacy";
}

function historicalReason(method: ReclassHistoricalMethod, decision: string) {
  if (method === "manual") return decision === "no_reclass"
    ? "已被后续操作替代的人工无需处理结论。"
    : "已被后续操作替代的人工分类结果。";
  if (method === "no_process") return "已被后续操作替代的自动无需处理结论。";
  return "已被后续操作替代的自动分类结果。";
}

function isExempt(classification: ReclassClassification) {
  return classification === "allowed_negative" || classification === "contra_account" || classification === "non_balance_sheet_negative";
}

function readDetailCount(note?: string | null) {
  if (!note) return 0;
  try {
    const parsed = JSON.parse(note) as { details?: unknown[] };
    return Array.isArray(parsed.details) ? parsed.details.length : 0;
  } catch {
    return 0;
  }
}

export function summarizeReclassificationWorkbench(entries: readonly ReclassEntry[]): ReclassWorkbenchSummary {
  const current = entries.filter((row) => row.status !== "historical");
  return {
    total: current.length,
    automatic: current.filter((row) => row.status === "automatic").length,
    manual: current.filter((row) => row.status === "manual").length,
    noProcess: current.filter((row) => row.status === "no_process").length,
    pending: current.filter((row) => row.status === "pending").length,
    historical: entries.filter((row) => row.status === "historical").length,
    currentAmount: roundMoney(current.reduce((sum, row) => sum + row.amount, 0)),
  };
}


function statusOrder(status: ReclassWorkbenchStatus) {
  return status === "pending" ? 0
    : status === "manual" ? 1
      : status === "automatic" ? 2
        : status === "no_process" ? 3
          : 4;
}

function compareHistoryDate(left: string | null, right: string | null) {
  if (!left && !right) return 0;
  if (!left) return 1;
  if (!right) return -1;
  return right.localeCompare(left);
}

function resolveNaturalSide(balanceDirection: string | undefined, accountCode: string): "debit" | "credit" {
  if (balanceDirection === "credit") return "credit";
  if (balanceDirection === "debit") return "debit";
  return accountCode.startsWith("2") ? "credit" : "debit";
}

function resolveHistorySide(accountCode: string, accountDirections: ReadonlyMap<string, string>) {
  return oppositeBalanceSide(resolveNaturalSide(accountDirections.get(accountCode), accountCode));
}

function reverseBalanceAmount(balance: BalanceInput): { amount: number; side: "debit" | "credit" } | null {
  const net = roundMoney(balance.closingDebit - balance.closingCredit);
  if (net === 0) return null;
  const side = net > 0 ? "debit" : "credit";
  const naturalSide = resolveNaturalSide(
    balance.account.groupAccount?.balanceDirection ?? balance.account.balanceDirection,
    balance.account.code,
  );
  return side === naturalSide ? null : { amount: Math.abs(net), side };
}

export function isStaleAdjustment(persistedAmount: number, currentAbnormalAmount: number | null) {
  return currentAbnormalAmount === null || roundMoney(persistedAmount) !== roundMoney(currentAbnormalAmount);
}

function toIsoString(value: Date | string) {
  return typeof value === "string" ? value : value.toISOString();
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
