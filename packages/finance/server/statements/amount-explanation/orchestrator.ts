import type {
  CombinationSolverAdapter,
} from "@workspace/platform/server/combination-solver";
import type {
  AmountOriginBudgets,
  AmountOriginExplanation,
  AmountOriginMethod,
  AmountOriginProviderDiagnostics,
  AmountOriginQuery,
  AmountOriginResult,
  AmountOriginStatus,
  AmountOriginStopReason,
} from "@workspace/finance/types/statement-explanation";

import { absMinor, formatMinorUnits, LEDGER_MONEY_SCALE, sumMinor } from "./decimal";
import { dedupeEvidence } from "./evidence";
import { canonicalFingerprint } from "./fingerprint";
import { normalizeQuery, type NormalizedQuery } from "./input";
import { defaultAmountEvidenceProviders, type AmountEvidenceProvider, type EvidenceCandidate } from "./providers/index";
import { rankExplanations, type ExplanationToRank } from "./ranker";
import { resolveScope } from "./scope";
import type { AmountExplanationDb } from "./db";

/**
 * 确定性编排管线（计划 §4.4 第 2–9 步）：
 * direct providers 先查；未解决才走 combination；solver 只经注入的
 * CombinationSolverAdapter 调用；LLM 不得改变算术/排序/状态/证据
 * （本包无 LLM，此注释固定该边界——计划 §4.4 第 10 步）。
 */

export interface AmountExplanationBudgetConfig {
  maxSolutions: number;
  maxCandidatesAfterFilter: number;
  maxVisitedStates: number;
  deadlineMs: number;
  providerCandidateLimit: number;
}

/** Finance 默认预算（计划 §4.1/§4.4：tolerance 0、maxTerms 6、maxSolutions 20、
 *  过滤后 ≤40 candidates、250,000 visited states、1,000ms deadline）。 */
export const DEFAULT_AMOUNT_EXPLANATION_BUDGETS: AmountExplanationBudgetConfig = {
  maxSolutions: 20,
  maxCandidatesAfterFilter: 40,
  maxVisitedStates: 250_000,
  deadlineMs: 1_000,
  providerCandidateLimit: 200,
};

const MAX_ALTERNATIVES = 19;

export interface OrchestrateInput {
  query: AmountOriginQuery;
  db: AmountExplanationDb;
  solver: CombinationSolverAdapter;
  providers?: readonly AmountEvidenceProvider[];
  budgets?: Partial<AmountExplanationBudgetConfig>;
  orchestratorVersion: string;
}

function budgetsOf(query: NormalizedQuery, config: AmountExplanationBudgetConfig): AmountOriginBudgets {
  const windowUpperMinor = absMinor(query.targetMinor) + query.toleranceMinor;
  return {
    tolerance: formatMinorUnits(query.toleranceMinor, LEDGER_MONEY_SCALE),
    maxTerms: query.maxTerms,
    maxSolutions: config.maxSolutions,
    maxCandidatesAfterFilter: config.maxCandidatesAfterFilter,
    maxVisitedStates: config.maxVisitedStates,
    deadlineMs: config.deadlineMs,
    providerCandidateLimit: config.providerCandidateLimit,
    amountWindowUpper: formatMinorUnits(windowUpperMinor, LEDGER_MONEY_SCALE),
  };
}

function toPublicExplanation(
  ranked: { explanation: ExplanationToRank; rank: number },
  method: AmountOriginMethod,
): AmountOriginExplanation {
  const explainedMinor = sumMinor(ranked.explanation.evidence.map((evidence) => evidence.amountMinor));
  return {
    method,
    rank: ranked.rank,
    evidence: ranked.explanation.evidence.map((evidence) => evidence.evidence),
    explainedAmount: formatMinorUnits(explainedMinor, LEDGER_MONEY_SCALE),
    residualAmount: formatMinorUnits(ranked.explanation.residualMinor, LEDGER_MONEY_SCALE),
  };
}

/**
 * 调 solver 前的确定性 pre-rank：上下文接近度降序 → 完整度降序 → |金额| 降序 →
 * 发射顺序升序，然后按 maxCandidatesAfterFilter 截断（计划 §4.4 第 6 步）。
 */
function preRankAndCap(
  candidates: readonly EvidenceCandidate[],
  query: NormalizedQuery,
  cap: number,
): { selected: EvidenceCandidate[]; truncated: boolean } {
  const target = query.reportContext?.target ?? null;
  const targetPeriod = target?.kind === "entity"
    ? `${target.year}-${String(target.month).padStart(2, "0")}`
    : null;
  const scored = candidates.map((candidate, emissionIndex) => {
    let proximity = 0;
    if (target?.kind === "entity" && candidate.companyId === target.companyId) proximity += 4;
    if (candidate.accountCode && query.accountHints.some((hint) => candidate.accountCode!.startsWith(hint))) proximity += 2;
    if (targetPeriod && candidate.periodKey === targetPeriod) proximity += 2;
    if (query.reportContext?.lineCode && candidate.lineCode === query.reportContext.lineCode) proximity += 3;
    return { candidate, emissionIndex, proximity };
  });
  scored.sort((a, b) => (
    b.proximity - a.proximity
    || b.candidate.completeness - a.candidate.completeness
    || (absMinor(b.candidate.amountMinor) > absMinor(a.candidate.amountMinor) ? 1
      : absMinor(b.candidate.amountMinor) < absMinor(a.candidate.amountMinor) ? -1 : 0)
    || a.emissionIndex - b.emissionIndex
  ));
  const selected = scored.slice(0, cap).map((entry, stableOrder) => ({
    ...entry.candidate,
    providerOrder: stableOrder,
  }));
  return { selected, truncated: scored.length > cap };
}

interface PipelineResult {
  status: AmountOriginStatus;
  method: AmountOriginMethod | null;
  best: AmountOriginExplanation | null;
  alternatives: AmountOriginExplanation[];
  stopReason: AmountOriginStopReason;
  candidatesTruncated: boolean;
  solverDiagnostics: AmountOriginResult["diagnostics"]["solver"];
}

export async function orchestrateAmountOrigin(input: OrchestrateInput): Promise<AmountOriginResult> {
  const query = normalizeQuery(input.query);
  const config: AmountExplanationBudgetConfig = {
    ...DEFAULT_AMOUNT_EXPLANATION_BUDGETS,
    ...input.budgets,
  };
  const budgets = budgetsOf(query, config);
  const providers = (input.providers ?? defaultAmountEvidenceProviders())
    .filter((provider) => query.sourceKinds.has(provider.sourceKind));

  const inputFingerprint = canonicalFingerprint({
    targetAmount: formatMinorUnits(query.targetMinor, LEDGER_MONEY_SCALE),
    tolerance: budgets.tolerance,
    currencyCode: query.currencyCode,
    companyIds: query.companyIds,
    dateFrom: query.dateFrom,
    dateTo: query.dateTo,
    accountHints: query.accountHints,
    reportContext: query.reportContext,
    maxTerms: query.maxTerms,
    sourceKinds: [...query.sourceKinds].sort(),
    orchestratorVersion: input.orchestratorVersion,
  });

  const scope = await resolveScope(input.db, query);
  const windowUpperMinor = absMinor(query.targetMinor) + query.toleranceMinor;

  // 第 2/4 步：注册 provider 依序有界取候选（direct 证据与候选获取同批完成）。
  const providerDiagnostics: AmountOriginProviderDiagnostics[] = [];
  const collected: EvidenceCandidate[] = [];
  for (const provider of providers) {
    const outcome = await provider.collect({
      db: input.db,
      query,
      scope,
      windowUpperMinor,
      candidateLimit: config.providerCandidateLimit,
    });
    providerDiagnostics.push(outcome.diagnostics);
    collected.push(...outcome.candidates);
  }

  // 第 5 步：按稳定证据指纹去重。
  const candidates = dedupeEvidence(collected);
  const providersCapped = providerDiagnostics.some((entry) => entry.status === "capped");

  const finish = (result: PipelineResult): AmountOriginResult => {
    const outputFingerprint = canonicalFingerprint({
      status: result.status,
      method: result.method,
      targetAmount: formatMinorUnits(query.targetMinor, LEDGER_MONEY_SCALE),
      explainedAmount: result.best?.explainedAmount ?? null,
      residualAmount: result.best?.residualAmount ?? null,
      bestEvidence: result.best?.evidence.map((evidence) => evidence.evidenceId) ?? null,
      alternatives: result.alternatives.map((alternative) => alternative.evidence.map((evidence) => evidence.evidenceId)),
      candidatesTruncated: result.candidatesTruncated,
      budgets,
      versions: {
        orchestrator: input.orchestratorVersion,
        solverAdapterId: result.solverDiagnostics ? input.solver.id : null,
        solverAdapterVersion: result.solverDiagnostics ? input.solver.version : null,
      },
      stopReason: result.stopReason,
    });
    return {
      targetAmount: formatMinorUnits(query.targetMinor, LEDGER_MONEY_SCALE),
      explainedAmount: result.best?.explainedAmount ?? formatMinorUnits(0n, LEDGER_MONEY_SCALE),
      residualAmount: result.best?.residualAmount ?? formatMinorUnits(query.targetMinor, LEDGER_MONEY_SCALE),
      status: result.status,
      method: result.method,
      accountingTreatment: "not_evaluated",
      bestExplanation: result.best,
      alternatives: result.alternatives,
      candidatesTruncated: result.candidatesTruncated,
      budgets,
      versions: {
        orchestrator: input.orchestratorVersion,
        solverAdapterId: result.solverDiagnostics ? input.solver.id : null,
        solverAdapterVersion: result.solverDiagnostics ? input.solver.version : null,
      },
      fingerprints: { input: inputFingerprint, output: outputFingerprint },
      stopReason: result.stopReason,
      diagnostics: {
        scopeQueryCount: scope.queryCount,
        providers: providerDiagnostics,
        solver: result.solverDiagnostics,
      },
    };
  };

  // 第 2 步短路：恰好一个 direct 精确命中 → direct/exact；多个并列 → ambiguous。
  const directExact = candidates.filter((candidate) => candidate.amountMinor === query.targetMinor);
  if (directExact.length > 0) {
    const explanations: ExplanationToRank[] = directExact.map((candidate) => ({
      evidence: [candidate],
      residualMinor: 0n,
    }));
    const { ranked, ambiguous } = rankExplanations(explanations, query);
    const best = toPublicExplanation(ranked[0]!, "direct");
    return finish({
      status: ambiguous ? "ambiguous" : "exact",
      method: "direct",
      best,
      alternatives: ranked.slice(1, MAX_ALTERNATIVES + 1).map((entry) => toPublicExplanation(entry, "direct")),
      stopReason: "direct_hit",
      candidatesTruncated: providersCapped,
      solverDiagnostics: null,
    });
  }

  if (candidates.length === 0) {
    return finish({
      status: "not_found",
      method: null,
      best: null,
      alternatives: [],
      stopReason: "no_candidates",
      candidatesTruncated: providersCapped,
      solverDiagnostics: null,
    });
  }

  // 第 6 步：pre-rank + cap；第 7 步：只经注入的 solver 求组合。
  const { selected, truncated: preRankTruncated } = preRankAndCap(candidates, query, config.maxCandidatesAfterFilter);
  const candidatesTruncated = providersCapped || preRankTruncated;
  const solveResult = await input.solver.solve({
    targetMinor: query.targetMinor,
    toleranceMinor: query.toleranceMinor,
    candidates: selected.map((candidate, stableOrder) => ({
      key: candidate.evidence.evidenceId,
      amountMinor: candidate.amountMinor,
      stableOrder,
    })),
    minTerms: 1,
    maxTerms: query.maxTerms,
    maxSolutions: config.maxSolutions,
    maxVisitedStates: config.maxVisitedStates,
    deadlineMs: config.deadlineMs,
  });

  const solverDiagnostics: NonNullable<PipelineResult["solverDiagnostics"]> = {
    candidateCount: solveResult.stats.candidateCount,
    visitedStates: solveResult.stats.visitedStates,
    solutionCount: solveResult.solutions.length,
    truncated: solveResult.truncated,
  };

  const candidateById = new Map(selected.map((candidate) => [candidate.evidence.evidenceId, candidate]));
  const explanations: ExplanationToRank[] = solveResult.solutions.map((solution) => ({
    evidence: solution.candidateKeys.map((key) => {
      const candidate = candidateById.get(key);
      if (!candidate) throw new Error(`solver returned unknown candidate key: ${key}`);
      return candidate;
    }),
    residualMinor: solution.residualMinor,
  }));
  const { ranked, ambiguous } = rankExplanations(explanations, query);
  const bestRanked = ranked[0];

  if (!bestRanked) {
    // 预算耗尽不得伪装成 not_found（计划 §4.1 不变量）。
    const truncated = candidatesTruncated || solveResult.truncated;
    return finish({
      status: truncated ? "truncated" : "not_found",
      method: null,
      best: null,
      alternatives: [],
      stopReason: solveResult.truncated ? solveResult.stopReason : "no_solution",
      candidatesTruncated,
      solverDiagnostics,
    });
  }

  const best = toPublicExplanation(bestRanked, "combination");
  const bestResidual = absMinor(bestRanked.explanation.residualMinor);
  let status: AmountOriginStatus;
  if (bestResidual === 0n) {
    status = ambiguous ? "ambiguous" : "exact";
  } else if (bestResidual <= query.toleranceMinor) {
    status = ambiguous ? "ambiguous" : "near";
  } else {
    // solver 合同保证返回解的 |residual| ≤ tolerance；防御性兜底。
    status = candidatesTruncated || solveResult.truncated ? "truncated" : "not_found";
  }

  return finish({
    status,
    method: status === "not_found" || status === "truncated" ? null : "combination",
    best: status === "not_found" || status === "truncated" ? null : best,
    alternatives: status === "not_found" || status === "truncated"
      ? []
      : ranked.slice(1, MAX_ALTERNATIVES + 1).map((entry) => toPublicExplanation(entry, "combination")),
    stopReason: solveResult.stopReason,
    candidatesTruncated,
    solverDiagnostics,
  });
}
