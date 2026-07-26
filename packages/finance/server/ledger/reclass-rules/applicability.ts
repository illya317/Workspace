import type { Prisma } from "@workspace/platform/server/prisma";

import { resolveFinanceAccountingPolicyVersionAtInTransaction } from "../group-accounts/policy-versions";
import type { ResolvableReclassRule } from "./resolution";

export interface ReclassRulePeriodScope {
  id: number;
  companyCode: string;
  year: number;
  endDate: string;
}

export async function loadApplicableRulesByPeriod(
  tx: Prisma.TransactionClient,
  periods: readonly ReclassRulePeriodScope[],
  rules: readonly ResolvableReclassRule[],
) {
  const result = new Map<number, ResolvableReclassRule[]>();
  const versionIdByEndDate = new Map<string, number>();
  for (const period of periods) {
    let policyVersionId = versionIdByEndDate.get(period.endDate);
    if (policyVersionId === undefined) {
      const version = await resolveFinanceAccountingPolicyVersionAtInTransaction(tx, period.endDate);
      policyVersionId = version.id;
      versionIdByEndDate.set(period.endDate, policyVersionId);
    }
    result.set(period.id, rules.filter((rule) => rule.policyVersionId === policyVersionId));
  }
  return result;
}
