/**
 * Replaceable combination solver contract.
 *
 * The contract is pure Platform infrastructure: signed minor-unit `bigint`
 * arithmetic, opaque candidate keys, and deterministic budgets. It contains
 * no Finance semantics (no company, account, voucher, report, or workbook
 * concepts); callers own candidate acquisition and result interpretation.
 *
 * Invariants every adapter must honor:
 * - All money values are signed minor units (`bigint`); no floating-point
 *   arithmetic is permitted inside the contract.
 * - Candidate keys are opaque and unique; `stableOrder` is the caller-owned
 *   deterministic tiebreaker.
 * - Solutions are ordered deterministically by absolute residual, then term
 *   count, then candidate `stableOrder`, then keys.
 * - Budget exhaustion returns partial results with `truncated: true`; it
 *   must never masquerade as an exhaustive negative result.
 */

export type CombinationCandidate = {
  key: string;
  amountMinor: bigint;
  stableOrder: number;
};

export type CombinationSolveRequest = {
  targetMinor: bigint;
  toleranceMinor: bigint;
  candidates: readonly CombinationCandidate[];
  minTerms: number;
  maxTerms: number;
  maxSolutions: number;
  maxVisitedStates: number;
  deadlineMs: number;
};

export type CombinationSolution = {
  candidateKeys: readonly string[];
  /** Sum of the chosen candidate amounts, in signed minor units. */
  sumMinor: bigint;
  /** `targetMinor - sumMinor`; zero means an exact solution. */
  residualMinor: bigint;
};

export type CombinationSolveStopReason = "complete" | "deadline" | "state_budget" | "candidate_limit";

export type CombinationSolveResult = {
  adapterId: string;
  adapterVersion: string;
  /** True only when at least one returned solution has zero residual. */
  exact: boolean;
  /** True when any budget or hard cap stopped the search early. */
  truncated: boolean;
  solutions: readonly CombinationSolution[];
  stats: {
    /** Candidates actually searched, after adapter hard caps. */
    candidateCount: number;
    visitedStates: number;
    elapsedMs: number;
  };
  stopReason: CombinationSolveStopReason;
};

export interface CombinationSolverAdapter {
  readonly id: string;
  readonly version: string;
  solve(request: CombinationSolveRequest): Promise<CombinationSolveResult>;
}

/** Thrown when a solve request is malformed; adapters fail closed. */
export class CombinationSolveRequestError extends Error {
  readonly name = "CombinationSolveRequestError";
}
