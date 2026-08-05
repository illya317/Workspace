export const AUTOMATIC_DECISION_EVIDENCE_PREFIX = "系统根据合并凭证生成结果自动记录";

export const AUTOMATIC_ENTRY_TYPES = [
  "investmentEquity",
  "nonControllingInterest",
  "intercompanyBalance",
  "cashFlow",
] as const;

export type AutomaticEntryType = typeof AUTOMATIC_ENTRY_TYPES[number];

export function consolidationMatchGroupCoveredByPolicy(
  group: ConsolidationVoucherMatchGroup,
  policyEntries: readonly { lines: readonly { sourceVoucherItemId?: number | null }[] }[],
) {
  if (group.category !== "investmentEquity") return false;
  const policyVoucherItemIds = new Set(policyEntries.flatMap((entry) => entry.lines.flatMap((line) => (
    line.sourceVoucherItemId ? [line.sourceVoucherItemId] : []
  ))));
  return [...group.leftFacts, ...group.rightFacts].some((fact) => policyVoucherItemIds.has(fact.itemId));
}

interface GenerationIssue {
  entryType: string;
  title: string;
  differenceAmount: number;
  conclusion: string;
  evidence: string;
}

export function desiredAutomaticDecision(
  entryType: AutomaticEntryType,
  policyIssues: readonly GenerationIssue[],
  generatedTypes: ReadonlySet<string>,
) {
  const issues = policyIssues.filter((issue) => issue.entryType === entryType);
  if (issues.length > 0) return {
    decision: "requiresReview" as const,
    conclusion: `${issues.length} 笔投资与权益差额待分类`,
    evidence: `${AUTOMATIC_DECISION_EVIDENCE_PREFIX}；${issues.map((issue) => (
      `${issue.title}：${issue.differenceAmount.toFixed(2)} 元，${issue.conclusion}；${issue.evidence}`
    )).join("；")}`,
  };
  if (generatedTypes.has(entryType)) return null;
  return {
    decision: "notApplicable" as const,
    conclusion: "当前来源未形成可入账的合并凭证",
    evidence: `${AUTOMATIC_DECISION_EVIDENCE_PREFIX}；单边、差额或缺少外币流水的事项保留来源例外，不进入合并数`,
  };
}
import type { ConsolidationVoucherMatchGroup } from "../domain/consolidation-entry-generation";
