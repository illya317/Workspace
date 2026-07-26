import type { ReclassBasis } from "@workspace/finance/types";

export interface ResolvableReclassRule {
  id: number;
  policyVersionId: number;
  sourceGroupAccountId: number;
  targetGroupAccountId: number | null;
  sourceAccountCode: string;
  abnormalSide: string;
  decision: string;
  targetAccountCode: string | null;
  enabled?: boolean;
  basis?: string;
}

export function normalizeReclassBasis(basis: string | null | undefined): ReclassBasis {
  return basis === "counterparty_gross" ? "counterparty_gross" : "account_net";
}

export function resolveGroupReclassRule<T extends ResolvableReclassRule>(
  groupAccountId: number,
  abnormalSide: "debit" | "credit",
  rules: readonly T[],
  parentByGroupAccountId: ReadonlyMap<number, number | null>,
): T | undefined {
  const rulesByAccount = new Map<number, T[]>();
  for (const rule of rules) {
    if (!rule.enabled || (rule.abnormalSide !== abnormalSide && rule.abnormalSide !== "both")) continue;
    const groupRules = rulesByAccount.get(rule.sourceGroupAccountId) ?? [];
    groupRules.push(rule);
    rulesByAccount.set(rule.sourceGroupAccountId, groupRules);
  }

  const visited = new Set<number>();
  let currentId: number | null = groupAccountId;
  while (currentId !== null && !visited.has(currentId)) {
    visited.add(currentId);
    const match = rulesByAccount.get(currentId)?.sort((left, right) => right.id - left.id)[0];
    if (match) return match;
    currentId = parentByGroupAccountId.get(currentId) ?? null;
  }
  return undefined;
}

export function oppositeBalanceSide(balanceDirection: string): "debit" | "credit" {
  return balanceDirection === "credit" ? "debit" : "credit";
}
