import {
  CombinationSolveRequestError,
  type CombinationCandidate,
  type CombinationSolveRequest,
  type CombinationSolveResult,
  type CombinationSolveStopReason,
  type CombinationSolverAdapter,
} from "./types";

/** Hard caps every caller request is clamped to; the adapter fails closed beyond them. */
export const COMBINATION_SOLVER_HARD_MAX_CANDIDATES = 60;
export const COMBINATION_SOLVER_HARD_MAX_TERMS = 6;

const DEADLINE_CHECK_INTERVAL = 128;

export interface BoundedReferenceCombinationSolverOptions {
  /** Clock override for deterministic deadline tests. Defaults to Date.now. */
  now?: () => number;
}

type RankedSolution = {
  candidateKeys: readonly string[];
  stableOrders: readonly number[];
  sumMinor: bigint;
  residualMinor: bigint;
};

/**
 * Bounded branch-and-bound reference implementation.
 *
 * Search is a depth-first enumeration over candidates sorted by
 * (`stableOrder`, `key`), pruning branches whose remaining achievable sum
 * range cannot reach the target window. Worst case is C(60, 6) states, so
 * the caller's `maxVisitedStates`/`deadlineMs` budgets are enforced at every
 * node and partial results are returned with `truncated: true`.
 *
 * The contract and its tests are the stable surface; the algorithm class is
 * not. A future dpss/WASM adapter only needs to satisfy the same contract.
 */
export class BoundedReferenceCombinationSolver implements CombinationSolverAdapter {
  readonly id = "platform.combination-solver.bounded-reference";
  readonly version = "1.0.0";

  private readonly now: () => number;

  constructor(options: BoundedReferenceCombinationSolverOptions = {}) {
    this.now = options.now ?? (() => Date.now());
  }

  // Declared async so fail-closed validation errors surface as rejections, not sync throws.
  async solve(request: CombinationSolveRequest): Promise<CombinationSolveResult> {
    const startedAt = this.now();
    const candidates = prepareCandidates(request);
    const maxTerms = Math.min(request.maxTerms, COMBINATION_SOLVER_HARD_MAX_TERMS);
    const capsExceeded =
      request.candidates.length > COMBINATION_SOLVER_HARD_MAX_CANDIDATES
      || request.maxTerms > COMBINATION_SOLVER_HARD_MAX_TERMS;

    const n = candidates.length;
    const target = request.targetMinor;
    const tolerance = request.toleranceMinor;
    const lowerBound = target - tolerance;
    const upperBound = target + tolerance;

    // suffixMin[i]/suffixMax[i]: min/max amount among candidates[i..n-1],
    // used for branch-and-bound pruning over the remaining window.
    const suffixMin = new Array<bigint>(n + 1).fill(0n);
    const suffixMax = new Array<bigint>(n + 1).fill(0n);
    for (let i = n - 1; i >= 0; i -= 1) {
      const amount = candidates[i].amountMinor;
      suffixMin[i] = amount < suffixMin[i + 1] ? amount : suffixMin[i + 1];
      suffixMax[i] = amount > suffixMax[i + 1] ? amount : suffixMax[i + 1];
    }

    const solutions: RankedSolution[] = [];
    let visitedStates = 0;
    let searchStop: "complete" | "deadline" | "state_budget" = "complete";
    let solutionCapReached = false;
    const chosen: CombinationCandidate[] = [];

    const recordIfSolution = (sum: bigint, terms: number) => {
      if (terms < request.minTerms) return;
      if (sum < lowerBound || sum > upperBound) return;
      solutions.push({
        candidateKeys: chosen.map((candidate) => candidate.key),
        stableOrders: chosen.map((candidate) => candidate.stableOrder),
        sumMinor: sum,
        residualMinor: target - sum,
      });
      if (solutions.length >= request.maxSolutions) solutionCapReached = true;
    };

    const shouldStop = () => searchStop !== "complete" || solutionCapReached;

    const dfs = (nextIndex: number, termsUsed: number, sum: bigint): void => {
      if (shouldStop()) return;
      visitedStates += 1;
      if (visitedStates >= request.maxVisitedStates) {
        searchStop = "state_budget";
        return;
      }
      if (visitedStates % DEADLINE_CHECK_INTERVAL === 0 && this.now() - startedAt >= request.deadlineMs) {
        searchStop = "deadline";
        return;
      }
      if (termsUsed >= maxTerms || nextIndex >= n) return;

      const remainingPicks = Math.min(maxTerms - termsUsed, n - nextIndex);
      // Prune when even the extreme achievable sums cannot reach the window.
      if (sum + BigInt(remainingPicks) * suffixMax[nextIndex] < lowerBound) return;
      if (sum + BigInt(remainingPicks) * suffixMin[nextIndex] > upperBound) return;

      for (let i = nextIndex; i < n; i += 1) {
        const candidate = candidates[i];
        chosen.push(candidate);
        const nextSum = sum + candidate.amountMinor;
        recordIfSolution(nextSum, termsUsed + 1);
        if (!solutionCapReached) dfs(i + 1, termsUsed + 1, nextSum);
        chosen.pop();
        if (shouldStop()) return;
      }
    };

    if (request.minTerms === 0) {
      recordIfSolution(0n, 0);
    }
    if (!solutionCapReached) {
      dfs(0, 0, 0n);
    }

    solutions.sort(compareRankedSolutions);

    const exact = solutions.some((solution) => solution.residualMinor === 0n);
    const stopReason: CombinationSolveStopReason =
      searchStop !== "complete" ? searchStop : capsExceeded ? "candidate_limit" : "complete";
    const truncated = stopReason !== "complete";

    return {
      adapterId: this.id,
      adapterVersion: this.version,
      exact,
      truncated,
      solutions: solutions.map((solution) => ({
        candidateKeys: solution.candidateKeys,
        sumMinor: solution.sumMinor,
        residualMinor: solution.residualMinor,
      })),
      stats: {
        candidateCount: n,
        visitedStates,
        elapsedMs: Math.max(0, this.now() - startedAt),
      },
      stopReason,
    };
  }
}

function prepareCandidates(request: CombinationSolveRequest): CombinationCandidate[] {
  validateRequest(request);
  const sorted = [...request.candidates].sort((a, b) =>
    a.stableOrder === b.stableOrder ? (a.key < b.key ? -1 : a.key > b.key ? 1 : 0) : a.stableOrder - b.stableOrder,
  );
  return sorted.slice(0, COMBINATION_SOLVER_HARD_MAX_CANDIDATES);
}

function compareRankedSolutions(a: RankedSolution, b: RankedSolution): number {
  const residualA = absBigInt(a.residualMinor);
  const residualB = absBigInt(b.residualMinor);
  if (residualA !== residualB) return residualA < residualB ? -1 : 1;
  if (a.stableOrders.length !== b.stableOrders.length) return a.stableOrders.length - b.stableOrders.length;
  for (let i = 0; i < a.stableOrders.length; i += 1) {
    if (a.stableOrders[i] !== b.stableOrders[i]) return a.stableOrders[i] - b.stableOrders[i];
  }
  for (let i = 0; i < a.candidateKeys.length; i += 1) {
    if (a.candidateKeys[i] !== b.candidateKeys[i]) return a.candidateKeys[i] < b.candidateKeys[i] ? -1 : 1;
  }
  return 0;
}

function absBigInt(value: bigint): bigint {
  return value < 0n ? -value : value;
}

function validateRequest(request: CombinationSolveRequest): void {
  const fail = (message: string): never => {
    throw new CombinationSolveRequestError(message);
  };
  if (typeof request.targetMinor !== "bigint" || typeof request.toleranceMinor !== "bigint") {
    fail("targetMinor and toleranceMinor must be bigint minor units.");
  }
  if (request.toleranceMinor < 0n) fail("toleranceMinor must be >= 0.");
  for (const candidate of request.candidates) {
    if (typeof candidate.amountMinor !== "bigint") fail("candidate amountMinor must be a bigint.");
    if (typeof candidate.key !== "string" || candidate.key.length === 0) fail("candidate key must be a non-empty string.");
    if (!Number.isInteger(candidate.stableOrder)) fail("candidate stableOrder must be an integer.");
  }
  const keys = new Set<string>();
  for (const candidate of request.candidates) {
    if (keys.has(candidate.key)) fail(`duplicate candidate key "${candidate.key}".`);
    keys.add(candidate.key);
  }
  for (const [field, value] of [
    ["minTerms", request.minTerms],
    ["maxTerms", request.maxTerms],
    ["maxSolutions", request.maxSolutions],
    ["maxVisitedStates", request.maxVisitedStates],
  ] as const) {
    if (!Number.isInteger(value)) fail(`${field} must be an integer.`);
  }
  if (request.minTerms < 0) fail("minTerms must be >= 0.");
  if (request.maxTerms < 1) fail("maxTerms must be >= 1.");
  if (request.minTerms > request.maxTerms) fail("minTerms must be <= maxTerms.");
  if (request.maxSolutions < 1) fail("maxSolutions must be >= 1.");
  if (request.maxVisitedStates < 1) fail("maxVisitedStates must be >= 1.");
  if (!Number.isFinite(request.deadlineMs) || request.deadlineMs <= 0) fail("deadlineMs must be > 0.");
}
