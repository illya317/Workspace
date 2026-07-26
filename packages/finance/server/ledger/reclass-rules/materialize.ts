import type { Prisma } from "@workspace/platform/server/prisma";

import { buildMaterializeReclassAdjustmentsCommand } from "../../domain/finance-validation";
import { archiveBalanceReclassAdjustment, hasSameBalanceReclassResult } from "../balance-reclass/history";
import { loadFinanceGroupAccountMapByAccountIdsAtInTransaction } from "../group-accounts/resolve";
import { loadApplicableRulesByPeriod } from "./applicability";
import { counterpartyGrossAbnormalAmount } from "./auxiliary-amount";
import {
  normalizeReclassBasis,
  oppositeBalanceSide,
  resolveGroupReclassRule,
  type ResolvableReclassRule,
} from "./resolution";

type NumericValue = number | string | { toString(): string };

export interface StoredAuxiliaryBalance {
  periodId: number;
  openingDebit?: NumericValue;
  openingCredit?: NumericValue;
  closingDebit: NumericValue;
  closingCredit: NumericValue;
  account: {
    id: number;
    code: string;
    groupAccount: { id: number; code: string; balanceDirection: string; parentId: number | null };
  };
  period?: { id: number; companyCode: string; year: number; month?: number; endDate: string };
  members: Array<{
    member: { dimensionType: string; sourceCode: string; sourceName: string };
  }>;
}

export interface AuxiliaryAdjustmentPlan {
  policyVersionId: number;
  periodId: number;
  sourceGroupAccountId: number;
  targetGroupAccountId: number | null;
  sourceAccountCode: string;
  targetAccountCode: string;
  amount: number;
  ruleId: number;
  details: Array<{
    dimensionType: string;
    dimensionCode: string;
    dimensionName: string;
    amount: number;
  }>;
}

export class ReclassMaterializationConflictError extends Error {}

export function buildAuxiliaryAdjustmentPlans(
  balances: readonly StoredAuxiliaryBalance[],
  rules: readonly ResolvableReclassRule[],
  groupAccountParents: ReadonlyMap<number, number | null> = new Map(),
): AuxiliaryAdjustmentPlan[] {
  const plans = new Map<string, AuxiliaryAdjustmentPlan>();
  const parentByGroupAccountId = new Map(groupAccountParents);
  for (const balance of balances) {
    if (!parentByGroupAccountId.has(balance.account.groupAccount.id)) {
      parentByGroupAccountId.set(balance.account.groupAccount.id, balance.account.groupAccount.parentId);
    }
  }
  for (const balance of balances) {
    const net = roundMoney(Number(balance.closingDebit) - Number(balance.closingCredit));
    const side = net > 0 ? "debit" : net < 0 ? "credit" : null;
    if (!side || side !== oppositeBalanceSide(balance.account.groupAccount.balanceDirection)) continue;
    const rule = resolveGroupReclassRule(
      balance.account.groupAccount.id,
      side,
      rules,
      parentByGroupAccountId,
    );
    if (!rule || rule.decision !== "reclassify" || !rule.targetAccountCode) continue;
    if (normalizeReclassBasis(rule.basis) !== "counterparty_gross") continue;

    const amount = counterpartyGrossAbnormalAmount([balance], balance.account.groupAccount.balanceDirection);
    const key = `${balance.periodId}::${balance.account.code}`;
    const plan = plans.get(key) ?? {
      policyVersionId: rule.policyVersionId,
      periodId: balance.periodId,
      sourceGroupAccountId: balance.account.groupAccount.id,
      targetGroupAccountId: rule.targetGroupAccountId,
      sourceAccountCode: balance.account.code,
      targetAccountCode: rule.targetAccountCode,
      amount: 0,
      ruleId: rule.id,
      details: [],
    };
    plan.targetGroupAccountId = rule.targetGroupAccountId;
    plan.targetAccountCode = rule.targetAccountCode;
    plan.ruleId = rule.id;
    plan.amount = roundMoney(plan.amount + amount);
    const members = balance.members.map(({ member }) => member);
    plan.details.push({
      dimensionType: members.map((member) => member.dimensionType).join("+") || "unknown",
      dimensionCode: members.map((member) => member.sourceCode).join("+") || "unknown",
      dimensionName: members.map((member) => member.sourceName).join(" / ") || "未命名辅助对象",
      amount,
    });
    plans.set(key, plan);
  }
  return [...plans.values()];
}

export async function materializeAuxiliaryAdjustments(
  tx: Prisma.TransactionClient,
  policyVersionId: number,
  changedSourceGroupAccountIds: readonly number[],
  actorUserId?: number | null,
) {
  const command = buildMaterializeReclassAdjustmentsCommand(changedSourceGroupAccountIds);
  if (!command.ok) throw new Error(command.issue.message);
  const sourceGroupAccountIds = command.data.sourceGroupAccountIds;
  if (sourceGroupAccountIds.length === 0) return { written: 0, updated: 0, deleted: 0, skippedProtected: 0 };

  const mappingRows = await tx.financeGroupAccountMapping.findMany({
    where: { policyVersionId, groupAccountId: { in: sourceGroupAccountIds } },
    select: { companyCode: true, localAccountCode: true },
  });
  const accountScopes = [...new Set(mappingRows.map((mapping) => `${mapping.companyCode}\u001f${mapping.localAccountCode}`))];
  const [rules, rawBalances, existing] = await Promise.all([
    tx.financeReclassRule.findMany({
      where: {
        policyVersionId,
        enabled: true,
        source: "manual",
        confirmedBy: { not: null },
        confirmedAt: { not: null },
      },
      select: {
        id: true,
        policyVersionId: true,
        sourceGroupAccountId: true,
        targetGroupAccountId: true,
        sourceAccountCode: true,
        abnormalSide: true,
        decision: true,
        basis: true,
        targetAccountCode: true,
        enabled: true,
      },
    }),
    tx.financeAuxiliaryBalance.findMany({
      where: {
        OR: accountScopes.map((scope) => {
          const [companyCode, code] = scope.split("\u001f");
          return { period: { companyCode }, account: { code } };
        }),
      },
      select: {
        periodId: true,
        openingDebit: true,
        openingCredit: true,
        closingDebit: true,
        closingCredit: true,
        account: { select: { id: true, code: true } },
        period: { select: { id: true, companyCode: true, year: true, month: true, endDate: true } },
        members: { select: { member: { select: { dimensionType: true, sourceCode: true, sourceName: true } } } },
      },
    }),
    tx.financeBalanceReclassAdjustment.findMany({
      where: { policyVersionId, sourceGroupAccountId: { in: sourceGroupAccountIds } },
      select: adjustmentSnapshotSelect,
    }),
  ]);
  const balances: StoredAuxiliaryBalance[] = [];
  const rawByPeriod = new Map<number, typeof rawBalances>();
  for (const balance of rawBalances) {
    const rows = rawByPeriod.get(balance.periodId) ?? [];
    rows.push(balance);
    rawByPeriod.set(balance.periodId, rows);
  }
  for (const [periodId, periodBalances] of rawByPeriod) {
    const period = periodBalances[0]!.period;
    const groupMap = await loadFinanceGroupAccountMapByAccountIdsAtInTransaction(
      tx,
      periodBalances.map((balance) => balance.account.id),
      period.endDate,
    );
    if (groupMap.policyVersion.id !== policyVersionId) continue;
    for (const balance of periodBalances) {
      const groupAccount = groupMap.mappings.get(balance.account.id);
      if (!groupAccount || !sourceGroupAccountIds.includes(groupAccount.id)) continue;
      balances.push({ ...balance, periodId, account: { ...balance.account, groupAccount } });
    }
  }

  const januaryScopes = [...new Set(balances.flatMap((balance) => balance.period?.month === 1
    ? [`${balance.period.companyCode}::${balance.period.year - 1}`]
    : []))];
  const priorYearEndPeriods = januaryScopes.length === 0 ? [] : await tx.financePeriod.findMany({
    where: {
      month: 12,
      OR: januaryScopes.map((scope) => {
        const [companyCode, rawYear] = scope.split("::");
        return { companyCode, year: Number(rawYear) };
      }),
    },
    select: { id: true, companyCode: true, year: true, month: true, endDate: true },
  });
  const effectiveBalances = [
    ...balances,
    ...buildPriorYearEndAuxiliaryFallbacks(
      balances.filter((balance): balance is StoredAuxiliaryBalance & {
        period: { id: number; companyCode: string; year: number; month: number; endDate: string };
      } => typeof balance.period?.month === "number"),
      priorYearEndPeriods,
    ),
  ];
  const periods = [...new Map(effectiveBalances.flatMap((balance) => balance.period
    ? [[balance.period.id, balance.period] as const]
    : [])).values()];
  const hierarchyRows = await tx.financeGroupAccountRevision.findMany({
    where: { policyVersionId, isActive: true },
    select: { groupAccountId: true, parentGroupAccountId: true },
  });
  const groupAccountParents = new Map(hierarchyRows.map((row) => [
    row.groupAccountId,
    row.parentGroupAccountId,
  ]));
  const applicableRulesByPeriod = await loadApplicableRulesByPeriod(tx, periods, rules);
  const plans = periods.flatMap((period) => buildAuxiliaryAdjustmentPlans(
    effectiveBalances.filter((balance) => balance.periodId === period.id),
    applicableRulesByPeriod.get(period.id) ?? [],
    groupAccountParents,
  ));
  const planByKey = new Map(plans.map((plan) => [`${plan.periodId}::${plan.sourceAccountCode}`, plan]));
  const periodById = new Map(effectiveBalances.flatMap((balance) => balance.period
    ? [[balance.period.id, balance.period] as const]
    : []));
  const existingByKey = new Map(existing.map((row) => [`${row.periodId}::${row.sourceAccountCode}`, row]));
  let written = 0;
  let updated = 0;
  let deleted = 0;
  let skippedProtected = 0;

  for (const row of existing) {
    const key = `${row.periodId}::${row.sourceAccountCode}`;
    const plan = planByKey.get(key);
    if (isProtectedSource(row.sourceType, row.status)) {
      skippedProtected += 1;
      planByKey.delete(key);
      continue;
    }
    if (row.sourceType !== "auxiliary_balance") {
      if (!plan) continue;
      const next = auxiliaryData(plan);
      const snapshot = { ...row, amount: Number(row.amount) };
      if (!hasSameBalanceReclassResult(snapshot, next)) {
        await archiveBalanceReclassAdjustment(tx, snapshot, "auxiliary_balance_replaced_automatic", actorUserId);
        await tx.financeBalanceReclassAdjustment.update({ where: { id: row.id }, data: next });
        updated += 1;
      }
      planByKey.delete(key);
      continue;
    }
    if (!plan) {
      await archiveBalanceReclassAdjustment(tx, { ...row, amount: Number(row.amount) }, "auxiliary_balance_removed", actorUserId);
      await tx.financeBalanceReclassAdjustment.delete({ where: { id: row.id } });
      deleted += 1;
      continue;
    }
    const next = auxiliaryData(plan);
    const snapshot = { ...row, amount: Number(row.amount) };
    if (!hasSameBalanceReclassResult(snapshot, next)) {
      await archiveBalanceReclassAdjustment(tx, snapshot, "auxiliary_balance_recomputed", actorUserId);
      await tx.financeBalanceReclassAdjustment.update({ where: { id: row.id }, data: next });
      updated += 1;
    }
    planByKey.delete(key);
  }

  for (const [key, plan] of planByKey) {
    if (existingByKey.has(key)) continue;
    const period = periodById.get(plan.periodId);
    if (!period) continue;
    await tx.financeBalanceReclassAdjustment.create({
      data: {
        policyVersionId: plan.policyVersionId,
        sourceGroupAccountId: plan.sourceGroupAccountId,
        targetGroupAccountId: plan.targetGroupAccountId,
        periodId: plan.periodId,
        companyCode: period.companyCode,
        year: period.year,
        sourceAccountCode: plan.sourceAccountCode,
        targetAccountCode: plan.targetAccountCode,
        amount: plan.amount,
        decision: "reclassify",
        basis: "counterparty_gross",
        ruleId: plan.ruleId,
        sourceType: "auxiliary_balance",
        status: "approved",
        note: JSON.stringify({ basis: "auxiliary_closing_balance", policyVersionId, details: plan.details }),
      },
    });
    written += 1;
  }

  return { written, updated, deleted, skippedProtected };
}

export function buildPriorYearEndAuxiliaryFallbacks(
  balances: readonly (StoredAuxiliaryBalance & { period: { id: number; companyCode: string; year: number; month: number; endDate: string } })[],
  priorYearEndPeriods: readonly { id: number; companyCode: string; year: number; month: number; endDate: string }[],
): StoredAuxiliaryBalance[] {
  const priorPeriodByScope = new Map(priorYearEndPeriods.map((period) => [
    `${period.companyCode}::${period.year}`,
    period,
  ]));
  const existingPriorCodes = new Set(balances.map((balance) => `${balance.periodId}::${balance.account.code}`));
  return balances.flatMap((balance) => {
    if (balance.period.month !== 1 || balance.openingDebit === undefined || balance.openingCredit === undefined) return [];
    const prior = priorPeriodByScope.get(`${balance.period.companyCode}::${balance.period.year - 1}`);
    if (!prior || existingPriorCodes.has(`${prior.id}::${balance.account.code}`)) return [];
    return [{
      ...balance,
      periodId: prior.id,
      closingDebit: balance.openingDebit,
      closingCredit: balance.openingCredit,
      period: prior,
    }];
  });
}

const adjustmentSnapshotSelect = {
  id: true,
  policyVersionId: true,
  sourceGroupAccountId: true,
  targetGroupAccountId: true,
  periodId: true,
  companyCode: true,
  year: true,
  sourceAccountCode: true,
  targetAccountCode: true,
  amount: true,
  decision: true,
  sourceType: true,
  status: true,
  ruleId: true,
  adjustedBy: true,
  adjustedAt: true,
  note: true,
} as const;

function auxiliaryData(plan: AuxiliaryAdjustmentPlan) {
  return {
    policyVersionId: plan.policyVersionId,
    sourceGroupAccountId: plan.sourceGroupAccountId,
    targetGroupAccountId: plan.targetGroupAccountId,
    targetAccountCode: plan.targetAccountCode,
    amount: plan.amount,
    decision: "reclassify",
    basis: "counterparty_gross",
    ruleId: plan.ruleId,
    sourceType: "auxiliary_balance",
    status: "approved",
    note: JSON.stringify({ basis: "auxiliary_closing_balance", policyVersionId: plan.policyVersionId, details: plan.details }),
    adjustedBy: null,
    adjustedAt: null,
  };
}

function isProtectedSource(sourceType: string, status: string) {
  return sourceType === "manual"
    || sourceType === "reference_workpaper"
    || status === "adjusted"
    || status === "rejected";
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
