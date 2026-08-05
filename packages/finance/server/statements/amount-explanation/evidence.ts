import type { EvidenceRef, EvidenceSourceKind } from "@workspace/finance/types/statement-explanation";

import { canonicalFingerprint } from "./fingerprint";

/**
 * 稳定证据 ID：sourceKind + 源身份指纹。同一源事实跨查询/跨进程得到同一 ID；
 * 源字段（金额、凭证、科目等）变化会得到不同 ID，这正是指纹的意义。
 */
export function buildEvidenceId(sourceKind: EvidenceSourceKind, sourceFingerprint: string): string {
  return `ev_${sourceKind}_${sourceFingerprint.slice(0, 32)}`;
}

export function fingerprintSource(payload: unknown): string {
  return canonicalFingerprint(payload);
}

/**
 * 证据完整度：已填充的可选证据组数量（account/period/voucher/consolidation/translation/workbook）。
 * 整数 0..6，供确定性排序比较。
 */
export function completenessScore(evidence: EvidenceRef): number {
  return [
    evidence.account,
    evidence.period,
    evidence.voucher,
    evidence.consolidation,
    evidence.translation,
    evidence.workbook,
  ].filter((group) => group !== null).length;
}

/** 按稳定证据 ID 去重；同 ID 保留先出现者（provider 注册顺序确定，故结果确定）。 */
export function dedupeEvidence<T extends { evidence: EvidenceRef }>(candidates: readonly T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const candidate of candidates) {
    if (seen.has(candidate.evidence.evidenceId)) continue;
    seen.add(candidate.evidence.evidenceId);
    result.push(candidate);
  }
  return result;
}
