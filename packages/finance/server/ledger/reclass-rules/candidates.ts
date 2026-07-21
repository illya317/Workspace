/**
 * Group-wide reclassification rule inventory.
 *
 * Source accounts are the union of active accounts across all group companies
 * and years. Only accounts that have ever ended a period on their abnormal
 * balance side remain actionable without a manual rule.
 */
import { Prisma, prisma } from "@workspace/platform/server/prisma";

import type { RuleCandidate, ScanCandidatesResult } from "./types";
import { deriveRuleCandidateDecision } from "./candidate-state";
import { oppositeBalanceSide, resolveLongestPrefixRule } from "./resolution";

export async function scanCandidates(): Promise<ScanCandidatesResult> {
  const [accounts, rules, historicalAbnormalRows] = await Promise.all([
    prisma.financeAccount.findMany({
      where: { isActive: true },
      select: { code: true, name: true, balanceDirection: true, companyCode: true, year: true },
      orderBy: [{ year: "desc" }, { companyCode: "asc" }, { code: "asc" }],
    }),
    prisma.financeReclassRule.findMany({
      orderBy: [{ sourceAccountCode: "asc" }, { abnormalSide: "asc" }],
      where: { enabled: true, source: "manual", confirmedBy: { not: null }, confirmedAt: { not: null } },
      select: { id: true, sourceAccountCode: true, abnormalSide: true, decision: true, targetAccountCode: true, source: true, enabled: true },
    }),
    prisma.$queryRaw<Array<{ code: string }>>(Prisma.sql`
      SELECT DISTINCT account."code"
      FROM "FinanceAccountBalance" AS balance
      INNER JOIN "FinanceAccount" AS account ON account."id" = balance."accountId"
      WHERE (
        account."balanceDirection" = 'credit'
        AND ROUND(CAST(balance."closingDebit" - balance."closingCredit" AS numeric), 2) > 0
      ) OR (
        account."balanceDirection" <> 'credit'
        AND ROUND(CAST(balance."closingDebit" - balance."closingCredit" AS numeric), 2) < 0
      )
    `),
  ]);
  const historicalAbnormalCodes = new Set(historicalAbnormalRows.map((row) => row.code));
  const accountUnion = new Map<string, { code: string; name: string; balanceDirection: string }>();
  for (const account of accounts) {
    if (!accountUnion.has(account.code)) accountUnion.set(account.code, account);
  }
  const candidates: RuleCandidate[] = [];
  const representedRuleIds = new Set<number>();
  for (const account of accountUnion.values()) {
    const candidateSide = oppositeBalanceSide(account.balanceDirection);
    const rule = resolveLongestPrefixRule(account.code, candidateSide, rules);
    const hasHistoricalAbnormalBalance = historicalAbnormalCodes.has(account.code);
    const existingDecision = rule?.decision as RuleCandidate["existingDecision"] ?? null;
    if (rule) representedRuleIds.add(rule.id);
    candidates.push({
      accountCode: account.code,
      accountName: account.name,
      balanceDirection: account.balanceDirection,
      abnormalSide: (rule?.sourceAccountCode === account.code ? rule.abnormalSide : candidateSide) as RuleCandidate["abnormalSide"],
      abnormalAmount: 0,
      hasHistoricalAbnormalBalance,
      effectiveDecision: deriveRuleCandidateDecision(existingDecision, hasHistoricalAbnormalBalance),
      existingRuleId: rule?.id ?? null,
      existingTarget: rule?.targetAccountCode ?? null,
      existingDecision,
      existingSource: rule?.source ?? null,
      existingRuleSourceAccountCode: rule?.sourceAccountCode ?? null,
      existingEnabled: rule?.enabled ?? null,
    });
  }
  for (const rule of rules) {
    if (representedRuleIds.has(rule.id)) continue;
    const account = accountUnion.get(rule.sourceAccountCode);
    candidates.push({
      accountCode: rule.sourceAccountCode,
      accountName: account?.name ?? rule.sourceAccountCode,
      balanceDirection: account?.balanceDirection ?? (rule.abnormalSide === "debit" ? "credit" : "debit"),
      abnormalSide: rule.abnormalSide as RuleCandidate["abnormalSide"],
      abnormalAmount: 0,
      hasHistoricalAbnormalBalance: historicalAbnormalCodes.has(rule.sourceAccountCode),
      effectiveDecision: rule.decision as RuleCandidate["effectiveDecision"],
      existingRuleId: rule.id,
      existingTarget: rule.targetAccountCode,
      existingDecision: rule.decision as RuleCandidate["existingDecision"],
      existingSource: rule.source,
      existingRuleSourceAccountCode: rule.sourceAccountCode,
      existingEnabled: rule.enabled,
    });
  }
  candidates.sort((left, right) => left.accountCode.localeCompare(right.accountCode, "zh-CN", { numeric: true }) || left.abnormalSide.localeCompare(right.abnormalSide));
  return {
    accountOptions: [...accountUnion.values()].map(({ code, name }) => ({ code, name })),
    candidates,
    stats: {
      totalGroupAccounts: accountUnion.size,
      historicallyAbnormal: [...accountUnion.keys()].filter((code) => historicalAbnormalCodes.has(code)).length,
      reclassified: candidates.filter((candidate) => candidate.effectiveDecision === "reclassify").length,
      noReclass: candidates.filter((candidate) => candidate.effectiveDecision === "no_reclass").length,
      unconfirmed: candidates.filter((candidate) => candidate.effectiveDecision === null).length,
    },
  };
}
