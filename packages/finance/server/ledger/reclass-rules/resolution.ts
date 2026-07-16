export interface ResolvableReclassRule {
  id: number;
  sourceAccountCode: string;
  abnormalSide: string;
  decision: string;
  targetAccountCode: string | null;
  enabled?: boolean;
}

export function resolveLongestPrefixRule<T extends ResolvableReclassRule>(
  accountCode: string,
  abnormalSide: "debit" | "credit",
  rules: readonly T[],
): T | undefined {
  return rules
    .filter((rule) => rule.enabled !== false
      && accountCode.startsWith(rule.sourceAccountCode)
      && (rule.abnormalSide === abnormalSide || rule.abnormalSide === "both"))
    .sort((left, right) => (
      right.sourceAccountCode.length - left.sourceAccountCode.length
      || Number(right.abnormalSide === abnormalSide) - Number(left.abnormalSide === abnormalSide)
      || right.id - left.id
    ))[0];
}

export function oppositeBalanceSide(balanceDirection: string): "debit" | "credit" {
  return balanceDirection === "credit" ? "debit" : "credit";
}
