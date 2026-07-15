import { prisma } from "@workspace/platform/server/prisma";

import type { PreviewAuxiliaryBalance } from "../../import/shared";
import { buildFinancePeriodScopeCommand } from "../../domain/finance-validation";

export interface AuxiliaryReclassEntry {
  sourceAccount: string;
  targetAccount: string;
  amount: number;
  ruleId: number | null;
  details: Array<{ dimensionType: string; dimensionCode: string; dimensionName: string; amount: number }>;
}

export interface AuxiliaryReclassRule {
  id: number;
  sourceAccountCode: string;
  abnormalSide: string;
  decision: string;
  targetAccountCode: string | null;
  enabled: boolean;
}

export function buildAuxiliaryReclassEntries(rows: readonly PreviewAuxiliaryBalance[], rules: readonly AuxiliaryReclassRule[] = []): {
  entries: AuxiliaryReclassEntry[];
  coveredAccountCodes: string[];
} {
  const coveredAccountCodes = [...new Set(rows.map((row) => row.accountCode).filter((code) => hasRule(code, rules)))];
  const grouped = new Map<string, AuxiliaryReclassEntry>();
  for (const row of rows) {
    const net = roundMoney(row.closingDebit - row.closingCredit);
    const side = net > 0.005 ? "debit" : net < -0.005 ? "credit" : null;
    if (!side) continue;
    const rule = resolveRule(row.accountCode, side, rules);
    const target = rule?.decision === "reclassify" ? rule.targetAccountCode : null;
    if (!target) continue;
    const amount = roundMoney(Math.abs(net));
    const key = `${row.accountCode}::${target}`;
    const entry = grouped.get(key) ?? { sourceAccount: row.accountCode, targetAccount: target, amount: 0, ruleId: rule?.id ?? null, details: [] };
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
  const rules = await prisma.financeReclassRule.findMany({
    where: { enabled: true, source: "manual", confirmedBy: { not: null }, confirmedAt: { not: null } },
  });
  const { entries, coveredAccountCodes } = buildAuxiliaryReclassEntries(input.rows, rules);
  const targetCodes = [...new Set(entries.map((entry) => entry.targetAccount))];
  const existingTargets = await prisma.financeAccount.findMany({
    where: { companyCode, year, code: { in: targetCodes } },
    select: { code: true },
  });
  const targetSet = new Set(existingTargets.map((account) => account.code));
  const validEntries = entries.filter((entry) => targetSet.has(entry.targetAccount));

  const protectedRows = await prisma.financeBalanceReclassAdjustment.findMany({
    where: { periodId: period.id, status: { in: ["adjusted", "rejected"] } },
    select: { sourceAccountCode: true },
  });
  const protectedAccounts = new Set(protectedRows.map((row) => row.sourceAccountCode));

  const [legacyVoucherDelete, legacyBalanceDelete, replacedDelete] = await prisma.$transaction([
    prisma.reclassResult.deleteMany({ where: { periodId: period.id, status: { in: ["pending", "approved"] } } }),
    prisma.financeBalanceReclassAdjustment.deleteMany({ where: { periodId: period.id, sourceType: "balance_residual", status: "approved" } }),
    prisma.financeBalanceReclassAdjustment.deleteMany({
      where: { periodId: period.id, sourceType: "auxiliary_balance", status: "approved", sourceAccountCode: { in: coveredAccountCodes } },
    }),
  ]);

  let written = 0;
  for (const entry of validEntries) {
    if (protectedAccounts.has(entry.sourceAccount)) continue;
    await prisma.financeBalanceReclassAdjustment.upsert({
      where: { periodId_sourceAccountCode: { periodId: period.id, sourceAccountCode: entry.sourceAccount } },
      create: {
        periodId: period.id,
        companyCode,
        year,
        sourceAccountCode: entry.sourceAccount,
        targetAccountCode: entry.targetAccount,
        amount: entry.amount,
        ruleId: entry.ruleId,
        sourceType: "auxiliary_balance",
        status: "approved",
        note: JSON.stringify({ basis: "auxiliary_closing_balance", details: entry.details }),
      },
      update: {
        targetAccountCode: entry.targetAccount,
        amount: entry.amount,
        ruleId: entry.ruleId,
        sourceType: "auxiliary_balance",
        status: "approved",
        note: JSON.stringify({ basis: "auxiliary_closing_balance", details: entry.details }),
      },
    });
    written++;
  }

  return {
    written,
    deleted: legacyVoucherDelete.count + legacyBalanceDelete.count + replacedDelete.count,
    skippedProtected: protectedAccounts.size,
    entries: validEntries,
  };
}

function hasRule(accountCode: string, rules: readonly AuxiliaryReclassRule[]) {
  return rules.some((rule) => rule.enabled && accountCode.startsWith(rule.sourceAccountCode));
}

function resolveRule(accountCode: string, side: "debit" | "credit", rules: readonly AuxiliaryReclassRule[]) {
  return rules
    .filter((rule) => rule.enabled && accountCode.startsWith(rule.sourceAccountCode) && (rule.abnormalSide === side || rule.abnormalSide === "both"))
    .sort((left, right) => right.sourceAccountCode.length - left.sourceAccountCode.length)[0];
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
