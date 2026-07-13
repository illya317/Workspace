/**
 * Reclassification pair inventory.
 *
 * Voucher movements are intentionally not scanned: they cannot establish a
 * counterparty closing balance. This endpoint now exposes only supported
 * settlement-account pairs and any legacy rule metadata for the configuration
 * surface.
 */
import { prisma } from "@workspace/platform/server/prisma";

import { AUXILIARY_RECLASS_PAIRS } from "../../../types/auxiliary-reclass";
import type { RuleCandidate, ScanCandidatesParams, ScanCandidatesResult } from "./types";

export async function scanCandidates(params: ScanCandidatesParams): Promise<ScanCandidatesResult> {
  const { companyCode, year } = params;
  const supportedCodes = Object.keys(AUXILIARY_RECLASS_PAIRS);
  const [accounts, rules] = await Promise.all([
    prisma.financeAccount.findMany({
      where: { companyCode, year, code: { in: supportedCodes } },
      select: { code: true, name: true, balanceDirection: true },
      orderBy: { code: "asc" },
    }),
    prisma.financeReclassRule.findMany({
      where: { companyCode, year, sourceAccountCode: { in: supportedCodes } },
      select: { id: true, sourceAccountCode: true, abnormalSide: true, targetAccountCode: true, source: true, enabled: true },
    }),
  ]);
  const ruleMap = new Map(rules.map((rule) => [`${rule.sourceAccountCode}::${rule.abnormalSide}`, rule]));
  const candidates: RuleCandidate[] = accounts.map((account) => {
    const pair = AUXILIARY_RECLASS_PAIRS[account.code];
    const rule = ruleMap.get(`${account.code}::${pair.abnormalSide}`);
    return {
      accountCode: account.code,
      accountName: account.name,
      balanceDirection: account.balanceDirection,
      abnormalSide: pair.abnormalSide,
      abnormalAmount: 0,
      suggestedTarget: pair.target,
      existingRuleId: rule?.id ?? null,
      existingTarget: rule?.targetAccountCode ?? null,
      existingSource: rule?.source ?? null,
      existingEnabled: rule?.enabled ?? null,
    };
  });
  return {
    companyCode,
    year,
    candidates,
    stats: {
      totalAccountsScanned: candidates.length,
      abnormalCount: 0,
      withExistingRule: candidates.filter((candidate) => candidate.existingRuleId !== null).length,
      withoutRule: candidates.filter((candidate) => candidate.existingRuleId === null).length,
    },
  };
}
