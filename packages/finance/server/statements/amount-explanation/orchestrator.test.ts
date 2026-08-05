import assert from "node:assert/strict";
import test from "node:test";

import type {
  CombinationSolveRequest,
  CombinationSolveResult,
  CombinationSolverAdapter,
} from "@workspace/platform/server/combination-solver";
import { createCombinationSolver } from "@workspace/platform/server/combination-solver";
import type { AmountOriginQuery, EvidenceRef } from "@workspace/finance/types/statement-explanation";

import type { AmountExplanationDb } from "./db";
import { orchestrateAmountOrigin } from "./orchestrator";
import type { AmountEvidenceProvider, EvidenceCandidate } from "./providers/provider";

const ORCHESTRATOR_VERSION = "finance-amount-explanation-orchestrator-v1-test";

function makeCandidate(evidenceId: string, amountMinor: bigint, overrides: Partial<EvidenceCandidate> = {}): EvidenceCandidate {
  const evidence: EvidenceRef = {
    evidenceId,
    sourceKind: "voucherLine",
    sourceRecordId: `voucherItem:${evidenceId}`,
    sourceFingerprint: evidenceId,
    amount: "0.00",
    currencyCode: "CNY",
    company: { id: 1, code: "C001", name: "示例公司甲" },
    date: "2024-01-15",
    period: { year: 2024, month: 1 },
    account: { id: 55, code: "151101", name: "测试科目A" },
    voucher: null,
    consolidation: null,
    workbook: null,
    translation: null,
    label: evidenceId,
    deepLink: null,
  };
  return {
    evidence,
    amountMinor,
    companyId: 1,
    accountCode: "151101",
    periodKey: "2024-01",
    lineCode: null,
    completeness: 3,
    providerOrder: 0,
    ...overrides,
  };
}

function fakeProvider(candidates: EvidenceCandidate[]): AmountEvidenceProvider {
  return {
    sourceKind: "voucherLine",
    collect: async () => ({
      candidates: candidates.map((candidate, index) => ({ ...candidate, providerOrder: index })),
      diagnostics: {
        sourceKind: "voucherLine",
        status: "ok",
        queryCount: 1,
        fetchedCount: candidates.length,
        candidateCount: candidates.length,
      },
    }),
  };
}

function fakeDb(): AmountExplanationDb {
  return {
    $queryRaw: async () => [],
    company: { findMany: async () => [{ id: 1, code: "C001", description: "示例公司甲" }] },
    financePeriod: {
      findMany: async () => [{ id: 101, year: 2024, month: 1, companyCode: "C001" }],
    },
    financeConsolidationBatch: { findFirst: async () => null, findMany: async () => [] },
    financeConsolidationOutputSnapshot: { findFirst: async () => null, findMany: async () => [] },
    financeConsolidationMatchSource: { findMany: async () => [] },
    reclassResult: { findMany: async () => [] },
  } as unknown as AmountExplanationDb;
}

function fakeSolver(
  solve: (request: CombinationSolveRequest) => CombinationSolveResult,
): CombinationSolverAdapter {
  return { id: "fake-solver", version: "test-1", solve: async (request) => solve(request) };
}

function emptySolveResult(overrides: Partial<CombinationSolveResult> = {}): CombinationSolveResult {
  return {
    adapterId: "fake-solver",
    adapterVersion: "test-1",
    exact: false,
    truncated: false,
    solutions: [],
    stats: { candidateCount: 0, visitedStates: 0, elapsedMs: 0 },
    stopReason: "complete",
    ...overrides,
  };
}

function adHocQuery(targetAmount: string, overrides: Partial<AmountOriginQuery> = {}): AmountOriginQuery {
  return {
    targetAmount,
    currencyCode: "CNY",
    companyIds: [1],
    dateFrom: "2024-01-01",
    dateTo: "2024-12-31",
    ...overrides,
  };
}

async function run(args: {
  query?: AmountOriginQuery;
  candidates?: EvidenceCandidate[];
  solver?: CombinationSolverAdapter;
  budgets?: { maxCandidatesAfterFilter?: number };
}) {
  return orchestrateAmountOrigin({
    query: args.query ?? adHocQuery("100.00"),
    db: fakeDb(),
    solver: args.solver ?? fakeSolver(() => emptySolveResult()),
    providers: [fakeProvider(args.candidates ?? [])],
    budgets: args.budgets,
    orchestratorVersion: ORCHESTRATOR_VERSION,
  });
}

test("direct exact hit short-circuits without invoking the solver", async () => {
  const solver = fakeSolver(() => {
    throw new Error("solver must not be called for a direct hit");
  });
  const result = await run({
    candidates: [makeCandidate("ev_a", 10000n), makeCandidate("ev_b", 5000n)],
    solver,
  });
  assert.equal(result.status, "exact");
  assert.equal(result.method, "direct");
  assert.equal(result.stopReason, "direct_hit");
  assert.equal(result.explainedAmount, "100.00");
  assert.equal(result.residualAmount, "0.00");
  assert.equal(result.bestExplanation?.evidence[0]?.evidenceId, "ev_a");
  assert.equal(result.accountingTreatment, "not_evaluated");
  assert.equal(result.diagnostics.solver, null);
});

test("multiple exact direct hits report ambiguous", async () => {
  const result = await run({
    candidates: [
      makeCandidate("ev_a", 10000n),
      makeCandidate("ev_b", 10000n),
    ],
  });
  assert.equal(result.status, "ambiguous");
  assert.equal(result.method, "direct");
  assert.equal(result.alternatives.length, 1);
});

test("combination path ranks solver solutions and reports versions", async () => {
  let seenRequest: CombinationSolveRequest | null = null;
  const solver = fakeSolver((request) => {
    seenRequest = request;
    return emptySolveResult({
      exact: true,
      solutions: [
        { candidateKeys: ["ev_60", "ev_40"], sumMinor: 10000n, residualMinor: 0n },
        { candidateKeys: ["ev_70", "ev_30"], sumMinor: 10000n, residualMinor: 0n },
      ],
      stats: { candidateCount: 3, visitedStates: 8, elapsedMs: 1 },
    });
  });
  const result = await run({
    solver,
    candidates: [
      makeCandidate("ev_60", 6000n, { completeness: 4 }),
      makeCandidate("ev_40", 4000n, { completeness: 4 }),
      makeCandidate("ev_70", 7000n),
      makeCandidate("ev_30", 3000n),
    ],
  });
  assert.equal(result.status, "exact");
  assert.equal(result.method, "combination");
  assert.equal(result.explainedAmount, "100.00");
  assert.equal(result.versions.solverAdapterId, "fake-solver");
  assert.equal(result.versions.solverAdapterVersion, "test-1");
  assert.equal(result.versions.orchestrator, ORCHESTRATOR_VERSION);
  assert.equal(result.diagnostics.solver?.solutionCount, 2);
  // 完整性更高的解排在前面（其余排序键相等）。
  assert.deepEqual(
    result.bestExplanation?.evidence.map((evidence) => evidence.evidenceId),
    ["ev_60", "ev_40"],
  );
  assert.equal(seenRequest !== null, true);
  assert.equal(seenRequest!.targetMinor, 10000n);
  assert.equal(seenRequest!.maxTerms, 6);
  assert.equal(seenRequest!.maxSolutions, 20);
  assert.equal(seenRequest!.maxVisitedStates, 250_000);
  assert.equal(seenRequest!.deadlineMs, 1_000);
});

test("near solution within tolerance reports near", async () => {
  const solver = fakeSolver(() => emptySolveResult({
    solutions: [{ candidateKeys: ["ev_a"], sumMinor: 9998n, residualMinor: 2n }],
  }));
  const result = await run({
    query: adHocQuery("100.00", { tolerance: "0.05" }),
    solver,
    candidates: [makeCandidate("ev_a", 9998n)],
  });
  assert.equal(result.status, "near");
  assert.equal(result.residualAmount, "0.02");
});

test("budget exhaustion reports truncated, never not_found", async () => {
  const solver = fakeSolver(() => emptySolveResult({
    truncated: true,
    stopReason: "deadline",
  }));
  const result = await run({ solver, candidates: [makeCandidate("ev_a", 3000n)] });
  assert.equal(result.status, "truncated");
  assert.equal(result.stopReason, "deadline");
  assert.equal(result.method, null);
});

test("no candidates reports not_found without solver involvement", async () => {
  const result = await run({ candidates: [] });
  assert.equal(result.status, "not_found");
  assert.equal(result.stopReason, "no_candidates");
});

test("candidate cap is enforced before the solver and reported", async () => {
  let seenRequest: CombinationSolveRequest | null = null;
  const solver = fakeSolver((request) => {
    seenRequest = request;
    return emptySolveResult({ truncated: false });
  });
  const result = await run({
    solver,
    budgets: { maxCandidatesAfterFilter: 2 },
    candidates: [
      makeCandidate("ev_a", 9000n),
      makeCandidate("ev_b", 8000n),
      makeCandidate("ev_c", 7000n),
    ],
  });
  assert.equal(result.candidatesTruncated, true);
  assert.equal(seenRequest!.candidates.length, 2);
  // pre-rank：|金额| 降序（其余键相等）。
  assert.deepEqual(seenRequest!.candidates.map((candidate) => candidate.key), ["ev_a", "ev_b"]);
  // 候选截断 + 无解：必须报 truncated，不得伪装成 not_found。
  assert.equal(result.status, "truncated");
});

test("duplicate evidence fingerprints are deduped before solving", async () => {
  let seenRequest: CombinationSolveRequest | null = null;
  const solver = fakeSolver((request) => {
    seenRequest = request;
    return emptySolveResult();
  });
  await run({
    solver,
    candidates: [makeCandidate("ev_same", 3000n), makeCandidate("ev_same", 3000n)],
  });
  assert.equal(seenRequest!.candidates.length, 1);
});

test("results are deterministic under shuffled provider emission order", async () => {
  const solver = fakeSolver(() => emptySolveResult({
    exact: true,
    solutions: [{ candidateKeys: ["ev_60", "ev_40"], sumMinor: 10000n, residualMinor: 0n }],
  }));
  const forward = await run({
    solver,
    candidates: [
      makeCandidate("ev_40", 4000n),
      makeCandidate("ev_60", 6000n),
      makeCandidate("ev_90", 9000n),
    ],
  });
  const shuffled = await run({
    solver,
    candidates: [
      makeCandidate("ev_90", 9000n),
      makeCandidate("ev_60", 6000n),
      makeCandidate("ev_40", 4000n),
    ],
  });
  assert.equal(forward.fingerprints.output, shuffled.fingerprints.output);
  assert.equal(forward.fingerprints.input, shuffled.fingerprints.input);
  assert.deepEqual(
    forward.bestExplanation?.evidence.map((evidence) => evidence.evidenceId),
    shuffled.bestExplanation?.evidence.map((evidence) => evidence.evidenceId),
  );
});

test("input fingerprint changes with the target amount", async () => {
  const first = await run({ query: adHocQuery("100.00") });
  const second = await run({ query: adHocQuery("100.01") });
  assert.notEqual(first.fingerprints.input, second.fingerprints.input);
});

test("query validation fails closed on out-of-range maxTerms", async () => {
  await assert.rejects(
    run({ query: adHocQuery("100.00", { maxTerms: 8 }) }),
    /maxTerms/,
  );
});

test("anonymized end-to-end combination fixture with the real bounded reference solver", async () => {
  // 通用匿名夹具：示例公司 C001、科目编码与凭证号均为虚构；金额为本测试自造。
  // 混合符号组合：60.00 + 55.00 - 20.00 + 5.00 = 100.00（桥 + 正/负调整项结构）。
  const result = await run({
    solver: createCombinationSolver(),
    candidates: [
      makeCandidate("ev_bridge", 6000n, { completeness: 4 }),
      makeCandidate("ev_adjust_a", 5500n),
      makeCandidate("ev_adjust_b", -2000n),
      makeCandidate("ev_adjust_c", 500n),
      makeCandidate("ev_unrelated", 9000n),
    ],
  });
  assert.equal(result.status, "exact");
  assert.equal(result.method, "combination");
  assert.equal(result.residualAmount, "0.00");
  assert.deepEqual(
    [...result.bestExplanation!.evidence.map((evidence) => evidence.evidenceId)].sort(),
    ["ev_adjust_a", "ev_adjust_b", "ev_adjust_c", "ev_bridge"],
  );
});

test("anonymized direct fixture preserves source sign end-to-end", async () => {
  const result = await run({
    query: adHocQuery("-9,876.54"),
    solver: createCombinationSolver(),
    candidates: [
      makeCandidate("ev_signed", -987654n),
      makeCandidate("ev_other", 5000n),
    ],
  });
  assert.equal(result.status, "exact");
  assert.equal(result.method, "direct");
  assert.equal(result.explainedAmount, "-9876.54");
  assert.equal(result.bestExplanation?.evidence[0]?.evidenceId, "ev_signed");
});
