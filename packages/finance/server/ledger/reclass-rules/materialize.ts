import type { Prisma } from "@workspace/platform/server/prisma";

import { buildMaterializeReclassAdjustmentsCommand } from "../../domain/finance-validation";
import { oppositeBalanceSide, resolveLongestPrefixRule, type ResolvableReclassRule } from "./resolution";

type NumericValue = number | string | { toString(): string };

export interface StoredAuxiliaryBalance {
  periodId: number;
  closingDebit: NumericValue;
  closingCredit: NumericValue;
  account: { code: string; balanceDirection: string };
  members: Array<{
    member: { dimensionType: string; sourceCode: string; sourceName: string };
  }>;
}

export interface AuxiliaryAdjustmentPlan {
  periodId: number;
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

export function buildOpenAuxiliaryAdjustmentPlans(
  balances: readonly StoredAuxiliaryBalance[],
  rules: readonly ResolvableReclassRule[],
): AuxiliaryAdjustmentPlan[] {
  const plans = new Map<string, AuxiliaryAdjustmentPlan>();
  for (const balance of balances) {
    const net = roundMoney(Number(balance.closingDebit) - Number(balance.closingCredit));
    const side = net > 0 ? "debit" : net < 0 ? "credit" : null;
    if (!side || side !== oppositeBalanceSide(balance.account.balanceDirection)) continue;
    const rule = resolveLongestPrefixRule(balance.account.code, side, rules);
    if (!rule || rule.decision !== "reclassify" || !rule.targetAccountCode) continue;

    const amount = roundMoney(Math.abs(net));
    const key = `${balance.periodId}::${balance.account.code}`;
    const plan = plans.get(key) ?? {
      periodId: balance.periodId,
      sourceAccountCode: balance.account.code,
      targetAccountCode: rule.targetAccountCode,
      amount: 0,
      ruleId: rule.id,
      details: [],
    };
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

export async function materializeOpenAuxiliaryAdjustments(
  tx: Prisma.TransactionClient,
  changedSourcePrefixes: readonly string[],
) {
  const command = buildMaterializeReclassAdjustmentsCommand(changedSourcePrefixes);
  if (!command.ok) throw new Error(command.issue.message);
  const uniquePrefixes = command.data.sourcePrefixes;
  if (uniquePrefixes.length === 0) return { written: 0, updated: 0, deleted: 0, skippedProtected: 0 };

  const openPeriods = await tx.financePeriod.findMany({
    where: { isClosed: false },
    select: { id: true, companyCode: true, year: true },
  });
  const periodIds = openPeriods.map((period) => period.id);
  if (periodIds.length === 0) return { written: 0, updated: 0, deleted: 0, skippedProtected: 0 };
  const sourceFilters = uniquePrefixes.map((prefix) => ({ startsWith: prefix }));

  const [rules, balances, existing] = await Promise.all([
    tx.financeReclassRule.findMany({
      where: { enabled: true, source: "manual", confirmedBy: { not: null }, confirmedAt: { not: null } },
      select: { id: true, sourceAccountCode: true, abnormalSide: true, decision: true, targetAccountCode: true, enabled: true },
    }),
    tx.financeAuxiliaryBalance.findMany({
      where: {
        periodId: { in: periodIds },
        OR: uniquePrefixes.map((prefix) => ({ account: { code: { startsWith: prefix } } })),
      },
      select: {
        periodId: true,
        closingDebit: true,
        closingCredit: true,
        account: { select: { code: true, balanceDirection: true } },
        members: { select: { member: { select: { dimensionType: true, sourceCode: true, sourceName: true } } } },
      },
    }),
    tx.financeBalanceReclassAdjustment.findMany({
      where: {
        periodId: { in: periodIds },
        OR: sourceFilters.map((sourceAccountCode) => ({ sourceAccountCode })),
      },
      select: { id: true, periodId: true, sourceAccountCode: true, sourceType: true, status: true },
    }),
  ]);

  const planByKey = new Map(buildOpenAuxiliaryAdjustmentPlans(balances, rules)
    .map((plan) => [`${plan.periodId}::${plan.sourceAccountCode}`, plan]));
  const periodById = new Map(openPeriods.map((period) => [period.id, period]));
  const targetScopes = [...new Set([...planByKey.values()].map((plan) => {
    const period = periodById.get(plan.periodId);
    return period ? `${period.companyCode}::${period.year}::${plan.targetAccountCode}` : "";
  }).filter(Boolean))];
  const targetAccounts = targetScopes.length === 0 ? [] : await tx.financeAccount.findMany({
    where: {
      isActive: true,
      OR: targetScopes.map((scope) => {
        const [companyCode, rawYear, code] = scope.split("::");
        return { companyCode, year: Number(rawYear), code };
      }),
    },
    select: { companyCode: true, year: true, code: true },
  });
  const validTargetScopes = new Set(targetAccounts.map((account) => `${account.companyCode}::${account.year}::${account.code}`));
  const invalidTargets: string[] = [];
  for (const plan of planByKey.values()) {
    const period = periodById.get(plan.periodId);
    const targetScope = period ? `${period.companyCode}::${period.year}::${plan.targetAccountCode}` : "";
    if (!validTargetScopes.has(targetScope)) {
      invalidTargets.push(period
        ? `${period.companyCode}/${period.year}/${plan.targetAccountCode}`
        : `${plan.periodId}/${plan.targetAccountCode}`);
    }
  }
  if (invalidTargets.length > 0) {
    throw new ReclassMaterializationConflictError(
      `目标科目在待重算账套中不存在或已停用：${[...new Set(invalidTargets)].join("、")}`,
    );
  }
  const existingByKey = new Map(existing.map((row) => [`${row.periodId}::${row.sourceAccountCode}`, row]));
  let written = 0;
  let updated = 0;
  let deleted = 0;
  let skippedProtected = 0;

  for (const row of existing) {
    const key = `${row.periodId}::${row.sourceAccountCode}`;
    const plan = planByKey.get(key);
    if (row.sourceType !== "auxiliary_balance" || row.status !== "approved") {
      skippedProtected += 1;
      planByKey.delete(key);
      continue;
    }
    if (!plan) {
      await tx.financeBalanceReclassAdjustment.delete({ where: { id: row.id } });
      deleted += 1;
      continue;
    }
    await tx.financeBalanceReclassAdjustment.update({
      where: { id: row.id },
      data: {
        targetAccountCode: plan.targetAccountCode,
        amount: plan.amount,
        ruleId: plan.ruleId,
        note: JSON.stringify({ basis: "auxiliary_closing_balance", details: plan.details }),
      },
    });
    updated += 1;
    planByKey.delete(key);
  }

  for (const [key, plan] of planByKey) {
    if (existingByKey.has(key)) continue;
    const period = periodById.get(plan.periodId);
    if (!period) continue;
    await tx.financeBalanceReclassAdjustment.create({
      data: {
        periodId: plan.periodId,
        companyCode: period.companyCode,
        year: period.year,
        sourceAccountCode: plan.sourceAccountCode,
        targetAccountCode: plan.targetAccountCode,
        amount: plan.amount,
        ruleId: plan.ruleId,
        sourceType: "auxiliary_balance",
        status: "approved",
        note: JSON.stringify({ basis: "auxiliary_closing_balance", details: plan.details }),
      },
    });
    written += 1;
  }

  return { written, updated, deleted, skippedProtected };
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
