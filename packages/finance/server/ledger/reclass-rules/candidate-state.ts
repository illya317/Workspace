export type ReclassRuleDecision = "reclassify" | "no_reclass" | null;

export function deriveRuleCandidateDecision(
  existingDecision: ReclassRuleDecision,
  hasHistoricalAbnormalBalance: boolean,
): ReclassRuleDecision {
  return existingDecision ?? (hasHistoricalAbnormalBalance ? null : "no_reclass");
}
