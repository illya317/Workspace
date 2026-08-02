import type { Prisma } from "@workspace/platform/server/prisma";

import { buildMaterializeAutomaticReclassAdjustmentsCommand } from "../validation";
import { loadFinanceGroupAccountMapByAccountIdsAtInTransaction } from "../group-accounts/resolve";
import { loadApplicableRulesByPeriod } from "../reclass-rules/applicability";
import {
  oppositeBalanceSide,
  resolveGroupReclassRule,
  type ResolvableReclassRule,
} from "../reclass-rules/resolution";
import {
  archiveBalanceReclassAdjustment,
  hasSameBalanceReclassResult,
  type BalanceReclassAdjustmentSnapshot,
} from "./history";
import { currentReverseBalanceAmount } from "./reverse-balance";

interface AutomaticPeriod {
  id: number;
  companyCode: string;
  year: number;
  endDate: string;
}

interface AutomaticBalance {
  periodId: number;
  closingDebit: number;
  closingCredit: number;
  account: {
    id: number;
    code: string;
    parentId: number | null;
    groupAccount: {
      id: number;
      code: string;
      balanceDirection: string;
      parentId: number | null;
    };
  };
}

export interface AutomaticAdjustmentPlan {
  policyVersionId: number;
  periodId: number;
  companyCode: string;
  year: number;
  sourceGroupAccountId: number;
  targetGroupAccountId: number | null;
  sourceAccountCode: string;
  targetAccountCode: string | null;
  amount: number;
  decision: "reclassify" | "no_reclass";
  basis: "account_net";
  ruleId: number;
}

export class AutomaticReclassConflictError extends Error {}

export function buildAutomaticRuleAdjustmentPlans(
  periods: readonly AutomaticPeriod[],
  balances: readonly AutomaticBalance[],
  rules: readonly ResolvableReclassRule[],
  groupAccountParents: ReadonlyMap<number, number | null> = new Map(),
) {
  const plans: AutomaticAdjustmentPlan[] = [];
  for (const period of periods) {
    const periodBalances = balances.filter((balance) => balance.periodId === period.id);
    const nodeById = new Map(periodBalances.map((balance) => [balance.account.id, balance]));
    const parentByLocalCode = new Map<string, AutomaticBalance | null>();
    const orderedBySpecificity = [...periodBalances].sort((left, right) => right.account.code.length - left.account.code.length);
    const parentByGroupAccountId = new Map(groupAccountParents);
    for (const balance of periodBalances) {
      if (!parentByGroupAccountId.has(balance.account.groupAccount.id)) {
        parentByGroupAccountId.set(balance.account.groupAccount.id, balance.account.groupAccount.parentId);
      }
      const explicitParent = balance.account.parentId === null ? null : nodeById.get(balance.account.parentId) ?? null;
      const prefixParent = explicitParent ?? orderedBySpecificity.find((candidate) => (
        candidate.account.code !== balance.account.code
        && balance.account.code.startsWith(candidate.account.code)
      )) ?? null;
      parentByLocalCode.set(balance.account.code, prefixParent);
    }

    const resolvedByCode = new Map(periodBalances.map((balance) => {
      const abnormalSide = oppositeBalanceSide(balance.account.groupAccount.balanceDirection);
      const rule = resolveGroupReclassRule(
        balance.account.groupAccount.id,
        abnormalSide,
        rules,
        parentByGroupAccountId,
      );
      return [balance.account.code, rule] as const;
    }));
    const boundaryCodes = new Set(periodBalances.filter((balance) => {
      const parent = parentByLocalCode.get(balance.account.code) ?? null;
      return ruleOutcomeKey(resolvedByCode.get(balance.account.code))
        !== ruleOutcomeKey(parent ? resolvedByCode.get(parent.account.code) : undefined);
    }).map((balance) => balance.account.code));

    const boundaryChildren = new Map<string, AutomaticBalance[]>();
    for (const balance of periodBalances) {
      if (!boundaryCodes.has(balance.account.code)) continue;
      let ancestor = parentByLocalCode.get(balance.account.code) ?? null;
      while (ancestor && !boundaryCodes.has(ancestor.account.code)) {
        ancestor = parentByLocalCode.get(ancestor.account.code) ?? null;
      }
      if (!ancestor) continue;
      const children = boundaryChildren.get(ancestor.account.code) ?? [];
      children.push(balance);
      boundaryChildren.set(ancestor.account.code, children);
    }

    for (const balance of periodBalances) {
      if (!boundaryCodes.has(balance.account.code)) continue;
      const rule = resolvedByCode.get(balance.account.code);
      if (!rule || (rule.decision !== "reclassify" && rule.decision !== "no_reclass")) continue;
      if (rule.decision === "reclassify" && !rule.targetAccountCode) continue;
      const childNet = (boundaryChildren.get(balance.account.code) ?? [])
        .reduce((sum, child) => sum + signedClosingBalance(child), 0);
      const groupNet = roundMoney(signedClosingBalance(balance) - childNet);
      const amount = reverseAmountFromSignedNet(groupNet, balance.account.groupAccount.balanceDirection);
      if (amount === null) continue;
      plans.push({
        policyVersionId: rule.policyVersionId,
        periodId: balance.periodId,
        companyCode: period.companyCode,
        year: period.year,
        sourceGroupAccountId: balance.account.groupAccount.id,
        targetGroupAccountId: rule.decision === "reclassify" ? rule.targetGroupAccountId : null,
        sourceAccountCode: balance.account.code,
        targetAccountCode: rule.decision === "reclassify" ? rule.targetAccountCode : null,
        amount,
        decision: rule.decision,
        basis: "account_net",
        ruleId: rule.id,
      });
    }
  }
  return plans;
}

function ruleOutcomeKey(rule: ResolvableReclassRule | undefined) {
  if (!rule || (rule.decision !== "reclassify" && rule.decision !== "no_reclass")) return "";
  return `${rule.decision}::${rule.targetGroupAccountId ?? ""}::${rule.targetAccountCode ?? ""}`;
}

function signedClosingBalance(balance: AutomaticBalance) {
  return roundMoney(balance.closingDebit - balance.closingCredit);
}

function reverseAmountFromSignedNet(net: number, balanceDirection: string) {
  return currentReverseBalanceAmount({
    closingDebit: net > 0 ? net : 0,
    closingCredit: net < 0 ? -net : 0,
    account: { balanceDirection },
  });
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export async function materializeAutomaticRuleAdjustments(
  tx: Prisma.TransactionClient,
  input: {
    periodIds?: readonly number[];
    policyVersionId?: number;
    sourceGroupAccountIds?: readonly number[];
    actorUserId?: number | null;
  } = {},
) {
  const command = buildMaterializeAutomaticReclassAdjustmentsCommand(input);
  if (!command.ok) throw new Error(command.issue.message);
  let periods = await tx.financePeriod.findMany({
    where: command.data.periodIds.length > 0 ? { id: { in: command.data.periodIds } } : {},
    select: { id: true, companyCode: true, year: true, endDate: true },
  });
  if (command.data.policyVersionId !== undefined) {
    const version = await tx.financeAccountingPolicyVersion.findUnique({
      where: { id: command.data.policyVersionId },
    });
    if (!version) throw new Error("会计政策版本不存在");
    periods = periods.filter((period) => dateFallsInVersion(period.endDate, version));
  }
  const periodIds = periods.map((period) => period.id);
  const existingWhere = {
    ...(periodIds.length > 0 ? { periodId: { in: periodIds } } : {}),
    ...(command.data.policyVersionId ? { policyVersionId: command.data.policyVersionId } : {}),
    ...(command.data.sourceGroupAccountIds.length > 0
      ? { sourceGroupAccountId: { in: command.data.sourceGroupAccountIds } }
      : {}),
  };
  const [rules, rawBalances, existing] = await Promise.all([
    tx.financeReclassRule.findMany({
      where: {
        enabled: true,
        source: "manual",
        confirmedBy: { not: null },
        confirmedAt: { not: null },
        ...(command.data.policyVersionId ? { policyVersionId: command.data.policyVersionId } : {}),
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
    tx.financeAccountBalance.findMany({
      where: { periodId: { in: periodIds } },
      select: {
        periodId: true,
        closingDebit: true,
        closingCredit: true,
        account: { select: { id: true, code: true, parentId: true } },
      },
    }),
    tx.financeBalanceReclassAdjustment.findMany({
      where: existingWhere,
      select: adjustmentSnapshotSelect,
    }),
  ]);
  const applicableRulesByPeriod = command.data.policyVersionId === undefined
    ? await loadApplicableRulesByPeriod(tx, periods, rules)
    : new Map(periods.map((period) => [period.id, rules]));
  const rawBalancesByPeriod = new Map<number, typeof rawBalances>();
  for (const balance of rawBalances) {
    const periodBalances = rawBalancesByPeriod.get(balance.periodId) ?? [];
    periodBalances.push(balance);
    rawBalancesByPeriod.set(balance.periodId, periodBalances);
  }
  const balancesByPeriod = new Map<number, AutomaticBalance[]>();
  const policyVersionIdByPeriod = new Map<number, number>();
  const oneVersionGroupMap = command.data.policyVersionId !== undefined && periods.length > 0
    ? await loadFinanceGroupAccountMapByAccountIdsAtInTransaction(
        tx,
        [...new Set(rawBalances.map((balance) => balance.account.id))],
        periods[0]!.endDate,
      )
    : null;
  for (const period of periods) {
    const periodBalances = rawBalancesByPeriod.get(period.id) ?? [];
    const groupMap = oneVersionGroupMap ?? await loadFinanceGroupAccountMapByAccountIdsAtInTransaction(
      tx,
      periodBalances.map((balance) => balance.account.id),
      period.endDate,
    );
    if (groupMap.mappings.size !== periodBalances.length) {
      throw new Error(`${period.companyCode} ${period.year} 年存在未映射到集团科目的余额科目`);
    }
    policyVersionIdByPeriod.set(period.id, groupMap.policyVersion.id);
    balancesByPeriod.set(period.id, periodBalances.flatMap<AutomaticBalance>((balance) => {
      const groupAccount = groupMap.mappings.get(balance.account.id);
      if (!groupAccount) return [];
      return [{ ...balance, account: { ...balance.account, groupAccount } }];
    }));
  }
  const hierarchyRows = await tx.financeGroupAccountRevision.findMany({
    where: {
      policyVersionId: { in: [...new Set(policyVersionIdByPeriod.values())] },
      isActive: true,
    },
    select: { policyVersionId: true, groupAccountId: true, parentGroupAccountId: true },
  });
  const hierarchyByPolicyVersionId = new Map<number, Map<number, number | null>>();
  for (const row of hierarchyRows) {
    const hierarchy = hierarchyByPolicyVersionId.get(row.policyVersionId) ?? new Map<number, number | null>();
    hierarchy.set(row.groupAccountId, row.parentGroupAccountId);
    hierarchyByPolicyVersionId.set(row.policyVersionId, hierarchy);
  }
  const plans = periods.flatMap((period) => buildAutomaticRuleAdjustmentPlans(
    [period],
    balancesByPeriod.get(period.id) ?? [],
    applicableRulesByPeriod.get(period.id) ?? [],
    hierarchyByPolicyVersionId.get(policyVersionIdByPeriod.get(period.id) ?? -1),
  )).filter((plan) => command.data.sourceGroupAccountIds.length === 0
    || command.data.sourceGroupAccountIds.includes(plan.sourceGroupAccountId));
  const planByKey = new Map(plans.map((plan) => [`${plan.periodId}::${plan.sourceAccountCode}`, plan]));

  let written = 0;
  let updated = 0;
  let deleted = 0;
  let skippedProtected = 0;
  for (const row of existing) {
    const snapshot = numericSnapshot(row);
    const key = `${row.periodId}::${row.sourceAccountCode}`;
    const plan = planByKey.get(key);
    if (!isReplaceableAutomaticSource(row.sourceType)) {
      skippedProtected += 1;
      planByKey.delete(key);
      continue;
    }
    if (!plan) {
      await archiveBalanceReclassAdjustment(tx, snapshot, "automatic_rule_removed", command.data.actorUserId);
      await tx.financeBalanceReclassAdjustment.delete({ where: { id: row.id } });
      deleted += 1;
      continue;
    }
    const next = automaticData(plan);
    if (!hasSameBalanceReclassResult(snapshot, next)) {
      await archiveBalanceReclassAdjustment(tx, snapshot, "automatic_rule_recomputed", command.data.actorUserId);
      await tx.financeBalanceReclassAdjustment.update({ where: { id: row.id }, data: next });
      updated += 1;
    }
    planByKey.delete(key);
  }

  for (const plan of planByKey.values()) {
    await tx.financeBalanceReclassAdjustment.create({ data: {
      periodId: plan.periodId,
      companyCode: plan.companyCode,
      year: plan.year,
      sourceAccountCode: plan.sourceAccountCode,
      ...automaticData(plan),
    } });
    written += 1;
  }
  return { written, updated, deleted, skippedProtected };
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

function numericSnapshot(row: Omit<BalanceReclassAdjustmentSnapshot, "amount"> & { amount: number | string | { toString(): string } }) {
  return { ...row, amount: Number(row.amount) };
}

function automaticData(plan: AutomaticAdjustmentPlan) {
  return {
    policyVersionId: plan.policyVersionId,
    sourceGroupAccountId: plan.sourceGroupAccountId,
    targetGroupAccountId: plan.targetGroupAccountId,
    targetAccountCode: plan.targetAccountCode,
    amount: plan.amount,
    decision: plan.decision,
    basis: plan.basis,
    sourceType: "automatic_rule",
    ruleId: plan.ruleId,
    status: "approved",
    note: JSON.stringify({ basis: "automatic_rule", policyVersionId: plan.policyVersionId }),
    adjustedBy: null,
    adjustedAt: null,
  };
}

function isReplaceableAutomaticSource(sourceType: string) {
  return sourceType === "automatic_rule" || sourceType === "balance_residual";
}

function dateFallsInVersion(
  date: string,
  version: { effectiveFrom: Date | null; effectiveTo: Date | null },
) {
  const day = date.slice(0, 10);
  return (!version.effectiveFrom || day >= version.effectiveFrom.toISOString().slice(0, 10))
    && (!version.effectiveTo || day < version.effectiveTo.toISOString().slice(0, 10));
}
