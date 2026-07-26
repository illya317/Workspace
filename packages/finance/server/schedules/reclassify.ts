import { prisma } from "@workspace/platform/server/prisma";
import type { ReclassWorkbenchSummary } from "@workspace/finance/types";

import { loadFinanceGroupAccountMapByAccountIdsAt } from "../ledger/group-accounts/resolve";
import { loadApplicableRulesByPeriod } from "../ledger/reclass-rules/applicability";
import { counterpartyGrossAbnormalAmount } from "../ledger/reclass-rules/auxiliary-amount";
import {
  normalizeReclassBasis,
  oppositeBalanceSide,
  resolveGroupReclassRule,
} from "../ledger/reclass-rules/resolution";
import {
  buildReclassificationWorkbench,
  summarizeReclassificationWorkbench,
  type AdjustmentInput,
  type BalanceInput,
  type RuleInput,
} from "./reclassify-workbench";

export type {
  ReclassClassification,
  ReclassEntry,
  ReclassWorkbenchStatus,
  ReclassWorkbenchSummary,
} from "@workspace/finance/types";
export {
  buildReclassificationWorkbench,
  isStaleAdjustment,
  summarizeReclassificationWorkbench,
} from "./reclassify-workbench";

export async function computeReclassification(companyCode: string, year: number, month: number) {
  const period = await prisma.financePeriod.findFirst({ where: { companyCode, year, month } });
  if (!period) return { entries: [], summary: emptySummary(), isClosed: false, policyVersion: null, accountOptions: [] };

  const [balances, adjustments, historyRows, rules, accounts, legacyRows] = await Promise.all([
    prisma.financeAccountBalance.findMany({ where: { periodId: period.id }, include: { account: true } }),
    prisma.financeBalanceReclassAdjustment.findMany({ where: { periodId: period.id } }),
    prisma.financeBalanceReclassAdjustmentHistory.findMany({
      where: { periodId: period.id },
      orderBy: [{ archivedAt: "desc" }, { id: "desc" }],
    }),
    prisma.financeReclassRule.findMany({
      where: { enabled: true, source: "manual", confirmedBy: { not: null }, confirmedAt: { not: null } },
    }),
    prisma.financeAccount.findMany({ where: { companyCode, year }, select: { id: true, code: true, name: true, balanceDirection: true } }),
    prisma.reclassResult.findMany({
      where: { periodId: period.id, status: { in: ["pending", "approved", "adjusted", "rejected"] } },
      select: { sourceAccount: true, targetAccount: true, amount: true, status: true },
    }),
  ]);
  const groupMap = await loadFinanceGroupAccountMapByAccountIdsAt(
    balances.map((balance) => balance.account.id),
    period.endDate,
  );
  const versionRevisions = await prisma.financeGroupAccountRevision.findMany({
    where: { policyVersionId: groupMap.policyVersion.id, isActive: true },
    select: { groupAccountId: true, code: true, name: true, parentGroupAccountId: true },
    orderBy: { code: "asc" },
  });
  const groupAccountParents = new Map(versionRevisions.map((revision) => [
    revision.groupAccountId,
    revision.parentGroupAccountId,
  ]));
  const mappedBalances = balances.map((balance) => ({
    ...balance,
    account: {
      ...balance.account,
      groupAccount: groupMap.mappings.get(balance.account.id),
    },
  }));
  const applicableRules = await loadApplicableRulesByPeriod(
    prisma,
    [period],
    rules,
  );
  const auxiliaryGrossByAccountCode = await loadAuxiliaryGrossByAccountCode(
    period.id,
    mappedBalances,
    adjustments,
    applicableRules.get(period.id) ?? [],
    accounts,
    groupAccountParents,
  );
  const accountNames = new Map([
    ...accounts.map((account) => [account.code, account.name] as const),
    ...versionRevisions.map((account) => [account.code, account.name] as const),
  ]);
  const accountDirections = new Map(accounts.map((account) => [account.code, account.balanceDirection]));
  const entries = buildReclassificationWorkbench(
    mappedBalances,
    adjustments,
    applicableRules.get(period.id) ?? [],
    legacyRows,
    accountNames,
    period.id,
    accountDirections,
    historyRows,
    auxiliaryGrossByAccountCode,
    groupAccountParents,
  );
  const accountOptions = versionRevisions.map((revision) => ({
    id: revision.groupAccountId,
    code: revision.code,
    name: revision.name,
  }));
  return {
    entries,
    summary: summarizeReclassificationWorkbench(entries),
    isClosed: period.isClosed,
    policyVersion: groupMap.policyVersion,
    accountOptions,
  };
}

async function loadAuxiliaryGrossByAccountCode(
  periodId: number,
  mappedBalances: readonly BalanceInput[],
  adjustments: readonly AdjustmentInput[],
  rules: readonly RuleInput[],
  accounts: readonly { id: number; code: string; balanceDirection: string }[],
  groupAccountParents: ReadonlyMap<number, number | null>,
): Promise<ReadonlyMap<string, number | null>> {
  const parentByGroupAccountId = new Map(groupAccountParents);
  for (const balance of mappedBalances) {
    const groupAccount = balance.account.groupAccount;
    if (groupAccount && !parentByGroupAccountId.has(groupAccount.id)) {
      parentByGroupAccountId.set(groupAccount.id, groupAccount.parentId);
    }
  }
  const accountByCode = new Map(accounts.map((account) => [account.code, account]));
  const grossAccountIds = new Set<number>();
  const grossDirectionByCode = new Map<string, string>();
  for (const adjustment of adjustments) {
    if (normalizeReclassBasis(adjustment.basis) !== "counterparty_gross") continue;
    const account = accountByCode.get(adjustment.sourceAccountCode);
    if (!account) continue;
    grossAccountIds.add(account.id);
    if (!grossDirectionByCode.has(account.code)) grossDirectionByCode.set(account.code, account.balanceDirection);
  }
  const versionedRules = rules.filter((rule): rule is RuleInput & {
    policyVersionId: number;
    sourceGroupAccountId: number;
    targetGroupAccountId: number | null;
  } => rule.policyVersionId !== undefined && rule.sourceGroupAccountId !== undefined);
  for (const balance of mappedBalances) {
    const groupAccount = balance.account.groupAccount;
    if (!groupAccount || versionedRules.length === 0) continue;
    const rule = resolveGroupReclassRule(
      groupAccount.id,
      oppositeBalanceSide(groupAccount.balanceDirection),
      versionedRules,
      parentByGroupAccountId,
    );
    if (!rule || normalizeReclassBasis(rule.basis) !== "counterparty_gross") continue;
    grossAccountIds.add(balance.account.id);
    grossDirectionByCode.set(balance.account.code, groupAccount.balanceDirection);
  }
  const result = new Map<string, number | null>();
  if (grossAccountIds.size === 0) return result;
  const auxiliaryRows = await prisma.financeAuxiliaryBalance.findMany({
    where: { periodId, accountId: { in: [...grossAccountIds] } },
    select: { closingDebit: true, closingCredit: true, account: { select: { code: true } } },
  });
  const rowsByCode = new Map<string, typeof auxiliaryRows>();
  for (const row of auxiliaryRows) {
    const rows = rowsByCode.get(row.account.code) ?? [];
    rows.push(row);
    rowsByCode.set(row.account.code, rows);
  }
  for (const [code, direction] of grossDirectionByCode) {
    const rows = rowsByCode.get(code) ?? [];
    result.set(code, rows.length === 0 ? null : counterpartyGrossAbnormalAmount(rows, direction));
  }
  return result;
}
function emptySummary(): ReclassWorkbenchSummary {
  return { total: 0, automatic: 0, manual: 0, noProcess: 0, pending: 0, historical: 0, currentAmount: 0 };
}
