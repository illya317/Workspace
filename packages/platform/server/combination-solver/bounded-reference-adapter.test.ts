import assert from "node:assert/strict";
import test from "node:test";
import {
  BoundedReferenceCombinationSolver,
  COMBINATION_SOLVER_HARD_MAX_CANDIDATES,
  COMBINATION_SOLVER_HARD_MAX_TERMS,
} from "./bounded-reference-adapter";
import { createCombinationSolver } from "./factory";
import {
  CombinationSolveRequestError,
  type CombinationCandidate,
  type CombinationSolveRequest,
  type CombinationSolveResult,
  type CombinationSolverAdapter,
} from "./types";

function candidate(key: string, amountMinor: bigint, stableOrder: number): CombinationCandidate {
  return { key, amountMinor, stableOrder };
}

function request(overrides: Partial<CombinationSolveRequest> = {}): CombinationSolveRequest {
  return {
    targetMinor: 0n,
    toleranceMinor: 0n,
    candidates: [],
    minTerms: 1,
    maxTerms: 6,
    maxSolutions: 20,
    maxVisitedStates: 250_000,
    deadlineMs: 1_000,
    ...overrides,
  };
}

function deterministicShape(result: CombinationSolveResult) {
  const { stats, ...rest } = result;
  const { elapsedMs, ...restStats } = stats;
  void elapsedMs;
  return { ...rest, stats: restStats };
}

test("empty candidate input completes with no solutions and no truncation", async () => {
  const solver = createCombinationSolver();
  const result = await solver.solve(request());
  assert.equal(result.stopReason, "complete");
  assert.equal(result.truncated, false);
  assert.equal(result.exact, false);
  assert.deepEqual(result.solutions, []);
  assert.equal(result.stats.candidateCount, 0);
  assert.equal(result.stats.visitedStates, 1);
});

test("zero-term request can solve a zero target with the empty combination", async () => {
  const solver = createCombinationSolver();
  const result = await solver.solve(
    request({ minTerms: 0, candidates: [candidate("a", 5n, 0)] }),
  );
  assert.equal(result.exact, true);
  assert.deepEqual(result.solutions[0], { candidateKeys: [], sumMinor: 0n, residualMinor: 0n });
});

test("single-term exact solution is found and reported", async () => {
  const solver = createCombinationSolver();
  const result = await solver.solve(
    request({
      targetMinor: 700n,
      candidates: [candidate("a", 100n, 0), candidate("b", 700n, 1), candidate("c", 300n, 2)],
    }),
  );
  assert.equal(result.exact, true);
  assert.equal(result.stopReason, "complete");
  assert.deepEqual(result.solutions[0], { candidateKeys: ["b"], sumMinor: 700n, residualMinor: 0n });
});

test("exact solutions with 2 through 6 terms are found", async () => {
  const solver = createCombinationSolver();
  for (const terms of [2, 3, 4, 5, 6]) {
    const candidates = Array.from({ length: terms }, (_, index) =>
      candidate(`k${index}`, BigInt(index + 1) * 10n, index),
    );
    const target = candidates.reduce((sum, item) => sum + item.amountMinor, 0n);
    const result = await solver.solve(request({ targetMinor: target, candidates }));
    assert.equal(result.exact, true, `terms=${terms}`);
    const best = result.solutions[0];
    assert.equal(best.residualMinor, 0n);
    assert.equal(best.candidateKeys.length, terms);
  }
});

test("near solutions inside tolerance are returned without claiming exactness", async () => {
  const solver = createCombinationSolver();
  const result = await solver.solve(
    request({
      targetMinor: 1_000n,
      toleranceMinor: 50n,
      candidates: [candidate("a", 600n, 0), candidate("b", 420n, 1), candidate("c", 10n, 2)],
    }),
  );
  assert.equal(result.exact, false);
  assert.equal(result.truncated, false);
  assert.equal(result.solutions.length > 0, true);
  const best = result.solutions[0];
  assert.equal(best.residualMinor, -20n);
  assert.deepEqual(best.candidateKeys, ["a", "b"]);
});

test("negative amounts combine to negative targets", async () => {
  const solver = createCombinationSolver();
  const result = await solver.solve(
    request({
      targetMinor: -12_124_40n,
      candidates: [
        candidate("a", 500n, 0),
        candidate("b", -12_000_00n, 1),
        candidate("c", -124_40n, 2),
      ],
    }),
  );
  assert.equal(result.exact, true);
  assert.deepEqual(result.solutions[0].candidateKeys, ["b", "c"]);
  assert.equal(result.solutions[0].sumMinor, -12_124_40n);
});

test("duplicate amounts with distinct keys produce distinct deterministic solutions", async () => {
  const solver = createCombinationSolver();
  const result = await solver.solve(
    request({
      targetMinor: 100n,
      candidates: [candidate("a", 100n, 0), candidate("b", 100n, 1)],
      maxSolutions: 5,
    }),
  );
  assert.equal(result.exact, true);
  assert.equal(result.solutions.length, 2);
  assert.deepEqual(result.solutions[0].candidateKeys, ["a"]);
  assert.deepEqual(result.solutions[1].candidateKeys, ["b"]);
});

test("solutions are ordered by absolute residual, term count, stable order, then keys", async () => {
  const solver = createCombinationSolver();
  const result = await solver.solve(
    request({
      targetMinor: 100n,
      toleranceMinor: 10n,
      maxSolutions: 20,
      candidates: [
        candidate("near-2term-a", 55n, 0),
        candidate("near-2term-b", 50n, 1),
        candidate("exact-3term-a", 33n, 2),
        candidate("exact-3term-b", 35n, 3),
        candidate("exact-3term-c", 32n, 4),
        candidate("exact-1term", 100n, 5),
      ],
    }),
  );
  const ordered = result.solutions.map((solution) => solution.candidateKeys);
  // residual 0 with 1 term, residual 0 with 3 terms, residual -5 with 2 terms, residual 10 with 2 terms.
  assert.deepEqual(ordered, [
    ["exact-1term"],
    ["exact-3term-a", "exact-3term-b", "exact-3term-c"],
    ["near-2term-a", "near-2term-b"],
    ["near-2term-a", "exact-3term-b"],
  ]);
});

test("shuffled candidate arrays with the same stable orders produce identical results", async () => {
  const solver = createCombinationSolver();
  const candidates = Array.from({ length: 12 }, (_, index) =>
    candidate(`k${index}`, BigInt((index * 37) % 11) * 10n - 50n, index),
  );
  const shuffled = [...candidates].reverse();
  const base = await solver.solve(request({ targetMinor: 40n, toleranceMinor: 5n, candidates }));
  const rerun = await solver.solve(request({ targetMinor: 40n, toleranceMinor: 5n, candidates: shuffled }));
  assert.deepEqual(deterministicShape(rerun), deterministicShape(base));
});

test("state budget exhaustion returns partial results marked truncated, never a silent negative", async () => {
  const solver = createCombinationSolver();
  const candidates = Array.from({ length: 30 }, (_, index) =>
    candidate(`k${index}`, BigInt(index + 1) * 7n, index),
  );
  const result = await solver.solve(
    request({ targetMinor: 900n, toleranceMinor: 3n, candidates, maxVisitedStates: 50 }),
  );
  assert.equal(result.stopReason, "state_budget");
  assert.equal(result.truncated, true);
  assert.equal(result.stats.visitedStates <= 50, true);
  // Partial solutions found before the budget hit remain valid evidence.
  for (const solution of result.solutions) {
    assert.ok(solution.residualMinor >= -3n && solution.residualMinor <= 3n);
  }
});

test("deadline exhaustion returns partial results marked truncated with deadline stop reason", async () => {
  let tick = 0;
  const solver = new BoundedReferenceCombinationSolver({ now: () => (tick += 1) });
  const candidates = Array.from({ length: 40 }, (_, index) =>
    candidate(`k${index}`, BigInt(index + 3) * 11n, index),
  );
  const result = await solver.solve(
    request({ targetMinor: 1_000n, toleranceMinor: 1n, candidates, maxSolutions: 100_000, deadlineMs: 5 }),
  );
  assert.equal(result.stopReason, "deadline");
  assert.equal(result.truncated, true);
  assert.equal(result.exact, false);
});

test("candidate hard cap truncates input fail-closed and reports candidate_limit", async () => {
  const solver = createCombinationSolver();
  const candidates = Array.from(
    { length: COMBINATION_SOLVER_HARD_MAX_CANDIDATES + 5 },
    (_, index) => candidate(`k${index}`, 1n, index),
  );
  const result = await solver.solve(request({ targetMinor: 3n, candidates }));
  assert.equal(result.stopReason, "candidate_limit");
  assert.equal(result.truncated, true);
  assert.equal(result.stats.candidateCount, COMBINATION_SOLVER_HARD_MAX_CANDIDATES);
  assert.equal(result.exact, true);
});

test("term hard cap clamps requests above six terms and reports candidate_limit", async () => {
  const solver = createCombinationSolver();
  const candidates = Array.from({ length: 8 }, (_, index) => candidate(`k${index}`, 10n, index));
  const result = await solver.solve(request({ targetMinor: 70n, maxTerms: 8, candidates }));
  assert.equal(result.stopReason, "candidate_limit");
  assert.equal(result.truncated, true);
  assert.equal(result.exact, false);
  for (const solution of result.solutions) {
    assert.ok(solution.candidateKeys.length <= COMBINATION_SOLVER_HARD_MAX_TERMS);
  }
});

test("malformed requests fail closed", async () => {
  const solver = createCombinationSolver();
  await assert.rejects(
    async () => solver.solve(request({ candidates: [candidate("a", 1n, 0), candidate("a", 2n, 1)] })),
    CombinationSolveRequestError,
  );
  await assert.rejects(async () => solver.solve(request({ minTerms: 3, maxTerms: 2 })), CombinationSolveRequestError);
  await assert.rejects(async () => solver.solve(request({ toleranceMinor: -1n })), CombinationSolveRequestError);
  await assert.rejects(async () => solver.solve(request({ maxSolutions: 0 })), CombinationSolveRequestError);
  await assert.rejects(
    async () => solver.solve(request({ candidates: [{ key: "f", amountMinor: 1.5 as unknown as bigint, stableOrder: 0 }] })),
    CombinationSolveRequestError,
  );
});

test("factory injects a fake adapter without changing callers", async () => {
  const fake: CombinationSolverAdapter = {
    id: "fake-solver",
    version: "9.9.9",
    solve: (input) =>
      Promise.resolve({
        adapterId: "fake-solver",
        adapterVersion: "9.9.9",
        exact: true,
        truncated: false,
        solutions: [{ candidateKeys: ["x"], sumMinor: input.targetMinor, residualMinor: 0n }],
        stats: { candidateCount: input.candidates.length, visitedStates: 0, elapsedMs: 0 },
        stopReason: "complete",
      }),
  };
  const solver = createCombinationSolver({ adapter: fake });
  const result = await solver.solve(request({ targetMinor: 42n }));
  assert.equal(result.adapterId, "fake-solver");
  assert.equal(result.adapterVersion, "9.9.9");
  assert.deepEqual(result.solutions[0].candidateKeys, ["x"]);
});

test("reference adapter reports id, version, and run stats", async () => {
  const solver = createCombinationSolver();
  assert.equal(solver.id, "platform.combination-solver.bounded-reference");
  assert.equal(typeof solver.version, "string");
  const result = await solver.solve(
    request({ targetMinor: 30n, candidates: [candidate("a", 10n, 0), candidate("b", 20n, 1)] }),
  );
  assert.equal(result.adapterId, solver.id);
  assert.equal(result.adapterVersion, solver.version);
  assert.equal(result.stats.candidateCount, 2);
  assert.equal(result.stats.visitedStates > 0, true);
  assert.equal(typeof result.stats.elapsedMs, "number");
});
