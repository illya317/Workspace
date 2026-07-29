import assert from "node:assert/strict";
import test from "node:test";

import type { ParsedAssetWorkbook } from "./current-period-workbook-types";
import {
  importAssetWorkbook,
  type AssetWorkbookImportDependencies,
} from "./workbook-import";

const importedAsset = {
  sourceFile: "current.xlsx",
  sourceSheet: "9&10-1",
  sourceRow: 4,
  sourceRange: "9&10-1!A4:Q4",
  sourceKey: "9&10-1:4",
  assetCode: "EXCEL-001",
  name: "测试设备",
  assetKind: "fixed_asset" as const,
  categoryCandidate: "FA-ELECTRONIC",
  sourceCategory: "电子设备",
  acquisitionDate: "2025-12-01",
  depreciationStartDate: "2026-01-01",
  depreciationStartEvidence: "source_used_months_and_cutoff" as const,
  depreciationStartSourceRange: "9&10-1!L4:R4",
  originalCost: 1_200,
  residualRate: 0.03,
  usefulLifeMonths: 36,
  openingAccumulatedAmount: 100,
  openingAsOfDate: "2026-05-31",
  closingNetAmount: 1_090,
  currentDepreciation: 10,
  accumulatedDepreciation: 110,
};

const parsedWorkbook: ParsedAssetWorkbook = {
  scope: { sourceFile: "current.xlsx", companyCode: "TEST", year: 2026, month: 6 },
  workbookCompanyLabels: ["测试公司"],
  periodEvidence: [{ sourceSheet: "9&10-1", sourceRange: "A1", year: 2026, month: 6, raw: "2026年6月" }],
  assets: [importedAsset],
  renovationCostEvidence: [],
  controls: [],
  blockers: [],
  readyForImport: true,
};

const resolvedPolicy = {
  policyId: 10,
  policyVersion: 1,
  category: { id: 20, code: "FA-ELECTRONIC", name: "电子设备", assetKind: "fixed_asset" as const },
  assetAccount: { id: 30, code: "1601", name: "固定资产" },
  accumulatedAccount: { id: 31, code: "1602", name: "累计折旧" },
  expenseAccount: { id: 32, code: "6602", name: "管理费用" },
  defaultUsefulLifeMonths: 36,
  defaultResidualRate: 0.03,
  defaultMethod: "straight_line",
  usefulLifeMode: "finite" as const,
  minimumUsefulLifeMonths: null,
  maximumUsefulLifeMonths: null,
  reviewRequired: false,
  classificationRule: "测试政策",
};

test("existing sourceKey preserves its canonical code without allocating again", async () => {
  const harness = createHarness({
    existing: { assetCode: "TEST-FA-ELECTRONIC-2026-00001", status: "active" },
  });

  const result = await importAssetWorkbook(importInput(), harness.dependencies);

  assert.equal(result.cardCount, 1);
  assert.equal(harness.capture.allocationCalls.length, 0);
  assert.equal(harness.capture.createData, undefined);
  assert.equal(harness.capture.persistedAssetCode, "TEST-FA-ELECTRONIC-2026-00001");
  assert.equal(harness.capture.persistedStatus, "active");
  assert.equal(harness.capture.transactionOptions?.isolationLevel, "Serializable");
  assert.equal(Object.hasOwn(harness.capture.updateData ?? {}, "assetCode"), false);
  assert.equal(Object.hasOwn(harness.capture.updateData ?? {}, "status"), false);
  assert.equal(harness.capture.updateData?.assetAccountId, 30);
  assert.equal(harness.capture.updateData?.accumulatedAccountId, 31);
  assert.match(String(harness.capture.updateData?.note), /sourceAssetCode=EXCEL-001/);
  assert.match(String(harness.capture.updateData?.note), /sourceRange=9&10-1!A4:Q4/);
  assert.match(String(harness.capture.updateData?.note), /depreciationStartEvidence=source_used_months_and_cutoff/);
  assert.match(String(harness.capture.updateData?.note), /depreciationStartSourceRange=9&10-1!L4:R4/);
});

test("new sourceKey allocates and writes its canonical code in the same transaction", async () => {
  const harness = createHarness();

  await importAssetWorkbook(importInput(), harness.dependencies);

  assert.equal(harness.capture.allocationCalls.length, 1);
  const allocation = harness.capture.allocationCalls[0];
  assert.equal(allocation.tx, harness.transactionClient);
  assert.deepEqual(allocation.input, {
    companyCode: "TEST",
    fiscalYear: 2026,
    assetCategoryCode: "FA-ELECTRONIC",
    idempotencyKey: "import:TEST:9&10-1:4",
  });
  assert.equal(harness.capture.createData?.assetCode, "TEST-FA-ELECTRONIC-2026-00002");
  assert.equal(harness.capture.createData?.status, "active");
  assert.equal(harness.capture.createData?.assetAccountId, 30);
  assert.equal(harness.capture.createData?.accumulatedAccountId, 31);
  assert.notEqual(harness.capture.createData?.assetCode, importedAsset.assetCode);
  assert.equal(harness.capture.createData?.sourceKey, importedAsset.sourceKey);
  assert.match(String(harness.capture.createData?.note), /sourceAssetCode=EXCEL-001/);
  assert.equal(harness.capture.createData?.method, "straight_line");
});

test("an identical second import keeps its code, evidence, and posted period entry", async () => {
  const harness = createHarness();

  await importAssetWorkbook(importInput(), harness.dependencies);
  assert.equal(harness.capture.allocationCalls.length, 1);
  assert.equal(harness.capture.persistedAssetCode, "TEST-FA-ELECTRONIC-2026-00002");

  harness.setCurrentPeriodEntry({ normalAmount: 10, status: "posted", voucherId: 88 });
  const periodEntryUpserts = harness.capture.periodEntryUpsertCalls;
  const result = await importAssetWorkbook(importInput(), harness.dependencies);

  assert.equal(result.cardCount, 1);
  assert.equal(harness.capture.allocationCalls.length, 1);
  assert.equal(harness.capture.persistedAssetCode, "TEST-FA-ELECTRONIC-2026-00002");
  assert.equal(harness.capture.periodEntryUpsertCalls, periodEntryUpserts);
  assert.deepEqual(harness.capture.acquisitionEvidenceData?.version, { increment: 1 });
});

test("card CAS rejects a concurrent version, acquisition, posted, or impairment fact", async () => {
  for (const concurrentChange of ["version", "acquisition", "posted", "impairment"] as const) {
    const harness = createHarness({
      existing: { assetCode: "TEST-FA-ELECTRONIC-2026-00001", status: "active" },
      concurrentChange,
      parsed: { ...parsedWorkbook, assets: [{ ...importedAsset, originalCost: 1_300 }] },
    });

    await assert.rejects(
      () => importAssetWorkbook(importInput(), harness.dependencies),
      /资产卡片已被其他事实修改，请刷新后重试/,
    );
    assert.equal(harness.capture.cardUpdateManyCalls, 1);
    assert.equal(harness.capture.acquisitionEvidenceData, undefined);
  }
});

test("reimport cannot bypass the accounting-basis lock on an existing governed asset", async () => {
  const harness = createHarness({
    existing: { assetCode: "TEST-FA-ELECTRONIC-2026-00001", status: "active" },
    existingEvidence: { companyCode: "TEST", companyId: 1, importBatchId: 70, voucherItemId: null, sourceChecksum: "controlled" },
    parsed: {
      ...parsedWorkbook,
      assets: [{ ...importedAsset, originalCost: 1_300 }],
    },
  });

  await assert.rejects(
    () => importAssetWorkbook(importInput(), harness.dependencies),
    /重导不得修改会计基础/,
  );
  assert.equal(harness.capture.updateData, undefined);
  assert.equal(harness.capture.acquisitionEvidenceData, undefined);
});

test("reimport preserves a posted current-period entry and rejects changed depreciation facts", async () => {
  const same = createHarness({ currentPeriodEntry: { normalAmount: 10, status: "posted", voucherId: 88 } });
  await importAssetWorkbook(importInput(), same.dependencies);
  assert.equal(same.capture.periodEntryData, undefined);

  const changed = createHarness({
    currentPeriodEntry: { normalAmount: 9.99, status: "posted", voucherId: 88 },
  });
  await assert.rejects(
    () => importAssetWorkbook(importInput(), changed.dependencies),
    /本期折旧摊销已过账，重导金额不一致/,
  );
});

test("rejects a workbook whose company label does not match the target company identity", async () => {
  const harness = createHarness({
    parsed: { ...parsedWorkbook, workbookCompanyLabels: ["另一家公司"] },
  });

  await assert.rejects(
    () => importAssetWorkbook(importInput(), harness.dependencies),
    /资产底稿公司名称与目标公司 TEST 不一致/,
  );

  assert.equal(harness.capture.writeCalls, 0);
  assert.equal(harness.capture.allocationCalls.length, 0);
});

test("rejects every import into a closed accounting period before any asset write", async () => {
  const harness = createHarness({ period: { id: 40, isClosed: true } });

  await assert.rejects(
    () => importAssetWorkbook(importInput(), harness.dependencies),
    /目标会计期间已关账/,
  );

  assert.equal(harness.capture.writeCalls, 0);
  assert.equal(harness.capture.allocationCalls.length, 0);
});

test("rejects a parser result without evidenced depreciation start before opening a transaction", async () => {
  const harness = createHarness({
    parsed: {
      ...parsedWorkbook,
      assets: [{ ...importedAsset, depreciationStartDate: undefined, depreciationStartEvidence: undefined, depreciationStartSourceRange: undefined }],
    },
  });

  await assert.rejects(
    () => importAssetWorkbook(importInput(), harness.dependencies),
    /折旧摊销起算日期缺少明确来源证据/,
  );

  assert.equal(harness.capture.transactionOptions, undefined);
  assert.equal(harness.capture.writeCalls, 0);
});

test("rejects an annual policy whose method is not implemented before asset writes", async () => {
  const harness = createHarness();
  harness.dependencies.resolvePolicy = (async () => ({
    ...resolvedPolicy,
    defaultMethod: "declining_balance",
  })) as unknown as AssetWorkbookImportDependencies["resolvePolicy"];

  await assert.rejects(
    () => importAssetWorkbook(importInput(), harness.dependencies),
    /当前仅支持直线法/,
  );

  assert.equal(harness.capture.writeCalls, 0);
  assert.equal(harness.capture.allocationCalls.length, 0);
});

function importInput() {
  return {
    buffer: Buffer.from("controlled-current-period-workbook"),
    sourceFile: "current.xlsx",
    companyCode: "TEST",
    year: 2026,
    month: 6,
    userId: 7,
  };
}

function createHarness(options: {
  existing?: { assetCode: string; status: string } | null;
  company?: { id: number; code: string; party: { name: string; fullName: string | null } } | null;
  period?: { id: number; isClosed: boolean } | null;
  existingEvidence?: { companyCode: string; companyId: number; importBatchId: number | null; voucherItemId: number | null; sourceChecksum: string | null } | null;
  currentPeriodEntry?: { normalAmount: number; status: string; voucherId: number | null } | null;
  concurrentChange?: "version" | "acquisition" | "posted" | "impairment";
  parsed?: ParsedAssetWorkbook;
} = {}) {
  const existing = options.existing ?? null;
  let storedEvidence = options.existingEvidence ?? null;
  let storedPeriodEntry = options.currentPeriodEntry ?? null;
  const capture: {
    allocationCalls: Array<{ tx: unknown; input: Record<string, unknown> }>;
    createData?: Record<string, unknown>;
    updateData?: Record<string, unknown>;
    persistedAssetCode?: string;
    persistedStatus?: string;
    writeCalls: number;
    acquisitionEvidenceData?: Record<string, unknown>;
    periodEntryData?: Record<string, unknown>;
    periodEntryUpsertCalls: number;
    cardUpdateManyCalls: number;
    transactionOptions?: Record<string, unknown>;
  } = { allocationCalls: [], writeCalls: 0, periodEntryUpsertCalls: 0, cardUpdateManyCalls: 0 };
  let concurrentChangePending = options.concurrentChange;
  let storedCard: Record<string, unknown> | null = existing ? {
    id: 50,
    companyCode: "TEST",
    companyId: 1,
    name: importedAsset.name,
    assetKind: importedAsset.assetKind,
    categoryId: resolvedPolicy.category.id,
    assetAccountCode: resolvedPolicy.assetAccount.code,
    assetAccountId: resolvedPolicy.assetAccount.id,
    accumulatedAccountCode: resolvedPolicy.accumulatedAccount.code,
    accumulatedAccountId: resolvedPolicy.accumulatedAccount.id,
    acquisitionDate: importedAsset.acquisitionDate,
    depreciationStartDate: importedAsset.depreciationStartDate,
    originalCost: importedAsset.originalCost,
    residualRate: importedAsset.residualRate,
    usefulLifeMonths: importedAsset.usefulLifeMonths,
    method: resolvedPolicy.defaultMethod,
    openingAccumulatedAmount: importedAsset.openingAccumulatedAmount,
    openingAsOfDate: importedAsset.openingAsOfDate,
    nonAmortizationReason: null,
    version: 1,
    note: null,
    acquisitionEvidence: storedEvidence ? { id: 80 } : null,
    disposal: existing.status === "disposed" ? { id: 90 } : null,
    periodEntries: storedPeriodEntry?.status === "posted" || storedPeriodEntry?.voucherId != null ? [{ id: 60 }] : [],
    impairmentAllocations: [],
    ...existing,
  } : null;
  const transactionClient = {
    company: {
      findUnique: async () => options.company === undefined
        ? { id: 1, code: "TEST", party: { name: "测试 公司", fullName: "测试公司有限公司" } }
        : options.company,
    },
    financePeriod: {
      findUnique: async () => options.period === undefined ? { id: 40, isClosed: false } : options.period,
    },
    financeAssetCategory: {
      findMany: async () => [{ id: 20, code: "FA-ELECTRONIC", assetKind: "fixed_asset" }],
    },
    financeAssetCard: {
      findUnique: async () => storedCard,
      findUniqueOrThrow: async () => {
        if (!storedCard) throw new Error("missing card");
        return storedCard;
      },
      updateMany: async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        capture.writeCalls += 1;
        capture.cardUpdateManyCalls += 1;
        capture.updateData = args.data;
        if (concurrentChangePending && storedCard) {
          if (concurrentChangePending === "version") storedCard.version = Number(storedCard.version) + 1;
          if (concurrentChangePending === "acquisition") storedCard.acquisitionEvidence = { id: 81 };
          if (concurrentChangePending === "posted") {
            storedPeriodEntry = { normalAmount: 10, status: "posted", voucherId: 99 };
            storedCard.periodEntries = [{ id: 61 }];
          }
          if (concurrentChangePending === "impairment") storedCard.impairmentAllocations = [{ id: 71 }];
          concurrentChangePending = undefined;
        }
        const acquisitionGuard = args.where.acquisitionEvidence as { is?: null } | undefined;
        const periodGuard = args.where.periodEntries as { none?: unknown } | undefined;
        const impairmentGuard = args.where.impairmentAllocations as { none?: unknown } | undefined;
        const matches = Boolean(storedCard
          && storedCard.id === args.where.id
          && storedCard.companyCode === args.where.companyCode
          && storedCard.companyId === args.where.companyId
          && storedCard.version === args.where.version
          && storedCard.status === args.where.status
          && !(acquisitionGuard?.is === null && storedCard.acquisitionEvidence)
          && !(periodGuard?.none && Array.isArray(storedCard.periodEntries) && storedCard.periodEntries.length > 0)
          && !(impairmentGuard?.none && Array.isArray(storedCard.impairmentAllocations) && storedCard.impairmentAllocations.length > 0));
        if (!matches || !storedCard) return { count: 0 };
        const version = args.data.version as { increment?: number } | undefined;
        const persisted = {
          ...storedCard,
          ...args.data,
          version: Number(storedCard.version) + (version?.increment ?? 0),
        };
        storedCard = persisted;
        capture.persistedAssetCode = String(persisted.assetCode);
        capture.persistedStatus = String(persisted.status);
        return { count: 1 };
      },
      create: async (args: { data: Record<string, unknown> }) => {
        capture.writeCalls += 1;
        capture.createData = args.data;
        capture.persistedAssetCode = String(args.data.assetCode);
        capture.persistedStatus = String(args.data.status);
        storedCard = { id: 51, version: 1, acquisitionEvidence: null, disposal: null, periodEntries: [], impairmentAllocations: [], ...args.data };
        return storedCard;
      },
    },
    financeAssetPeriodEntry: {
      findUnique: async () => storedPeriodEntry,
      upsert: async (args: { create: Record<string, unknown>; update: Record<string, unknown> }) => {
        capture.writeCalls += 1;
        capture.periodEntryUpsertCalls += 1;
        capture.periodEntryData = storedPeriodEntry ? args.update : args.create;
        storedPeriodEntry = { id: 60, ...capture.periodEntryData } as typeof storedPeriodEntry;
        return storedPeriodEntry;
      },
    },
    financeAssetImportBatch: {
      upsert: async () => {
        capture.writeCalls += 1;
        return { id: 70 };
      },
    },
    financeAssetAcquisitionEvidence: {
      findUnique: async () => storedEvidence,
      upsert: async (args: { create: Record<string, unknown>; update: Record<string, unknown> }) => {
        capture.writeCalls += 1;
        capture.acquisitionEvidenceData = storedEvidence ? args.update : args.create;
        storedEvidence = { ...storedEvidence, ...capture.acquisitionEvidenceData } as typeof storedEvidence;
        if (storedCard) storedCard.acquisitionEvidence = { id: 80 };
        return { id: 80, ...storedEvidence };
      },
    },
  };
  const database = {
    $transaction: async (operation: (tx: typeof transactionClient) => Promise<unknown>, transactionOptions?: Record<string, unknown>) => {
      capture.transactionOptions = transactionOptions;
      return operation(transactionClient);
    },
  } as unknown as AssetWorkbookImportDependencies["database"];
  const dependencies: AssetWorkbookImportDependencies = {
    database,
    parseWorkbook: (() => options.parsed ?? parsedWorkbook) as AssetWorkbookImportDependencies["parseWorkbook"],
    resolvePolicy: (async () => resolvedPolicy) as unknown as AssetWorkbookImportDependencies["resolvePolicy"],
    allocateAssetCode: (async (tx: unknown, input: Record<string, unknown>) => {
      capture.allocationCalls.push({ tx, input });
      return { code: "TEST-FA-ELECTRONIC-2026-00002" };
    }) as unknown as AssetWorkbookImportDependencies["allocateAssetCode"],
  };
  return {
    capture,
    dependencies,
    transactionClient,
    setCurrentPeriodEntry(entry: { normalAmount: number; status: string; voucherId: number | null }) {
      storedPeriodEntry = entry;
      if (storedCard) storedCard.periodEntries = entry.status === "posted" || entry.voucherId != null ? [{ id: 60 }] : [];
    },
  };
}
