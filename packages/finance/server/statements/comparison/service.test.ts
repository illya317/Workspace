import assert from "node:assert/strict";
import { mock } from "node:test";
import test from "node:test";

import type { DetectedStatementStructure, LineMappingEntry } from "./mapping";
import type { WorkbookAnalysisSnapshot } from "./workbook-dto";
import { balanceSheetFixture, buildWorkbookBuffer } from "./workbook-test-fixtures.test";

/* eslint-disable @typescript-eslint/no-explicit-any */

type GuardedDeleteCall = {
  entityType: string;
  modelKey: string;
  id: number;
  userId: number;
  deleteMode: string;
  referencePolicy: string;
  auditPolicy: string;
  archiveField?: { field: string; value?: unknown };
};

/** archive 入口走平台 guardedDelete；测试拦截调用并按声明应用到 fake db。 */
let guardedDeleteCalls: GuardedDeleteCall[] = [];
let guardedDeleteImpl: ((input: GuardedDeleteCall) => Promise<any>) | null = null;

mock.module("@workspace/platform/server/delete-guard", {
  namedExports: {
    guardedDelete: async (input: GuardedDeleteCall) => {
      guardedDeleteCalls.push(input);
      if (guardedDeleteImpl) return guardedDeleteImpl(input);
      return { ok: true, data: { success: true, id: input.id } };
    },
  },
});

const {
  archiveComparisonPackage,
  confirmComparisonMapping,
  importComparisonWorkbook,
  isStatementComparisonEnabled,
  remapComparisonMapping,
  STATEMENT_COMPARISON_CONFIG_KEY,
  StatementComparisonConflictError,
  StatementComparisonDisabledError,
  StatementComparisonStateError,
  StatementComparisonValidationError,
  WorkbookUploadRejectedError,
} = await import("./service");
const {
  completeComparisonRun,
  createComparisonRun,
  failComparisonRun,
} = await import("./comparison-runs");
const { buildComparisonLines } = await import("./comparison-lines");
import type { StatementComparisonDb } from "./service";

/** 内存 fake：只模拟 service 用到的 Prisma 方法子集（含 (id, revision) CAS 语义）。 */
function makeFakeDb(configValue: string | null = "true") {
  const packages: any[] = [];
  const mappings: any[] = [];
  const runs: any[] = [];
  const lines: any[] = [];
  let pkgSeq = 1;
  let mapSeq = 1;
  let runSeq = 1;

  const applySelect = (row: any, select: any) => {
    if (!select) return row;
    const out: any = {};
    for (const [key, value] of Object.entries(select)) {
      if (value === true) out[key] = row[key];
      else if (key === "package" && value && typeof value === "object") {
        const pkg = packages.find((entry) => entry.id === row.packageId) ?? null;
        out.package = pkg ? applySelect(pkg, (value as any).select) : null;
      }
    }
    return out;
  };

  const db: any = {
    systemConfig: {
      findUnique: async ({ where }: any) =>
        where.key === STATEMENT_COMPARISON_CONFIG_KEY && configValue !== null ? { value: configValue } : null,
    },
    financeStatementComparisonPackage: {
      create: async ({ data, select }: any) => {
        const row = { id: pkgSeq += 1, ...data };
        packages.push(row);
        return applySelect(row, select);
      },
      findUnique: async ({ where, select }: any) => {
        const row = packages.find((entry) => entry.id === where.id) ?? null;
        return row ? applySelect(row, select) : null;
      },
      update: async ({ where, data }: any) => {
        const row = packages.find((entry) => entry.id === where.id);
        Object.assign(row, data);
        return row;
      },
    },
    financeStatementComparisonMapping: {
      create: async ({ data, select }: any) => {
        const row = { id: mapSeq += 1, ...data };
        mappings.push(row);
        return applySelect(row, select);
      },
      findUnique: async ({ where, select }: any) => {
        const row = mappings.find((entry) => entry.id === where.id) ?? null;
        return row ? applySelect(row, select) : null;
      },
      updateMany: async ({ where, data }: any) => {
        const row = mappings.find((entry) => entry.id === where.id);
        if (!row) return { count: 0 };
        if (where.revision !== undefined && row.revision !== where.revision) return { count: 0 };
        for (const [key, value] of Object.entries(data)) {
          if (key === "revision" && value && typeof value === "object" && "increment" in (value as any)) {
            row.revision += (value as any).increment;
          } else {
            row[key] = value;
          }
        }
        return { count: 1 };
      },
    },
    financeStatementComparisonRun: {
      create: async ({ data, select }: any) => {
        const row = { id: runSeq += 1, ...data };
        runs.push(row);
        return applySelect(row, select);
      },
      findUnique: async ({ where, select }: any) => {
        const row = runs.find((entry) => entry.id === where.id) ?? null;
        return row ? applySelect(row, select) : null;
      },
      update: async ({ where, data }: any) => {
        const row = runs.find((entry) => entry.id === where.id);
        Object.assign(row, data);
        return row;
      },
    },
    financeStatementComparisonLine: {
      createMany: async ({ data }: any) => {
        lines.push(...data);
        return { count: data.length };
      },
    },
    $transaction: async (fn: any) => fn(db),
  };
  return { db: db as StatementComparisonDb, packages, mappings, runs, lines };
}

const TARGET = {
  kind: "entity" as const,
  companyId: 7,
  year: 2024,
  month: 6,
  periodKind: "monthly" as const,
  reportType: "balance" as const,
  targetFingerprint: "target-fp-1",
};

function confirmedLineMapping(): LineMappingEntry[] {
  return [
    {
      label: "货币资金",
      normalizedLabel: "货币资金",
      row: 1,
      labelCell: "A2",
      status: "auto_accepted",
      lineCode: "cash",
      candidates: [],
      amountCells: ["B2", "C2"],
    },
  ];
}

function confirmedStructure(): DetectedStatementStructure {
  return {
    sheetName: "报表一",
    sheetIndex: 0,
    visibility: "visible",
    reportType: "balance",
    score: 5,
    headerRow: 0,
    labelColumn: 0,
    blockStartRow: 1,
    blockEndRow: 6,
    amountColumns: [{ col: 1, headerText: "期末余额" }, { col: 2, headerText: "年初余额" }],
    mergedHeader: false,
  };
}

async function importEnabledPackage(db: StatementComparisonDb) {
  return importComparisonWorkbook({
    bytes: buildWorkbookBuffer([balanceSheetFixture()]),
    fileName: "匿名化合成报表.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    uploadedBy: 42,
    db,
  });
}

test("功能开关缺省/false → MODULE_DISABLED 同款错误（fail-closed）", async () => {
  const disabled = makeFakeDb(null);
  assert.equal(await isStatementComparisonEnabled(disabled.db), false);
  await assert.rejects(
    importComparisonWorkbook({
      bytes: Buffer.alloc(4),
      fileName: "a.xlsx",
      mimeType: "application/octet-stream",
      uploadedBy: 1,
      db: disabled.db,
    }),
    (error: unknown) => {
      assert.ok(error instanceof StatementComparisonDisabledError);
      assert.equal(error.code, "MODULE_DISABLED");
      assert.equal(error.httpStatus, 403);
      return true;
    },
  );
  const falseValue = makeFakeDb("false");
  assert.equal(await isStatementComparisonEnabled(falseValue.db), false);
});

test("preflight 失败：抛 WorkbookUploadRejectedError 且不落任何行（raw payload 只在 preflight 后入库）", async () => {
  const { db, packages } = makeFakeDb();
  await assert.rejects(
    importComparisonWorkbook({
      bytes: Buffer.from("not a zip ........................"),
      fileName: "fake.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      uploadedBy: 1,
      db,
    }),
    (error: unknown) => {
      assert.ok(error instanceof WorkbookUploadRejectedError);
      assert.equal(error.failureCode, "not_ooxml_zip");
      assert.equal(error.beforePersistence, true);
      return true;
    },
  );
  assert.equal(packages.length, 0, "preflight 失败不得入库");
});

test("正常导入：payload/DTO/scan 入库，含歧义 missing → mappingRequired", async () => {
  const { db, packages } = makeFakeDb();
  const result = await importEnabledPackage(db);
  assert.equal(result.lifecycle, "mappingRequired", "canonical 行缺失需人工确认");
  assert.equal(packages.length, 1);
  const row = packages[0];
  assert.equal(row.sha256, result.sha256);
  assert.ok(Buffer.isBuffer(row.payload) || row.payload instanceof Uint8Array);
  assert.ok(row.workbookSnapshot.dto.sheets.length === 1);
  assert.ok(result.detection?.best);
});

test("mapping 确认：绑定 workbook sha + 目标指纹；package 推进到 ready", async () => {
  const { db, packages, mappings } = makeFakeDb();
  const imported = await importEnabledPackage(db);
  const confirmed = await confirmComparisonMapping({
    packageId: imported.packageId,
    target: TARGET,
    structureMapping: confirmedStructure(),
    lineMapping: confirmedLineMapping(),
    confirmedBy: 43,
    db,
  });
  assert.equal(confirmed.revision, 1);
  assert.equal(mappings[0].workbookSha256, imported.sha256);
  assert.equal(mappings[0].targetFingerprint, TARGET.targetFingerprint);
  assert.equal(mappings[0].status, "confirmed");
  assert.equal(packages[0].lifecycle, "ready");
});

test("mapping 确认拒绝未处置的歧义行", async () => {
  const { db } = makeFakeDb();
  const imported = await importEnabledPackage(db);
  await assert.rejects(
    confirmComparisonMapping({
      packageId: imported.packageId,
      target: TARGET,
      structureMapping: confirmedStructure(),
      lineMapping: [{ ...confirmedLineMapping()[0]!, status: "ambiguous", lineCode: null, candidates: ["cash"] }],
      confirmedBy: 43,
      db,
    }),
    StatementComparisonValidationError,
  );
});

test("remap CAS：过期 revision 冲突，正确 revision 递增", async () => {
  const { db } = makeFakeDb();
  const imported = await importEnabledPackage(db);
  const confirmed = await confirmComparisonMapping({
    packageId: imported.packageId,
    target: TARGET,
    structureMapping: confirmedStructure(),
    lineMapping: confirmedLineMapping(),
    confirmedBy: 43,
    db,
  });

  await assert.rejects(
    remapComparisonMapping({
      mappingId: confirmed.mappingId,
      expectedRevision: 99,
      structureMapping: confirmedStructure(),
      lineMapping: confirmedLineMapping(),
      confirmedBy: 44,
      db,
    }),
    StatementComparisonConflictError,
  );

  const remapped = await remapComparisonMapping({
    mappingId: confirmed.mappingId,
    expectedRevision: 1,
    structureMapping: confirmedStructure(),
    lineMapping: confirmedLineMapping(),
    confirmedBy: 44,
    db,
  });
  assert.equal(remapped.revision, 2);
});

test("run 生命周期：创建 → 完成（含行）→ 不可重复写入；rerun 新建记录", async () => {
  const { db, packages, runs, lines } = makeFakeDb();
  const imported = await importEnabledPackage(db);
  const confirmed = await confirmComparisonMapping({
    packageId: imported.packageId,
    target: TARGET,
    structureMapping: confirmedStructure(),
    lineMapping: confirmedLineMapping(),
    confirmedBy: 43,
    db,
  });

  const run = await createComparisonRun({ mappingId: confirmed.mappingId, createdBy: 45, db });
  assert.ok(run.runId > 0);
  assert.match(run.configFingerprint, /^[0-9a-f]{64}$/);
  assert.equal(runs[0].status, "running");
  assert.equal(runs[0].targetFingerprint, TARGET.targetFingerprint);

  const snapshot = packages[0].workbookSnapshot as WorkbookAnalysisSnapshot;
  const rows = buildComparisonLines({
    analysis: snapshot,
    structureMapping: confirmedStructure(),
    lineMapping: confirmedLineMapping(),
    systemLines: [{ lineCode: "cash", label: "货币资金", sortOrder: 1, amountMinor: 100050n }],
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.externalAmount, "1000.50");
  assert.equal(rows[0]!.systemAmount, "1000.50");
  assert.equal(rows[0]!.differenceAmount, "0.00");
  assert.equal(rows[0]!.explanationStatus, "notEvaluated");

  await completeComparisonRun({ runId: run.runId, lines: rows, summary: { totalLines: 1 }, db });
  assert.equal(runs[0].status, "completed");
  assert.equal(lines.length, 1);
  assert.match(runs[0].outputFingerprint, /^[0-9a-f]{64}$/);

  await assert.rejects(
    completeComparisonRun({ runId: run.runId, lines: rows, summary: {}, db }),
    StatementComparisonStateError,
  );
  await assert.rejects(failComparisonRun(run.runId, "x", "y", db), StatementComparisonStateError);

  // rerun 新建不可变 run，绝不原地改。
  const rerun = await createComparisonRun({ mappingId: confirmed.mappingId, createdBy: 45, db });
  assert.notEqual(rerun.runId, run.runId);
  assert.equal(runs.length, 2);
});

test("run 行重复 lineCode → 友好错误先于唯一约束", async () => {
  const { db } = makeFakeDb();
  const imported = await importEnabledPackage(db);
  const confirmed = await confirmComparisonMapping({
    packageId: imported.packageId,
    target: TARGET,
    structureMapping: confirmedStructure(),
    lineMapping: confirmedLineMapping(),
    confirmedBy: 43,
    db,
  });
  const run = await createComparisonRun({ mappingId: confirmed.mappingId, createdBy: 45, db });
  const row = {
    lineCode: "cash",
    lineLabel: "货币资金",
    sortOrder: 1,
    sourceSheet: "报表一",
    sourceCell: "B2",
    externalAmount: "1000.50",
    systemAmount: "1000.50",
    differenceAmount: "0.00",
    explainedAmount: null,
    residualAmount: "0.00",
    explanationStatus: "notEvaluated",
    explanationMethod: null,
  };
  await assert.rejects(
    completeComparisonRun({ runId: run.runId, lines: [row, { ...row, sourceCell: "C2" }], summary: {}, db }),
    StatementComparisonValidationError,
  );
});

test("系统有行而 workbook 缺失 → sourceSheet/sourceCell 为 null 的快照行", async () => {
  const rows = buildComparisonLines({
    analysis: emptyAnalysis(),
    structureMapping: confirmedStructure(),
    lineMapping: [],
    systemLines: [
      { lineCode: "cash", label: "货币资金", sortOrder: 1, amountMinor: 100050n },
      { lineCode: "receivable", label: "应收账款", sortOrder: 4, amountMinor: 20000n },
    ],
  });
  assert.equal(rows.length, 2);
  assert.equal(rows[0]!.sourceSheet, null);
  assert.equal(rows[0]!.sourceCell, null);
  assert.equal(rows[0]!.externalAmount, null);
  assert.equal(rows[0]!.systemAmount, "1000.50");
  assert.equal(rows[0]!.differenceAmount, null);
});

function emptyAnalysis(): WorkbookAnalysisSnapshot {
  return {
    dto: {
      version: 1,
      file: { fileName: "x.xlsx", mimeType: "", fileSize: 0, sha256: "0".repeat(64) },
      workbookFingerprint: "0".repeat(64),
      parser: { id: "sheetjs-ce", version: "0.20.3" },
      calculation: { mode: null, fullCalcOnLoad: null },
      namedRanges: [],
      sheets: [],
      scan: { sheetCount: 0, cellCount: 0, formulaCellCount: 0, rejectedExternalLinks: 0, warnings: [], unsupported: [] },
    },
    recalculation: {
      adapterId: "none",
      adapterVersion: "none",
      truncated: false,
      adapterError: null,
      cells: {},
      diagnostics: [],
      stats: { visitedNodes: 0, maxDepthReached: 0, edgeCount: 0 },
    },
  };
}

test("archive：归档而非删除；重复归档给友好错误；guardedDelete 声明 archive/retained", async () => {
  const { db, packages } = makeFakeDb();
  const imported = await importEnabledPackage(db);
  guardedDeleteCalls = [];
  guardedDeleteImpl = async (input) => {
    const row = packages.find((entry) => entry.id === input.id);
    row.lifecycle = input.archiveField?.value;
    return { ok: true, data: { success: true, id: input.id } };
  };
  try {
    await archiveComparisonPackage({ packageId: imported.packageId, archivedBy: 46, db });
    assert.equal(packages[0].lifecycle, "archived");
    assert.equal(packages.length, 1, "archive 不删除记录");
    const guard = guardedDeleteCalls[0]!;
    assert.equal(guard.entityType, "FinanceStatementComparisonPackage");
    assert.equal(guard.deleteMode, "archive");
    assert.equal(guard.referencePolicy, "retained", "mapping/run 是聚合内引用，归档保留引用");
    assert.equal(guard.auditPolicy, "none");
    assert.deepEqual(guard.archiveField, { field: "lifecycle", value: "archived" });
    assert.equal(guard.userId, 46);
    await assert.rejects(
      archiveComparisonPackage({ packageId: imported.packageId, archivedBy: 46, db }),
      StatementComparisonStateError,
    );
  } finally {
    guardedDeleteImpl = null;
    guardedDeleteCalls = [];
  }
});
