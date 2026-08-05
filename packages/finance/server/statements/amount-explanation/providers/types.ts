import type {
  AmountOriginProviderDiagnostics,
  EvidenceRef,
  EvidenceSourceKind,
} from "@workspace/finance/types/statement-explanation";

import type { AmountExplanationDb } from "../db";
import type { NormalizedQuery } from "../input";
import type { ExplanationScope } from "../scope";

/** 内部候选：EvidenceRef（公共 DTO）+ 排序用的确定性上下文。不泄漏出 capability。 */
export interface EvidenceCandidate {
  evidence: EvidenceRef;
  /** 带符号金额（minor units，LEDGER_MONEY_SCALE=2）。 */
  amountMinor: bigint;
  companyId: number | null;
  accountCode: string | null;
  /** "YYYY-MM"。 */
  periodKey: string | null;
  lineCode: string | null;
  /** 0..6，见 evidence.ts。 */
  completeness: number;
  /** provider 内的确定性发射顺序。 */
  providerOrder: number;
}

export interface ProviderContext {
  db: AmountExplanationDb;
  query: NormalizedQuery;
  scope: ExplanationScope;
  /** |候选金额| 上界（含），minor units，scale 2。 */
  windowUpperMinor: bigint;
  /** 单个 provider 的候选上限（超出按确定性顺序截断并在诊断中上报 capped）。 */
  candidateLimit: number;
}

export interface ProviderOutcome {
  candidates: EvidenceCandidate[];
  diagnostics: AmountOriginProviderDiagnostics;
}

export interface AmountEvidenceProvider {
  readonly sourceKind: EvidenceSourceKind;
  collect(ctx: ProviderContext): Promise<ProviderOutcome>;
}

export function diagnostics(
  sourceKind: EvidenceSourceKind,
  status: AmountOriginProviderDiagnostics["status"],
  values: { queryCount: number; fetchedCount: number; candidateCount: number; note?: string },
): AmountOriginProviderDiagnostics {
  return { sourceKind, status, ...values };
}
