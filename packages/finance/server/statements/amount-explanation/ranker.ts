import { absMinor } from "./decimal";
import type { NormalizedQuery } from "./query";
import type { EvidenceCandidate } from "./providers/provider";

/**
 * Finance 语义排序（计划 §4.4 第 8 步）：
 * 1. |residual| 升序（更接近目标的解释优先）
 * 2. 项数升序（更少项优先）
 * 3. 上下文接近度降序（同 target 公司 / 科目提示 / 期间 / 报表行）
 * 4. 证据完整度降序
 * 5. 稳定源顺序（最小 providerOrder、证据 ID 字典序）——只作最终确定性 tiebreak
 *
 * 1–4 全部相等即 tie/near-tie → ambiguous（计划 §4.3：平局必须暴露，不得静默挑一个）。
 */

export interface ExplanationToRank {
  evidence: readonly EvidenceCandidate[];
  residualMinor: bigint;
}

export interface RankedExplanation {
  explanation: ExplanationToRank;
  /** 1-based 排名。 */
  rank: number;
  proximity: number;
  completeness: number;
}

function evidenceProximity(evidence: EvidenceCandidate, query: NormalizedQuery): number {
  const target = query.reportContext?.target ?? null;
  let score = 0;
  if (target?.kind === "entity" && evidence.companyId !== null && evidence.companyId === target.companyId) {
    score += 4;
  }
  if (evidence.accountCode && query.accountHints.some((hint) => evidence.accountCode!.startsWith(hint))) {
    score += 2;
  }
  if (target?.kind === "entity" && evidence.periodKey) {
    const targetPeriod = `${target.year}-${String(target.month).padStart(2, "0")}`;
    if (evidence.periodKey === targetPeriod) score += 2;
  }
  if (query.reportContext?.lineCode && evidence.lineCode && evidence.lineCode === query.reportContext.lineCode) {
    score += 3;
  }
  return score;
}

function proximityOf(explanation: ExplanationToRank, query: NormalizedQuery): number {
  return explanation.evidence.reduce((sum, evidence) => sum + evidenceProximity(evidence, query), 0);
}

function completenessOf(explanation: ExplanationToRank): number {
  return explanation.evidence.reduce((sum, evidence) => sum + evidence.completeness, 0);
}

function minProviderOrder(explanation: ExplanationToRank): number {
  return Math.min(...explanation.evidence.map((evidence) => evidence.providerOrder));
}

function evidenceIdSequence(explanation: ExplanationToRank): string {
  return explanation.evidence.map((evidence) => evidence.evidence.evidenceId).sort().join("|");
}

/** 1–4 全等（不含稳定 tiebreak）→ true。 */
export function isNearTie(a: RankedExplanation, b: RankedExplanation): boolean {
  return absMinor(a.explanation.residualMinor) === absMinor(b.explanation.residualMinor)
    && a.explanation.evidence.length === b.explanation.evidence.length
    && a.proximity === b.proximity
    && a.completeness === b.completeness;
}

function compare(a: RankedExplanation, b: RankedExplanation): number {
  const residualDelta = absMinor(a.explanation.residualMinor) < absMinor(b.explanation.residualMinor)
    ? -1
    : absMinor(a.explanation.residualMinor) > absMinor(b.explanation.residualMinor) ? 1 : 0;
  if (residualDelta !== 0) return residualDelta;
  const termDelta = a.explanation.evidence.length - b.explanation.evidence.length;
  if (termDelta !== 0) return termDelta;
  if (a.proximity !== b.proximity) return b.proximity - a.proximity;
  if (a.completeness !== b.completeness) return b.completeness - a.completeness;
  const orderDelta = minProviderOrder(a.explanation) - minProviderOrder(b.explanation);
  if (orderDelta !== 0) return orderDelta;
  return evidenceIdSequence(a.explanation).localeCompare(evidenceIdSequence(b.explanation));
}

export interface RankOutcome {
  ranked: RankedExplanation[];
  /** 前两名 1–4 全等：结果必须按 ambiguous 上报。 */
  ambiguous: boolean;
}

export function rankExplanations(
  explanations: readonly ExplanationToRank[],
  query: NormalizedQuery,
): RankOutcome {
  const prepared = explanations.map((explanation) => ({
    explanation,
    rank: 0,
    proximity: proximityOf(explanation, query),
    completeness: completenessOf(explanation),
  }));
  prepared.sort(compare);
  const ranked = prepared.map((entry, index) => ({ ...entry, rank: index + 1 }));
  const ambiguous = ranked.length >= 2 && isNearTie(ranked[0]!, ranked[1]!);
  return { ranked, ambiguous };
}
