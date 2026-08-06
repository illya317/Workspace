import assert from "node:assert/strict";
import test, { mock } from "node:test";

import { AmountOriginQueryError } from "../amount-explanation/query";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * route command / Zod / 错误映射测试（Package 6）。
 * prisma 与 amount-explanation service 均以 mock.module 替换：不触真实数据库与求解器。
 */

let comparisonEnabled = "true";

mock.module("@workspace/platform/server/prisma", {
  namedExports: {
    Prisma: { JsonNull: null },
    prisma: {
      systemConfig: { findUnique: async () => ({ value: comparisonEnabled }) },
      financeStatementComparisonMapping: {
        findUnique: async () => ({
          id: 11,
          revision: 2,
          status: "confirmed",
          packageId: 5,
          workbookSha256: "sha",
          targetFingerprint: "fp",
          package: { sha256: "sha" },
        }),
        // CAS 冲突语料：(id, revision) 条件更新永远落空。
        updateMany: async () => ({ count: 0 }),
      },
    },
  },
} as never);

let explainImpl: (input: any) => Promise<unknown> = async () => ({ mocked: true });
mock.module("../amount-explanation/service", {
  namedExports: {
    AMOUNT_EXPLANATION_ORCHESTRATOR_VERSION: "test-orchestrator",
    DEFAULT_AMOUNT_EXPLANATION_BUDGETS: {},
    explainAmountOrigin: async (input: any) => explainImpl(input),
  },
} as never);

const {
  amountOriginQueryBodySchema,
  buildAmountOriginQueryRouteCommand,
  buildImportComparisonWorkbookRouteCommand,
  buildSaveComparisonMappingRouteCommand,
  executeAmountOriginQueryRouteCommand,
  executeSaveComparisonMappingRouteCommand,
  comparisonMappingSaveBodySchema,
} = await import("./route-commands");
const { MAX_UPLOAD_BYTES } = await import("./limits");

const validStructureMapping = {
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

const validLineMapping = [{
  label: "货币资金",
  normalizedLabel: "货币资金",
  row: 5,
  labelCell: "A5",
  status: "auto_accepted",
  lineCode: "cash",
  candidates: [],
  amountCells: ["C5"],
}];

const entityTarget = {
  kind: "entity",
  companyId: 7,
  year: 2026,
  month: 6,
  periodKind: "cumulative",
  reportType: "balance",
  targetFingerprint: "fp",
};

test("comparisonMappingSaveBodySchema validates shape and strips nothing silently", () => {
  const confirmBody = {
    target: entityTarget,
    structureMapping: validStructureMapping,
    lineMapping: validLineMapping,
  };
  assert.equal(comparisonMappingSaveBodySchema.safeParse(confirmBody).success, true);

  const remapBody = { mappingId: 11, expectedRevision: 2, ...confirmBody };
  assert.equal(comparisonMappingSaveBodySchema.safeParse(remapBody).success, true);

  // 0-based headerRow：detection 允许表头位于首行（索引 0），schema 不得误拒。
  assert.equal(
    comparisonMappingSaveBodySchema.safeParse({
      ...confirmBody,
      structureMapping: { ...validStructureMapping, headerRow: 0 },
    }).success,
    true,
  );

  assert.equal(
    comparisonMappingSaveBodySchema.safeParse({ ...confirmBody, hacker: true }).success,
    false,
  );
  assert.equal(
    comparisonMappingSaveBodySchema.safeParse({
      ...confirmBody,
      lineMapping: [{ ...validLineMapping[0], status: "maybe" }],
    }).success,
    false,
  );
  assert.equal(comparisonMappingSaveBodySchema.safeParse({ ...confirmBody, lineMapping: [] }).success, false);
});

test("buildSaveComparisonMappingRouteCommand enforces confirm/remap command rules", () => {
  const confirm = buildSaveComparisonMappingRouteCommand({
    packageId: 5,
    body: { target: entityTarget, structureMapping: validStructureMapping, lineMapping: validLineMapping } as any,
    userId: 3,
  });
  assert.equal(confirm.ok, true);
  if (confirm.ok) {
    assert.equal(confirm.data.mode, "confirm");
    assert.equal(confirm.data.confirmedBy, 3);
  }

  const missingTarget = buildSaveComparisonMappingRouteCommand({
    packageId: 5,
    body: { structureMapping: validStructureMapping, lineMapping: validLineMapping } as any,
    userId: 3,
  });
  assert.equal(missingTarget.ok, false);

  const remapWithoutRevision = buildSaveComparisonMappingRouteCommand({
    packageId: 5,
    body: { mappingId: 11, structureMapping: validStructureMapping, lineMapping: validLineMapping } as any,
    userId: 3,
  });
  assert.equal(remapWithoutRevision.ok, false);

  const remap = buildSaveComparisonMappingRouteCommand({
    packageId: 5,
    body: { mappingId: 11, expectedRevision: 1, structureMapping: validStructureMapping, lineMapping: validLineMapping } as any,
    userId: 3,
  });
  assert.equal(remap.ok, true);
  if (remap.ok) assert.equal(remap.data.mode, "remap");
});

test("mapping remap CAS conflict maps to 409", async () => {
  const result = await executeSaveComparisonMappingRouteCommand({
    mode: "remap",
    mappingId: 11,
    expectedRevision: 1,
    structureMapping: validStructureMapping as any,
    lineMapping: validLineMapping as any,
    confirmedBy: 3,
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 409);
    assert.match(result.error, /并发修改/);
  }
});

test("upload command enforces the 20 MiB cap before reading bytes", () => {
  const oversized = buildImportComparisonWorkbookRouteCommand({
    file: new File([new Uint8Array(8)], "a.xlsx"),
    contentLength: MAX_UPLOAD_BYTES + 1,
    userId: 3,
  });
  assert.equal(oversized.ok, false);
  if (!oversized.ok) assert.equal(oversized.issue.status, 413);

  const bigFile = new File([new Uint8Array(8)], "a.xlsx");
  Object.defineProperty(bigFile, "size", { value: MAX_UPLOAD_BYTES + 1 });
  const bigBySize = buildImportComparisonWorkbookRouteCommand({
    file: bigFile,
    contentLength: null,
    userId: 3,
  });
  assert.equal(bigBySize.ok, false);
  if (!bigBySize.ok) assert.equal(bigBySize.issue.status, 413);

  const valid = buildImportComparisonWorkbookRouteCommand({
    file: new File([new Uint8Array(8)], "a.xlsx"),
    contentLength: 8,
    userId: 3,
  });
  assert.equal(valid.ok, true);
});

test("amountOriginQueryBodySchema validates the stable query DTO boundary", () => {
  assert.equal(amountOriginQueryBodySchema.safeParse({
    targetAmount: "-12124.40",
    currencyCode: "CNY",
    companyIds: [2],
    dateFrom: "2022-12-01",
    dateTo: "2022-12-31",
  }).success, true);

  assert.equal(amountOriginQueryBodySchema.safeParse({
    targetAmount: "100.00",
    currencyCode: "CNY",
    reportContext: { target: entityTarget, lineCode: "cash", workbookCell: "资产负债表!C5" },
    tolerance: "0.01",
    maxTerms: 4,
    sourceKinds: ["voucherLine", "workbookCell"],
  }).success, true);

  assert.equal(amountOriginQueryBodySchema.safeParse({ targetAmount: "1", currencyCode: "CNY1" }).success, false);
  assert.equal(amountOriginQueryBodySchema.safeParse({ targetAmount: "1", currencyCode: "CNY", extra: 1 }).success, false);
  assert.equal(amountOriginQueryBodySchema.safeParse({ targetAmount: "1", currencyCode: "CNY", maxTerms: 9 }).success, false);

  const parsed = amountOriginQueryBodySchema.parse({ targetAmount: "1.00", currencyCode: "cny" });
  const command = buildAmountOriginQueryRouteCommand({ body: parsed });
  assert.equal(command.ok, true);
});

test("amount explanation query returns the service DTO and maps query errors to 400", async () => {
  explainImpl = async () => ({ status: "exact", accountingTreatment: "not_evaluated" });
  const okResult = await executeAmountOriginQueryRouteCommand({ targetAmount: "10.00", currencyCode: "CNY" });
  assert.equal(okResult.ok, true);
  if (okResult.ok) assert.equal((okResult.data as any).accountingTreatment, "not_evaluated");

  explainImpl = async () => { throw new AmountOriginQueryError("targetAmount must be non-zero"); };
  const badResult = await executeAmountOriginQueryRouteCommand({ targetAmount: "0", currencyCode: "CNY" });
  assert.equal(badResult.ok, false);
  if (!badResult.ok) {
    assert.equal(badResult.status, 400);
    assert.match(badResult.error, /non-zero/);
  }
});

test("amount explanation query fails closed when the comparison switch is off", async () => {
  comparisonEnabled = "false";
  try {
    const result = await executeAmountOriginQueryRouteCommand({ targetAmount: "10.00", currencyCode: "CNY" });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 403);
      assert.match(result.error, /未启用/);
    }
  } finally {
    comparisonEnabled = "true";
  }
});
