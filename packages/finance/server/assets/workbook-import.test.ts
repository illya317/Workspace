import assert from "node:assert/strict";
import test from "node:test";
/* eslint-disable max-lines */

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
  warnings: [],
  readyForImport: true,
};

const resolvedPolicy = {
  policyId: 10,
  policyVersion: 1,
  category: { id: 20, code: "FA-ELECTRONIC", name: "电子设备", assetKind: "fixed_asset" as const, depreciable: true },
  assetAccount: { id: 30, code: "1601", name: "固定资产" },
  accumulatedAccount: { id: 31, code: "1602", name: "累计折旧" },
  expenseAccount: { id: 32, code: "6602", name: "管理费用" },
  impairmentAllowanceAccount: null,
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
  assert.equal(harness.capture.importBatchData?.reconciliationStatus, "matched");
});

test("rejects a synthetic renovation import from an ordinary callback", async () => {
  const renovationCostEvidence = Array.from({ length: 11 }, (_, index) => {
    const sourceRow = 18 + index;
    const excluded = sourceRow === 20;
    return { sourceFile: "current.xlsx", sourceSheet: "9&10-3", sourceRow, sourceRange: `9&10-3!A${sourceRow}:E${sourceRow}`, sourceKey: `9&10-3:${sourceRow}`, amount: 100 + index, treatment: excluded ? "excluded_from_source_total" as const : "included" as const, reason: excluded ? "来源总计公式明确排除" : undefined };
  });
  const parsed = { ...parsedWorkbook, assets: [{ ...importedAsset, assetCode: "SOURCE-EVIDENCE-ROW-29", legacySynthetic: true as const }], renovationCostEvidence };
  const harness = createHarness({ parsed });
  await assert.rejects(() => importAssetWorkbook(importInput(), harness.dependencies), /执行级 governed reconciler/);
  assert.equal(harness.capture.writeCalls, 0);
});

test("an identical second import keeps its code and does not create a cutover-period depreciation row", async () => {
  const harness = createHarness();

  await importAssetWorkbook(importInput(), harness.dependencies);
  assert.equal(harness.capture.allocationCalls.length, 1);
  assert.equal(harness.capture.persistedAssetCode, "TEST-FA-ELECTRONIC-2026-00002");

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

test("accepts the authoritative closed cutover period without creating a historical period row", async () => {
  const harness = createHarness();
  await importAssetWorkbook(importInput(), harness.dependencies);
  assert.equal(harness.capture.periodEntryUpsertCalls, 0);
  assert.equal(harness.capture.createData?.initializationMode, "legacy_cutover");
  assert.equal(harness.capture.createData?.openingAsOfDate, "2026-06-30");
  assert.equal(harness.capture.createData?.depreciationStartDate, "2026-07-01");
});

test("missing historical start evidence is non-blocking for a GL-controlled cutover", async () => {
  const harness = createHarness({
    parsed: {
      ...parsedWorkbook,
      assets: [{ ...importedAsset, depreciationStartDate: undefined, depreciationStartEvidence: undefined, depreciationStartSourceRange: undefined }],
    },
  });

  await importAssetWorkbook(importInput(), harness.dependencies);
  assert.equal(harness.capture.createData?.depreciationStartDate, "2026-07-01");
});

test("evidence issues cannot block at the importer boundary", async () => {
  const harness = createHarness({
    parsed: {
      ...parsedWorkbook,
      blockers: [{ code: "LICENSE_RECOGNITION_REVIEW", message: "牌照证据待人工复核", sourceSheet: "9&10-2" }],
      readyForImport: false,
    },
  });

  const result = await importAssetWorkbook(importInput(), harness.dependencies);

  assert.equal(result.blockerCount, 0);
  assert.equal(result.warningCount, 1);
  assert.equal(result.workbookWarnings[0]?.code, "LICENSE_RECOGNITION_REVIEW");
  assert.match(result.workbookWarnings[0]?.note ?? "", /人工复核，不阻断导入/);
});

test("missing useful-life evidence imports an indefinite-basis intangible without inventing amortization", async () => {
  const asset = {
    ...importedAsset,
    assetKind: "intangible" as const,
    categoryCandidate: "IA-LICENSE",
    sourceCategory: "车辆牌照",
    name: "车辆牌照",
    residualRate: 0,
    usefulLifeMonths: undefined,
    closingNetAmount: 1_200,
  };
  const parsed = {
    ...parsedWorkbook,
    assets: [asset],
    blockers: [
      { code: "INTANGIBLE_USEFUL_LIFE_MISSING", message: "使用寿命证据待复核", sourceSheet: "9&10-2" },
      { code: "LICENSE_RECOGNITION_REVIEW", message: "牌照确认条件待复核", sourceSheet: "9&10-2" },
    ],
    readyForImport: false,
  };
  const policy = {
    ...resolvedPolicy,
    category: { ...resolvedPolicy.category, code: "IA-LICENSE", name: "许可权", assetKind: "intangible" as const },
    assetAccount: { ...resolvedPolicy.assetAccount, code: "1701", name: "无形资产" },
    accumulatedAccount: { ...resolvedPolicy.accumulatedAccount, code: "1702", name: "累计摊销" },
    defaultUsefulLifeMonths: null,
    defaultResidualRate: 0,
    usefulLifeMode: "required_or_indefinite_basis" as const,
    reviewRequired: true,
  };
  const harness = createHarness({ parsed, policy: policy as never });

  const result = await importAssetWorkbook(importInput(), harness.dependencies);

  assert.equal(result.warningCount, 2);
  assert.equal(harness.capture.createData?.usefulLifeMonths, null);
  assert.equal(harness.capture.createData?.remainingUsefulLifeMonthsAtCutover, 0);
  assert.equal(harness.capture.createData?.cutoverResidualValue, 1_200);
  assert.match(String(harness.capture.createData?.nonAmortizationReason), /待人工复核/);
});

test("rejects a plain callback that attempts to downgrade audited parser blockers", async () => {
  const existingWarning = {
    code: "POLICY_EVIDENCE_PENDING",
    message: "政策证据待补",
    sourceSheet: "9&10-1",
    sourceRange: "9&10-1!A4:Q4",
  };
  const overriddenBlocker = {
    code: "FIXED_DEPRECIATION_CONTROL_FAILED",
    message: "固定资产逐行本月折旧与来源总计不一致（差异 0.01）",
    sourceSheet: "9&10-1",
    sourceRange: "9&10-1!D22:AA22",
  };
  const harness = createHarness({
    parsed: {
      ...parsedWorkbook,
      blockers: [overriddenBlocker],
      warnings: [existingWarning],
      readyForImport: false,
    },
  });

  await assert.rejects(() => importAssetWorkbook(importInput(), harness.dependencies), /执行级 governed reconciler/);
  assert.equal(harness.capture.writeCalls, 0);
});

test("rejects a plain callback that forges a ledger control adjustment", async () => {
  const harness = createHarness();
  const base = harness.dependencies.reconcileCutover;
  harness.dependencies.reconcileCutover = (async (tx, input) => {
    const forged = await base(tx, input);
    return { ...forged, allocations: forged.allocations.map((row) => ({ ...row, ledgerControlAdjustment: 1 })) };
  }) as AssetWorkbookImportDependencies["reconcileCutover"];
  await assert.rejects(() => importAssetWorkbook(importInput(), harness.dependencies), /执行级 governed reconciler/);
  assert.equal(harness.capture.writeCalls, 0);
});

test("non-audited parser blockers remain fail-closed before opening a transaction", async () => {
  const harness = createHarness({
    parsed: {
      ...parsedWorkbook,
      blockers: [{ code: "ASSET_AMOUNT_INVALID", message: "资产金额非法", sourceSheet: "9&10-1", sourceRange: "9&10-1!K4" }],
      readyForImport: false,
    },
  });

  await assert.rejects(() => importAssetWorkbook(importInput(), harness.dependencies), /ASSET_AMOUNT_INVALID/);
  assert.equal(harness.capture.transactionOptions, undefined);
});

test("audited parser controls remain blocking outside the 2026-06 cutover", async () => {
  const harness = createHarness({
    parsed: {
      ...parsedWorkbook,
      blockers: [{ code: "FIXED_NET_CONTROL_FAILED", message: "期末净值控制失败", sourceSheet: "9&10-1" }],
      readyForImport: false,
    },
  });

  await assert.rejects(
    () => importAssetWorkbook({ ...importInput(), year: 2025, month: 12 }, harness.dependencies),
    /FIXED_NET_CONTROL_FAILED/,
  );
  assert.equal(harness.capture.transactionOptions, undefined);
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
  period?: { id: number; companyCode: string; companyId: number; year: number; month: number; startDate: string; endDate: string; isClosed: boolean } | null;
  existingEvidence?: { companyCode: string; companyId: number; importBatchId: number | null; voucherItemId: number | null; sourceChecksum: string | null } | null;
  currentPeriodEntry?: { normalAmount: number; status: string; voucherId: number | null } | null;
  concurrentChange?: "version" | "acquisition" | "posted" | "impairment";
  parsed?: ParsedAssetWorkbook;
  policy?: Awaited<ReturnType<AssetWorkbookImportDependencies["resolvePolicy"]>>;
} = {}) {
  const effectiveAsset = (options.parsed ?? parsedWorkbook).assets[0]!;
  const effectivePolicy = options.policy ?? resolvedPolicy as unknown as Awaited<ReturnType<AssetWorkbookImportDependencies["resolvePolicy"]>>;
  const existing = options.existing ?? null;
  let storedEvidence = options.existingEvidence ?? null;
  let storedPeriodEntry: ({ id?: number } & NonNullable<typeof options.currentPeriodEntry>) | null = options.currentPeriodEntry ?? null;
  const capture: {
    allocationCalls: Array<{ tx: unknown; input: Record<string, unknown> }>;
    createData?: Record<string, unknown>;
    updateData?: Record<string, unknown>;
    persistedAssetCode?: string;
    persistedStatus?: string;
    writeCalls: number;
    acquisitionEvidenceData?: Record<string, unknown>;
    importBatchData?: Record<string, unknown>;
    periodEntryData?: Record<string, unknown>;
    periodEntryUpsertCalls: number;
    cardUpdateManyCalls: number;
    costLineUpsertCalls: number;
    costLines: Map<string, Record<string, unknown>>;
    transactionOptions?: Record<string, unknown>;
  } = { allocationCalls: [], writeCalls: 0, periodEntryUpsertCalls: 0, cardUpdateManyCalls: 0, costLineUpsertCalls: 0, costLines: new Map() };
  let concurrentChangePending = options.concurrentChange;
  let storedCard: Record<string, unknown> | null = existing ? {
    id: 50,
    companyCode: "TEST",
    companyId: 1,
    name: importedAsset.name,
    assetKind: importedAsset.assetKind,
    categoryId: effectivePolicy.category.id,
    assetAccountCode: effectivePolicy.assetAccount.code,
    assetAccountId: effectivePolicy.assetAccount.id,
    accumulatedAccountCode: effectivePolicy.accumulatedAccount?.code ?? null,
    accumulatedAccountId: effectivePolicy.accumulatedAccount?.id ?? null,
    acquisitionDate: importedAsset.acquisitionDate,
    depreciationStartDate: importedAsset.depreciationStartDate,
    originalCost: importedAsset.originalCost,
    residualRate: importedAsset.residualRate,
    usefulLifeMonths: importedAsset.usefulLifeMonths,
    method: effectivePolicy.defaultMethod,
    initializationMode: "legacy_cutover",
    openingAccumulatedAmount: 110,
    openingImpairmentAmount: 0,
    openingNetBookValue: 1_090,
    openingAsOfDate: "2026-06-30",
    cutoverDate: "2026-06-30",
    remainingUsefulLifeMonthsAtCutover: 30,
    cutoverResidualValue: 36,
    cutoverAllocationStatus: "allocated",
    cutoverReconciliationFingerprint: "a".repeat(64),
    cutoverPeriodId: 40,
    cutoverAssetBalanceId: 41,
    cutoverAccumulatedBalanceId: 42,
    cutoverImpairmentBalanceId: null,
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
      findUnique: async () => options.period === undefined ? { id: 40, companyCode: "TEST", companyId: 1, year: 2026, month: 6, startDate: "2026-06-01", endDate: "2026-06-30", isClosed: true } : options.period,
    },
    financeAccountBalance: {
      findMany: async () => [
        { id: 41, accountId: effectivePolicy.assetAccount.id, periodId: 40, companyCode: "TEST", companyId: 1, closingDebit: effectiveAsset.originalCost, closingCredit: 0, account: { code: effectivePolicy.assetAccount.code, balanceDirection: "debit", companyCode: "TEST", companyId: 1, year: 2026, isActive: true } },
        { id: 42, accountId: effectivePolicy.accumulatedAccount?.id ?? 31, periodId: 40, companyCode: "TEST", companyId: 1, closingDebit: 0, closingCredit: Math.round((effectiveAsset.originalCost - effectiveAsset.closingNetAmount + Number.EPSILON) * 100) / 100, account: { code: effectivePolicy.accumulatedAccount?.code ?? "1602", balanceDirection: "credit", companyCode: "TEST", companyId: 1, year: 2026, isActive: true } },
      ],
    },
    financeAssetCategory: {
      findMany: async () => [{ id: effectivePolicy.category.id, code: effectivePolicy.category.code, assetKind: effectivePolicy.category.assetKind }],
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
        capture.persistedAssetCode = String((persisted as Record<string, unknown>).assetCode);
        capture.persistedStatus = String((persisted as Record<string, unknown>).status);
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
        storedPeriodEntry = { id: 60, ...capture.periodEntryData } as unknown as typeof storedPeriodEntry;
        return storedPeriodEntry;
      },
    },
    financeAssetImportBatch: {
      upsert: async (args: { create: Record<string, unknown>; update: Record<string, unknown> }) => {
        capture.writeCalls += 1;
        capture.importBatchData = args.create;
        return { id: 70 };
      },
    },
    financeAssetCostLine: {
      findMany: async () => [...capture.costLines.keys()].map((sourceKey) => ({ sourceKey })),
      upsert: async (args: { where: { assetId_sourceKey: { sourceKey: string } }; create: Record<string, unknown>; update: Record<string, unknown> }) => {
        capture.writeCalls += 1;
        capture.costLineUpsertCalls += 1;
        const sourceKey = args.where.assetId_sourceKey.sourceKey;
        capture.costLines.set(sourceKey, capture.costLines.has(sourceKey) ? { ...capture.costLines.get(sourceKey), ...args.update } : args.create);
        return capture.costLines.get(sourceKey);
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
    resolvePolicy: (async () => effectivePolicy) as AssetWorkbookImportDependencies["resolvePolicy"],
    allocateAssetCode: (async (tx: unknown, input: Record<string, unknown>) => {
      capture.allocationCalls.push({ tx, input });
      return { code: "TEST-FA-ELECTRONIC-2026-00002" };
    }) as unknown as AssetWorkbookImportDependencies["allocateAssetCode"],
    reconcileCutover: (async (_tx, input) => cutoverResult(options.parsed ?? parsedWorkbook, input.assets[0]!, effectivePolicy)) as AssetWorkbookImportDependencies["reconcileCutover"],
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

function cutoverResult(
  parsed: ParsedAssetWorkbook,
  basis: { remainingUsefulLifeMonthsAtCutover: number; cutoverResidualValue: number },
  policy: Awaited<ReturnType<AssetWorkbookImportDependencies["resolvePolicy"]>>,
) {
  const asset = parsed.assets[0]!;
  const openingAccumulatedAmount = Math.round((asset.originalCost - asset.closingNetAmount + Number.EPSILON) * 100) / 100;
  return {
    cutoverDate: "2026-06-30",
    period: { id: 40, companyCode: "TEST", companyId: 1, year: 2026, month: 6, endDate: "2026-06-30", isClosed: true },
    fingerprint: "a".repeat(64),
    status: "matched" as const,
    ledgerNetBookValue: asset.closingNetAmount,
    importedNetBookValue: asset.closingNetAmount,
    unallocatedNetBookValue: 0,
    warnings: [],
    accountControls: [{
      key: `asset:${policy.assetAccount.id}`, role: "asset" as const, sourceKeys: [asset.sourceKey], accountId: policy.assetAccount.id, accountCode: policy.assetAccount.code, balanceId: 41,
      selection: "full_account" as const, allocationMode: "standard" as const, approvalReason: null, approvedSelectedAmount: null, expectedDirection: "debit" as const, workspaceClosingDebit: asset.originalCost, workspaceClosingCredit: 0,
      sourceClosingDebit: asset.originalCost, sourceClosingCredit: 0, sourceSelectedAmount: asset.originalCost, allocatedAmount: asset.originalCost, difference: 0,
    }, {
      key: `accumulated:${policy.accumulatedAccount?.id ?? 31}`, role: "accumulated" as const, sourceKeys: [asset.sourceKey], accountId: policy.accumulatedAccount?.id ?? 31, accountCode: policy.accumulatedAccount?.code ?? "1602", balanceId: 42,
      selection: "full_account" as const, allocationMode: "standard" as const, approvalReason: null, approvedSelectedAmount: null, expectedDirection: "credit" as const, workspaceClosingDebit: 0, workspaceClosingCredit: openingAccumulatedAmount,
      sourceClosingDebit: 0, sourceClosingCredit: openingAccumulatedAmount, sourceSelectedAmount: openingAccumulatedAmount, allocatedAmount: openingAccumulatedAmount, difference: 0,
    }],
    allocations: [{
      sourceKey: asset.sourceKey,
      openingAccumulatedAmount,
      openingImpairmentAmount: 0,
      openingNetBookValue: asset.closingNetAmount,
      cutoverResidualValue: basis.cutoverResidualValue,
      remainingUsefulLifeMonthsAtCutover: basis.remainingUsefulLifeMonthsAtCutover,
      allocationStatus: "allocated" as const,
      roundingAdjustment: 0,
      ledgerControlAdjustment: 0,
      ledgerControlAllocationMode: null,
      ledgerControlApprovalReason: null,
      assetBalance: { id: 41, accountId: policy.assetAccount.id, periodId: 40, companyCode: "TEST" },
      accumulatedBalance: { id: 42, accountId: policy.accumulatedAccount?.id ?? 31, periodId: 40, companyCode: "TEST" },
      impairmentBalance: null,
    }],
  };
}
