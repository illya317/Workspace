/**
 * Group-wide reclassification rule inventory.
 *
 * Source accounts are the union of active accounts across all group companies
 * and years. Voucher movements are intentionally not scanned: they cannot
 * establish a counterparty closing balance.
 */
import { prisma } from "@workspace/platform/server/prisma";

import type { RuleCandidate, ScanCandidatesResult } from "./types";

export async function scanCandidates(): Promise<ScanCandidatesResult> {
  const [accounts, rules] = await Promise.all([
    prisma.financeAccount.findMany({
      where: { isActive: true },
      select: { code: true, name: true, balanceDirection: true, companyCode: true, year: true },
      orderBy: [{ year: "desc" }, { companyCode: "asc" }, { code: "asc" }],
    }),
    prisma.financeReclassRule.findMany({
      orderBy: [{ sourceAccountCode: "asc" }, { abnormalSide: "asc" }],
      where: { source: "manual", confirmedBy: { not: null }, confirmedAt: { not: null } },
      select: { id: true, sourceAccountCode: true, abnormalSide: true, decision: true, targetAccountCode: true, source: true, enabled: true },
    }),
  ]);
  const accountUnion = new Map<string, { code: string; name: string; balanceDirection: string }>();
  for (const account of accounts) {
    if (!accountUnion.has(account.code)) accountUnion.set(account.code, account);
  }
  const rulesBySource = new Map<string, typeof rules>();
  for (const rule of rules) {
    const list = rulesBySource.get(rule.sourceAccountCode) ?? [];
    list.push(rule);
    rulesBySource.set(rule.sourceAccountCode, list);
  }

  const candidates: RuleCandidate[] = [];
  for (const account of accountUnion.values()) {
    const existingRules = rulesBySource.get(account.code) ?? [];
    const rowRules = existingRules.length > 0 ? existingRules : [null];
    for (const rule of rowRules) {
      candidates.push({
        accountCode: account.code,
        accountName: account.name,
        balanceDirection: account.balanceDirection,
        abnormalSide: (rule?.abnormalSide ?? oppositeSide(account.balanceDirection)) as RuleCandidate["abnormalSide"],
        abnormalAmount: 0,
        existingRuleId: rule?.id ?? null,
        existingTarget: rule?.targetAccountCode ?? null,
        existingDecision: rule?.decision as RuleCandidate["existingDecision"] ?? null,
        existingSource: rule?.source ?? null,
        existingEnabled: rule?.enabled ?? null,
      });
    }
  }
  for (const rule of rules) {
    if (accountUnion.has(rule.sourceAccountCode)) continue;
    candidates.push({
      accountCode: rule.sourceAccountCode,
      accountName: rule.sourceAccountCode,
      balanceDirection: rule.abnormalSide === "debit" ? "credit" : "debit",
      abnormalSide: rule.abnormalSide as RuleCandidate["abnormalSide"],
      abnormalAmount: 0,
      existingRuleId: rule.id,
      existingTarget: rule.targetAccountCode,
      existingDecision: rule.decision as RuleCandidate["existingDecision"],
      existingSource: rule.source,
      existingEnabled: rule.enabled,
    });
  }
  candidates.sort((left, right) => left.accountCode.localeCompare(right.accountCode, "zh-CN", { numeric: true }) || left.abnormalSide.localeCompare(right.abnormalSide));
  return {
    accountOptions: [...accountUnion.values()].map(({ code, name }) => ({ code, name })),
    candidates,
    stats: {
      totalGroupAccounts: accountUnion.size,
      reclassified: candidates.filter((candidate) => candidate.existingDecision === "reclassify").length,
      noReclass: candidates.filter((candidate) => candidate.existingDecision === "no_reclass").length,
      unconfirmed: candidates.filter((candidate) => candidate.existingDecision === null).length,
    },
  };
}

function oppositeSide(balanceDirection: string): "debit" | "credit" {
  return balanceDirection === "credit" ? "debit" : "credit";
}
