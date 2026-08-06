import assert from "node:assert/strict";
import test from "node:test";

import type { AmountOriginQuery, AmountOriginResult } from "@workspace/finance/types/statement-explanation";

import {
  computeEntityComparisonTargetFingerprint,
  executeComparisonRun,
} from "./run-execution";
import { StatementComparisonStateError } from "./service";
import type { ComparisonRunExecutionDb } from "./run-execution";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * run 执行接线测试（Package 6）：注入 fake db / fake explain / fake 报表加载，
 * 不触真实 prisma。writeLog 记录所有写调用用于「不修改任何会计事实」回归。
 */

const COMPARISON_DELEGATES = [
  "financeStatementComparisonPackage",
  "financeStatementComparisonMapping",
  "financeStatementComparisonRun",
  "financeStatementComparisonLine",
];

function makeFakeDb() {
  const writeLog: string[] = [];
  const mappings: any[] = [];
  const runs: any[] = [];
  const lines: any[] = [];
  let runSeq = 1;

  const record = (model: string, method: string) => writeLog.push(`${model}.${method}`);

  const db: any = {
    systemConfig: {
      findUnique: async () => ({ value: "true" }),
    },
    company: {
      findUnique: async () => ({
        code: "02",
        financeCurrencyPolicy: { currency: { code: "CNY" } },
      }),
    },
    financeConsolidationOutputSnapshot: {
      findUnique: async () => null,
    },
    financeStatementComparisonPackage: {
      findUnique: async () => null,
      findMany: async () => [],
    },
    financeStatementComparisonMapping: {
      findUnique: async ({ where }: any) => mappings.find((m) => m.id === where.id) ?? null,
      updateMany: async ({ where, data }: any) => {
        record("financeStatementComparisonMapping", "updateMany");
        const mapping = mappings.find((m) => m.id === where.id && m.revision === where.revision);
        if (!mapping) return { count: 0 };
        if (data.status) mapping.status = data.status;
        if (data.revision?.increment) mapping.revision += data.revision.increment;
        return { count: 1 };
      },
    },
    financeStatementComparisonRun: {
      findUnique: async ({ where }: any) => runs.find((run) => run.id === where.id) ?? null,
      create: async ({ data }: any) => {
        record("financeStatementComparisonRun", "create");
        const run = { ...data, id: runSeq++ };
        runs.push(run);
        return { id: run.id };
      },
      update: async ({ where, data }: any) => {
        record("financeStatementComparisonRun", "update");
        const run = runs.find((entry) => entry.id === where.id);
        Object.assign(run, data);
        return run;
      },
    },
    financeStatementComparisonLine: {
      createMany: async ({ data }: any) => {
        record("financeStatementComparisonLine", "createMany");
        lines.push(...data);
        return { count: data.length };
      },
    },
    $transaction: async (fn: (tx: any) => Promise<void>) => fn(db),
  };

  return { db: db as ComparisonRunExecutionDb, writeLog, mappings, runs, lines };
}

function workbookSnapshot() {
  return {
    dto: {
      sheets: [{
        name: "资产负债表",
        cells: [{ a1: "C5", value: 100, cachedValue: 100 }],
      }],
    },
    recalculation: { adapterId: "hf-workbook", adapterVersion: "3.3.0" },
  };
}

function structureMapping() {
  return {
    sheetName: "资产负债表",
    sheetIndex: 0,
    visibility: "visible",
    reportType: "balance",
    score: 6,
    headerRow: 1,
    labelColumn: 0,
    blockStartRow: 2,
    blockEndRow: 9,
    amountColumns: [{ col: 2, headerText: "期末余额" }],
    mergedHeader: false,
  };
}

function lineMapping() {
  return [{
    label: "货币资金",
    normalizedLabel: "货币资金",
    row: 5,
    labelCell: "A5",
    status: "auto_accepted",
    lineCode: "cash",
    candidates: [],
    amountCells: ["C5"],
  }];
}

const ENTITY_TARGET = {
  kind: "entity",
  companyId: 7,
  year: 2026,
  month: 6,
  periodKind: "cumulative",
  reportType: "balance",
  targetFingerprint: "",
} as const;

function entitySystemLines(amount: number) {
  return [{ lineCode: "cash", label: "货币资金", sortOrder: 0, amountMinor: BigInt(Math.round(amount * 100)) }];
}

function seedEntityMapping(mappings: any[], systemAmount: number) {
  const targetFingerprint = computeEntityComparisonTargetFingerprint({
    target: ENTITY_TARGET,
    systemLines: entitySystemLines(systemAmount),
  });
  mappings.push({
    id: 11,
    revision: 1,
    status: "confirmed",
    targetKind: "entity",
    targetCompanyId: 7,
    targetParentCompanyId: null,
    targetBatchId: null,
    targetOutputSnapshotId: null,
    year: 2026,
    month: 6,
    periodKind: "cumulative",
    reportType: "balance",
    targetFingerprint,
    workbookSha256: "sha-workbook",
    structureMapping: structureMapping(),
    lineMapping: lineMapping(),
    package: { sha256: "sha-workbook", workbookSnapshot: workbookSnapshot() },
  });
  return targetFingerprint;
}

function fakeExplainResult(overrides: Partial<AmountOriginResult> = {}): AmountOriginResult {
  return {
    targetAmount: "10.00",
    explainedAmount: "10.00",
    residualAmount: "0.00",
    status: "exact",
    method: "direct",
    accountingTreatment: "not_evaluated",
    bestExplanation: { method: "direct", rank: 1, evidence: [], explainedAmount: "10.00", residualAmount: "0.00" },
    alternatives: [],
    candidatesTruncated: false,
    budgets: {
      tolerance: "0", maxTerms: 6, maxSolutions: 20, maxCandidatesAfterFilter: 40,
      maxVisitedStates: 250000, deadlineMs: 1000, providerCandidateLimit: 200, amountWindowUpper: "10.00",
    },
    versions: { orchestrator: "test-orchestrator", solverAdapterId: "fake-solver", solverAdapterVersion: "v1" },
    fingerprints: { input: "in", output: "out" },
    stopReason: "direct_hit",
    diagnostics: { scopeQueryCount: 1, providers: [], solver: null },
    ...overrides,
  };
}

const FAKE_SOLVER = { id: "fake-solver", version: "v1", solve: async () => { throw new Error("not used"); } };

function entityLoader(amount: number) {
  return async () => [{ lineCode: "cash", label: "货币资金", amount }];
}

test("entity comparison run completes with immutable run, explained lines and frozen versions", async () => {
  const { db, mappings, runs, lines, writeLog } = makeFakeDb();
  seedEntityMapping(mappings, 90);
  const queries: AmountOriginQuery[] = [];

  const result = await executeComparisonRun({
    mappingId: 11,
    createdBy: 3,
    db,
    solver: FAKE_SOLVER as any,
    explain: async (query) => {
      queries.push(query);
      return fakeExplainResult();
    },
    loadEntityReportLines: entityLoader(90),
  });

  assert.equal(result.status, "completed");
  assert.equal(runs.length, 1);
  const run = runs[0];
  assert.equal(run.status, "completed");
  assert.equal(run.orchestratorId, "finance-amount-explanation-orchestrator");
  assert.equal(run.solverAdapterId, "fake-solver");
  assert.equal(run.solverAdapterVersion, "v1");
  assert.equal(run.formulaAdapterId, "hf-workbook");
  assert.equal(typeof run.inputFingerprint, "string");
  assert.equal(typeof run.outputFingerprint, "string");
  assert.ok(run.completedAt instanceof Date);

  // 逐行解释：targetAmount=差额，携带 reportContext target/lineCode/workbookCell。
  assert.equal(queries.length, 1);
  assert.equal(queries[0]!.targetAmount, "10.00");
  assert.equal(queries[0]!.currencyCode, "CNY");
  assert.equal(queries[0]!.reportContext?.lineCode, "cash");
  assert.equal(queries[0]!.reportContext?.workbookCell, "资产负债表!C5");
  assert.equal(queries[0]!.reportContext?.target.kind, "entity");

  assert.equal(lines.length, 1);
  const line = lines[0];
  assert.equal(line.lineCode, "cash");
  assert.equal(line.externalAmount, "100.00");
  assert.equal(line.systemAmount, "90.00");
  assert.equal(line.differenceAmount, "10.00");
  assert.equal(line.explainedAmount, "10.00");
  assert.equal(line.residualAmount, "0.00");
  assert.equal(line.explanationStatus, "exact");
  assert.equal(line.explanationMethod, "direct");
  assert.deepEqual(line.evidence, []);
  assert.equal(line.diagnostics.accountingTreatment, "not_evaluated");

  const summary = run.summary as any;
  assert.equal(summary.totalLines, 1);
  assert.equal(summary.differingLines, 1);
  assert.equal(summary.exact, 1);
  assert.equal(summary.totalAbsoluteResidual, "0.00");
  assert.equal(summary.accountingTreatment, "not_evaluated");

  // 零写回归：写调用只落在 comparison 四表，company 只读。
  for (const entry of writeLog) {
    const [model] = entry.split(".");
    assert.ok(COMPARISON_DELEGATES.includes(model!), `unexpected write: ${entry}`);
  }
});

test("rerun appends a new immutable run and never edits the previous one", async () => {
  const { db, mappings, runs } = makeFakeDb();
  seedEntityMapping(mappings, 90);

  const first = await executeComparisonRun({
    mappingId: 11, createdBy: 3, db, solver: FAKE_SOLVER as any,
    explain: async () => fakeExplainResult(),
    loadEntityReportLines: entityLoader(90),
  });
  const second = await executeComparisonRun({
    mappingId: 11, createdBy: 3, db, solver: FAKE_SOLVER as any,
    explain: async () => fakeExplainResult(),
    loadEntityReportLines: entityLoader(90),
  });

  assert.notEqual(first.runId, second.runId);
  assert.equal(runs.length, 2);
  assert.equal(runs[0].status, "completed");
  assert.equal(runs[1].status, "completed");
  assert.equal(runs[0].inputFingerprint, runs[1].inputFingerprint);
  assert.equal(runs[0].outputFingerprint, runs[1].outputFingerprint);
});

test("stale target fingerprint invalidates mapping readiness before any run is created", async () => {
  const { db, mappings, runs } = makeFakeDb();
  seedEntityMapping(mappings, 90);

  await assert.rejects(
    executeComparisonRun({
      mappingId: 11, createdBy: 3, db, solver: FAKE_SOLVER as any,
      explain: async () => fakeExplainResult(),
      // 系统目标漂移：金额从 90 变为 91，重算指纹与 mapping 绑定不一致。
      loadEntityReportLines: entityLoader(91),
    }),
    StatementComparisonStateError,
  );

  assert.equal(mappings[0].status, "invalidated");
  assert.equal(mappings[0].revision, 2);
  assert.equal(runs.length, 0);
});

test("line explanation failure lands the run as failed with failureCode", async () => {
  const { db, mappings, runs } = makeFakeDb();
  seedEntityMapping(mappings, 90);

  await assert.rejects(
    executeComparisonRun({
      mappingId: 11, createdBy: 3, db, solver: FAKE_SOLVER as any,
      explain: async () => { throw new Error("solver blew up"); },
      loadEntityReportLines: entityLoader(90),
    }),
    /solver blew up/,
  );

  assert.equal(runs.length, 1);
  assert.equal(runs[0].status, "failed");
  assert.equal(runs[0].failureCode, "execution_failed");
  assert.match(runs[0].failureMessage, /solver blew up/);
});

test("consolidated comparison resolves the bound output snapshot and writes no accounting fact", async () => {
  const { db, mappings, runs, lines, writeLog } = makeFakeDb();
  (db as any).financeConsolidationOutputSnapshot.findUnique = async () => ({
    id: 5,
    batchId: 22,
    outputFingerprint: "fp-consolidated-output",
    reportPayload: {
      batch: { presentationCurrency: "CNY" },
      statements: [{
        reportType: "balance",
        lines: [{ lineCode: "cash", label: "货币资金", amount: 90 }],
      }],
    },
  });
  mappings.push({
    id: 12,
    revision: 1,
    status: "confirmed",
    targetKind: "consolidated",
    targetCompanyId: null,
    targetParentCompanyId: 1,
    targetBatchId: 22,
    targetOutputSnapshotId: 5,
    year: null,
    month: null,
    periodKind: "cumulative",
    reportType: "balance",
    targetFingerprint: "fp-consolidated-output",
    workbookSha256: "sha-workbook",
    structureMapping: structureMapping(),
    lineMapping: lineMapping(),
    package: { sha256: "sha-workbook", workbookSnapshot: workbookSnapshot() },
  });
  const queries: AmountOriginQuery[] = [];

  const result = await executeComparisonRun({
    mappingId: 12, createdBy: 3, db, solver: FAKE_SOLVER as any,
    explain: async (query) => {
      queries.push(query);
      return fakeExplainResult();
    },
  });

  assert.equal(result.status, "completed");
  assert.equal(runs[0].targetFingerprint, "fp-consolidated-output");
  assert.equal(queries[0]!.reportContext?.target.kind, "consolidated");
  assert.equal((queries[0]!.reportContext?.target as any).batchId, 22);
  assert.equal(lines[0].systemAmount, "90.00");
  for (const entry of writeLog) {
    const [model] = entry.split(".");
    assert.ok(COMPARISON_DELEGATES.includes(model!), `unexpected write: ${entry}`);
  }
});

test("entity target fingerprint is deterministic and amount-sensitive", () => {
  const base = computeEntityComparisonTargetFingerprint({
    target: ENTITY_TARGET,
    systemLines: entitySystemLines(90),
  });
  const again = computeEntityComparisonTargetFingerprint({
    target: ENTITY_TARGET,
    systemLines: entitySystemLines(90),
  });
  const changed = computeEntityComparisonTargetFingerprint({
    target: ENTITY_TARGET,
    systemLines: entitySystemLines(91),
  });
  assert.equal(base, again);
  assert.notEqual(base, changed);
});
