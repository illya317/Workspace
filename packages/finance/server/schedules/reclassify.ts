import { prisma } from "@workspace/platform/server/prisma";

export type ReclassClassification =
  | "reclass_candidate"
  | "pending_review"
  | "allowed_negative"
  | "contra_account"
  | "non_balance_sheet_negative"
  | "legacy_voucher_adjustment";

export type ReclassWorkbenchStatus =
  | "pending"
  | "configured"
  | "approved"
  | "adjusted"
  | "rejected"
  | "exempt";

export interface ReclassEntry {
  id: string;
  periodId: number;
  accountCode: string;
  accountName: string;
  balanceSide: "debit" | "credit";
  naturalSide: "debit" | "credit";
  closingDebit: number;
  closingCredit: number;
  amount: number;
  classification: ReclassClassification;
  status: ReclassWorkbenchStatus;
  targetAccountCode: string | null;
  targetAccountName: string | null;
  sourceType: string;
  detailCount: number;
  abnormalSide: "debit" | "credit";
  ruleId: number | null;
  adjustmentId: number | null;
  reason: string;
}

export interface ReclassWorkbenchSummary {
  total: number;
  attention: number;
  processed: number;
  exempt: number;
  attentionAmount: number;
  processedAmount: number;
}

interface BalanceInput {
  closingDebit: number;
  closingCredit: number;
  account: { id: number; code: string; name: string; balanceDirection: string; parentId: number | null };
}

interface AdjustmentInput {
  id: number;
  periodId: number;
  sourceAccountCode: string;
  targetAccountCode: string;
  amount: number;
  sourceType: string;
  status: string;
  note: string | null;
}

interface RuleInput {
  id: number;
  sourceAccountCode: string;
  abnormalSide: string;
  decision: string;
  targetAccountCode: string | null;
}

interface LegacyInput {
  sourceAccount: string;
  targetAccount: string;
  amount: number;
  status: string;
}

export async function computeReclassification(companyCode: string, year: number, month: number) {
  const period = await prisma.financePeriod.findFirst({ where: { companyCode, year, month } });
  if (!period) return { entries: [], summary: emptySummary() };

  const [balances, adjustments, rules, accounts, legacyRows] = await Promise.all([
    prisma.financeAccountBalance.findMany({ where: { periodId: period.id }, include: { account: true } }),
    prisma.financeBalanceReclassAdjustment.findMany({ where: { periodId: period.id } }),
    prisma.financeReclassRule.findMany({
      where: { enabled: true, source: "manual", confirmedBy: { not: null }, confirmedAt: { not: null } },
    }),
    prisma.financeAccount.findMany({ where: { companyCode, year }, select: { code: true, name: true } }),
    prisma.reclassResult.findMany({
      where: { periodId: period.id, status: { in: ["approved", "adjusted", "rejected"] } },
      select: { sourceAccount: true, targetAccount: true, amount: true, status: true },
    }),
  ]);
  const accountNames = new Map(accounts.map((account) => [account.code, account.name]));
  const entries = buildReclassificationWorkbench(balances, adjustments, rules, legacyRows, accountNames, period.id);
  return { entries, summary: summarize(entries) };
}

export function buildReclassificationWorkbench(
  balances: readonly BalanceInput[],
  adjustments: readonly AdjustmentInput[],
  rules: readonly RuleInput[],
  legacyRows: readonly LegacyInput[] = [],
  accountNames: ReadonlyMap<string, string> = new Map(),
  periodId = 0,
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
  const ruleMap = new Map(rules.map((rule) => [`${rule.sourceAccountCode}::${rule.abnormalSide}`, rule]));

  const entries = balances.flatMap((balance): ReclassEntry[] => {
    if (parentCodes.has(balance.account.code)) return [];
    const net = roundMoney(balance.closingDebit - balance.closingCredit);
    if (Math.abs(net) <= 0.01) return [];
    const naturalSide = balance.account.balanceDirection === "credit" ? "credit" : "debit";
    const balanceSide = net > 0 ? "debit" : "credit";
    if (balanceSide === naturalSide) return [];
    const adjustment = adjustmentMap.get(balance.account.code);
    const rule = ruleMap.get(`${balance.account.code}::${balanceSide}`) ?? ruleMap.get(`${balance.account.code}::both`);
    return [buildBalanceEntry(balance, balanceSide, naturalSide, Math.abs(net), adjustment, rule, accountNames, periodId)];
  });

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
      classification: "legacy_voucher_adjustment",
      status: normalizeStatus(row.status),
      targetAccountCode: row.targetAccount,
      targetAccountName: accountNames.get(row.targetAccount) ?? null,
      sourceType: "legacy_voucher",
      detailCount: 0,
      abnormalSide: "debit",
      ruleId: null,
      adjustmentId: null,
      reason: "历史凭证明细调整；当前继续参与报表，后续应迁移到期末余额口径。",
    });
  }
  return entries.sort((left, right) => statusOrder(left.status) - statusOrder(right.status) || right.amount - left.amount);
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
): ReclassEntry {
  const classification = classify(balance.account.code, balance.account.name, adjustment, rule);
  const targetAccountCode = adjustment?.targetAccountCode ?? (rule?.decision === "reclassify" ? rule.targetAccountCode : null);
  const status = adjustment
    ? normalizeStatus(adjustment.status)
    : rule?.decision === "no_reclass"
      ? "exempt"
      : rule?.decision === "reclassify"
        ? "configured"
        : isExempt(classification)
          ? "exempt"
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
    amount,
    classification,
    status,
    targetAccountCode,
    targetAccountName: targetAccountCode ? accountNames.get(targetAccountCode) ?? null : null,
    sourceType: adjustment?.sourceType ?? (rule ? "rule" : "closing_balance"),
    detailCount: readDetailCount(adjustment?.note),
    abnormalSide: balanceSide,
    ruleId: rule?.id ?? null,
    adjustmentId: adjustment?.id ?? null,
    reason: reasonFor(classification, status, adjustment?.sourceType, rule?.decision),
  };
}

function classify(code: string, name: string, adjustment?: AdjustmentInput, rule?: RuleInput): ReclassClassification {
  if (adjustment || rule?.decision === "reclassify") return "reclass_candidate";
  if (/坏账准备|累计折旧|累计摊销|跌价准备|减值准备/.test(name)) return "contra_account";
  if (/固定资产清理|未分配利润/.test(name)) return "allowed_negative";
  if (/^[56]/.test(code)) return "non_balance_sheet_negative";
  return "pending_review";
}

function reasonFor(classification: ReclassClassification, status: ReclassWorkbenchStatus, sourceType?: string, decision?: string) {
  if (status === "adjusted") return "已由财务人工调整，报表按调整后的目标科目和金额列示。";
  if (status === "approved" && sourceType === "auxiliary_balance") return "已按客户、供应商或个人的期末辅助余额自动重分类。";
  if (status === "rejected") return "已有审核结论：不采用该重分类调整。";
  if (decision === "no_reclass") return "已由财务人工确认无需重分类。";
  if (classification === "contra_account") return "资产抵减科目按净额列示，不作为普通负数重分类。";
  if (classification === "allowed_negative") return "该项目允许负数列示，不自动转列其他报表项目。";
  if (classification === "non_balance_sheet_negative") return "损益或成本类余额，不属于资产负债表普通重分类对象。";
  if (classification === "reclass_candidate") return "已人工设置重分类目标；需结合辅助对象期末余额确认最终金额。";
  return "非白名单反向余额，等待财务根据经济实质确认。";
}

function normalizeStatus(status: string): ReclassWorkbenchStatus {
  if (status === "adjusted" || status === "rejected") return status;
  return "approved";
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

function summarize(entries: readonly ReclassEntry[]): ReclassWorkbenchSummary {
  const attentionRows = entries.filter((row) => row.status === "pending" || row.status === "configured");
  const processedRows = entries.filter((row) => row.status === "approved" || row.status === "adjusted");
  return {
    total: entries.length,
    attention: attentionRows.length,
    processed: processedRows.length,
    exempt: entries.filter((row) => row.status === "exempt" || row.status === "rejected").length,
    attentionAmount: roundMoney(attentionRows.reduce((sum, row) => sum + row.amount, 0)),
    processedAmount: roundMoney(processedRows.reduce((sum, row) => sum + row.amount, 0)),
  };
}

function emptySummary(): ReclassWorkbenchSummary {
  return { total: 0, attention: 0, processed: 0, exempt: 0, attentionAmount: 0, processedAmount: 0 };
}

function statusOrder(status: ReclassWorkbenchStatus) {
  return status === "pending" ? 0 : status === "configured" ? 1 : status === "adjusted" ? 2 : status === "approved" ? 3 : 4;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
