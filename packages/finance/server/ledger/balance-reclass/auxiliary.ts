import { prisma } from "@workspace/platform/server/prisma";

import type { PreviewAuxiliaryBalance } from "../../import/shared";
import { buildFinancePeriodScopeCommand } from "../../domain/finance-validation";
import {
  loadFinanceGroupAccountMapByAccountIdsAt,
  type ResolvedFinanceGroupAccount,
} from "../group-accounts";
import { loadApplicableRulesByPeriod } from "../reclass-rules/applicability";
import {
  normalizeReclassBasis,
  resolveGroupReclassRule,
  type ResolvableReclassRule,
} from "../reclass-rules/resolution";
import { materializeAutomaticRuleAdjustments } from "./automatic";
import { archiveBalanceReclassAdjustment, hasSameBalanceReclassResult } from "./history";

export interface AuxiliaryReclassEntry {
  policyVersionId: number;
  sourceGroupAccountId: number;
  targetGroupAccountId: number | null;
  sourceAccount: string;
  targetAccount: string;
  amount: number;
  ruleId: number | null;
  details: Array<{ dimensionType: string; dimensionCode: string; dimensionName: string; amount: number }>;
}

export function buildAuxiliaryReclassEntries(
  rows: readonly PreviewAuxiliaryBalance[],
  rules: readonly ResolvableReclassRule[] = [],
  groupAccountByLocalCode: ReadonlyMap<string, ResolvedFinanceGroupAccount> = new Map(),
): {
  entries: AuxiliaryReclassEntry[];
  coveredAccountCodes: string[];
} {
  const parentByGroupAccountId = new Map<number, number | null>([...groupAccountByLocalCode.values()].map((group) => [
    group.id,
    group.parentId,
  ]));
  const coveredAccountCodes = [...new Set(rows.flatMap((row) => {
    const groupAccount = groupAccountByLocalCode.get(row.accountCode);
    if (!groupAccount) return [];
    const abnormalSide = groupAccount.balanceDirection === "credit" ? "debit" : "credit";
    const rule = resolveGroupReclassRule(groupAccount.id, abnormalSide, rules, parentByGroupAccountId);
    return rule && normalizeReclassBasis(rule.basis) === "counterparty_gross"
      ? [row.accountCode]
      : [];
  }))];
  const grouped = new Map<string, AuxiliaryReclassEntry>();
  for (const row of rows) {
    const groupAccount = groupAccountByLocalCode.get(row.accountCode);
    if (!groupAccount) continue;
    const net = roundMoney(row.closingDebit - row.closingCredit);
    const side = net > 0 ? "debit" : net < 0 ? "credit" : null;
    if (!side) continue;
    const rule = resolveGroupReclassRule(groupAccount.id, side, rules, parentByGroupAccountId);
    const target = rule?.decision === "reclassify" ? rule.targetAccountCode : null;
    if (!rule || !target) continue;
    if (normalizeReclassBasis(rule.basis) !== "counterparty_gross") continue;
    const amount = roundMoney(Math.abs(net));
    const key = `${row.accountCode}::${target}`;
    const entry = grouped.get(key) ?? {
      policyVersionId: rule.policyVersionId,
      sourceGroupAccountId: groupAccount.id,
      targetGroupAccountId: rule.targetGroupAccountId,
      sourceAccount: row.accountCode,
      targetAccount: target,
      amount: 0,
      ruleId: rule.id,
      details: [],
    };
    entry.amount = roundMoney(entry.amount + amount);
    entry.details.push({
      dimensionType: row.dimensionType,
      dimensionCode: row.dimensionCode,
      dimensionName: row.dimensionName,
      amount,
    });
    grouped.set(key, entry);
  }
  return { entries: [...grouped.values()], coveredAccountCodes };
}

export async function importAuxiliaryReclassAdjustments(input: {
  companyCode: string;
  year: number;
  month: number;
  rows: readonly PreviewAuxiliaryBalance[];
}): Promise<{ written: number; deleted: number; skippedProtected: number; entries: AuxiliaryReclassEntry[] }> {
  const command = buildFinancePeriodScopeCommand(input);
  if (!command.ok || command.data.month === undefined) throw new Error(command.ok ? "month is required" : command.issue.message);
  const { companyCode, year, month } = command.data;
  const period = await getOrCreatePeriod(companyCode, year, month);
  const localCodes = [...new Set(input.rows.map((row) => row.accountCode))];
  const accounts = await prisma.financeAccount.findMany({
    where: { companyCode, year, code: { in: localCodes }, isActive: true },
    select: { id: true, code: true },
  });
  const groupMap = await loadFinanceGroupAccountMapByAccountIdsAt(
    accounts.map((account) => account.id),
    period.endDate,
  );
  const groupAccountByLocalCode = new Map(accounts.flatMap((account) => {
    const groupAccount = groupMap.mappings.get(account.id);
    return groupAccount ? [[account.code, groupAccount] as const] : [];
  }));
  const rules = await prisma.financeReclassRule.findMany({
    where: {
      policyVersionId: groupMap.policyVersion.id,
      enabled: true,
      source: "manual",
      confirmedBy: { not: null },
      confirmedAt: { not: null },
    },
  });
  const applicableRules = await loadApplicableRulesByPeriod(prisma, [period], rules);
  const { entries, coveredAccountCodes } = buildAuxiliaryReclassEntries(
    input.rows,
    applicableRules.get(period.id) ?? [],
    groupAccountByLocalCode,
  );

  return prisma.$transaction(async (tx) => {
    const existing = await tx.financeBalanceReclassAdjustment.findMany({
      where: {
        periodId: period.id,
        OR: [
          { sourceType: { in: ["auxiliary_balance", "automatic_rule", "balance_residual"] } },
          { sourceAccountCode: { in: coveredAccountCodes } },
        ],
      },
      select: adjustmentSnapshotSelect,
    });
    const existingBySource = new Map(existing.map((row) => [row.sourceAccountCode, row]));
    const entryBySource = new Map(entries.map((entry) => [entry.sourceAccount, entry]));
    let written = 0;
    let deleted = 0;
    let skippedProtected = 0;

    for (const row of existing) {
      const entry = entryBySource.get(row.sourceAccountCode);
      if (row.sourceType === "manual" || row.status === "adjusted" || row.status === "rejected") {
        skippedProtected += 1;
        entryBySource.delete(row.sourceAccountCode);
        continue;
      }
      if (!entry) {
        if (row.sourceType !== "auxiliary_balance" && row.sourceType !== "balance_residual") continue;
        await archiveBalanceReclassAdjustment(tx, { ...row, amount: Number(row.amount) }, "auxiliary_import_removed");
        await tx.financeBalanceReclassAdjustment.delete({ where: { id: row.id } });
        deleted += 1;
        continue;
      }
      const next = auxiliaryCurrentData(entry);
      const snapshot = { ...row, amount: Number(row.amount) };
      if (!hasSameBalanceReclassResult(snapshot, next)) {
        await archiveBalanceReclassAdjustment(tx, snapshot, "auxiliary_import_recomputed");
        await tx.financeBalanceReclassAdjustment.update({ where: { id: row.id }, data: next });
        written += 1;
      }
      entryBySource.delete(row.sourceAccountCode);
    }

    for (const entry of entryBySource.values()) {
      if (existingBySource.has(entry.sourceAccount)) continue;
      await tx.financeBalanceReclassAdjustment.create({ data: {
        periodId: period.id,
        companyCode,
        year,
        sourceAccountCode: entry.sourceAccount,
        ...auxiliaryCurrentData(entry),
      } });
      written += 1;
    }

    const legacyVoucherDelete = await tx.reclassResult.deleteMany({
      where: { periodId: period.id, status: { in: ["pending", "approved"] } },
    });
    const automatic = await materializeAutomaticRuleAdjustments(tx, {
      periodIds: [period.id],
      policyVersionId: groupMap.policyVersion.id,
    });
    return {
      written: written + automatic.written + automatic.updated,
      deleted: deleted + legacyVoucherDelete.count + automatic.deleted,
      skippedProtected: skippedProtected + automatic.skippedProtected,
      entries,
    };
  }, { maxWait: 10_000, timeout: 60_000 });
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

function auxiliaryCurrentData(entry: AuxiliaryReclassEntry) {
  return {
    policyVersionId: entry.policyVersionId,
    sourceGroupAccountId: entry.sourceGroupAccountId,
    targetGroupAccountId: entry.targetGroupAccountId,
    targetAccountCode: entry.targetAccount,
    amount: entry.amount,
    decision: "reclassify",
    basis: "counterparty_gross",
    ruleId: entry.ruleId,
    sourceType: "auxiliary_balance",
    status: "approved",
    note: JSON.stringify({ basis: "auxiliary_closing_balance", policyVersionId: entry.policyVersionId, details: entry.details }),
    adjustedBy: null,
    adjustedAt: null,
  };
}

async function getOrCreatePeriod(companyCode: string, year: number, month: number) {
  const existing = await prisma.financePeriod.findUnique({ where: { companyCode_year_month: { companyCode, year, month } } });
  if (existing) return existing;
  const lastDay = new Date(year, month, 0).getDate();
  return prisma.financePeriod.create({
    data: {
      companyCode,
      year,
      month,
      startDate: `${year}-${String(month).padStart(2, "0")}-01`,
      endDate: `${year}-${String(month).padStart(2, "0")}-${lastDay}`,
    },
  });
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
