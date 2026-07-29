import { createHash } from "node:crypto";
import { Prisma, prisma } from "@workspace/platform/server/prisma";
import { buildAssetWorkbookImportCommand } from "../domain/asset-validation";
import { resolveFinanceAssetCategoryPolicy } from "./account-policy-resolver";
import { allocateFinanceAssetCode } from "./asset-code-allocation";
import { parseAssetWorkbook } from "./current-period-workbook";
import { currentPeriodAmount, type ParsedCurrentPeriodAsset } from "./current-period-workbook-types";
import { assetAccountingBasisChanged } from "./service";
import { moneyEquals } from "./money-cents";
import { requireStoredFinanceAssetDepreciationMethod } from "./depreciation-method";

export { parseAssetWorkbook } from "./current-period-workbook";
export type { AssetWorkbookScope, ParsedAssetWorkbook, ParsedCurrentPeriodAsset } from "./current-period-workbook-types";

type AssetWorkbookImportInput = {
  buffer: Buffer;
  sourceFile: string;
  companyCode: string;
  year: number;
  month: number;
  userId?: number;
};

export type AssetWorkbookImportDependencies = {
  database: Pick<typeof prisma, "$transaction">;
  parseWorkbook: typeof parseAssetWorkbook;
  resolvePolicy: typeof resolveFinanceAssetCategoryPolicy;
  allocateAssetCode: typeof allocateFinanceAssetCode;
};

const defaultAssetWorkbookImportDependencies: AssetWorkbookImportDependencies = {
  database: prisma,
  parseWorkbook: parseAssetWorkbook,
  resolvePolicy: resolveFinanceAssetCategoryPolicy,
  allocateAssetCode: allocateFinanceAssetCode,
};

export async function importAssetWorkbook(
  input: AssetWorkbookImportInput,
  overrides: Partial<AssetWorkbookImportDependencies> = {},
) {
  const dependencies = { ...defaultAssetWorkbookImportDependencies, ...overrides };
  const command = buildAssetWorkbookImportCommand(input);
  if (!command.ok) throw new Error(command.issue.message);
  input = command.data;
  const parsed = dependencies.parseWorkbook(input.buffer, input);
  if (!parsed.readyForImport) {
    throw new Error(`资产底稿存在 ${parsed.blockers.length} 个阻断项，停止导入：${[...new Set(parsed.blockers.map((item) => item.code))].join(", ")}`);
  }
  const missingStart = parsed.assets.find((asset) => !asset.depreciationStartDate);
  if (missingStart) throw new Error(`资产折旧摊销起算日期缺少明确来源证据，停止导入：${missingStart.name}`);
  const checksum = createHash("sha256").update(input.buffer).digest("hex");
  return dependencies.database.$transaction(async (tx) => {
    const company = await tx.company.findUnique({
      where: { code: input.companyCode },
      select: { id: true, code: true, party: { select: { name: true, fullName: true } } },
    });
    if (!company) throw new Error("目标公司不存在");
    assertWorkbookCompanyMatches(parsed.workbookCompanyLabels, company);
    const period = await tx.financePeriod.findUnique({
      where: { companyCode_year_month: { companyCode: input.companyCode, year: input.year, month: input.month } },
      select: { id: true, isClosed: true },
    });
    if (!period) throw new Error("目标会计期间不存在");
    if (period.isClosed) throw new Error("目标会计期间已关账，禁止导入或更新资产事实");
    const categoryCodes = [...new Set(parsed.assets.map((asset) => asset.categoryCandidate))];
    const categories = await tx.financeAssetCategory.findMany({ where: { code: { in: categoryCodes } }, select: { id: true, code: true, assetKind: true } });
    const categoryByCode = new Map(categories.map((category) => [category.code, category]));
    if (categoryByCode.size !== categoryCodes.length) throw new Error("资产分类不存在或无法唯一解析，停止导入");
    const policyByCategory = new Map<string, Awaited<ReturnType<typeof resolveFinanceAssetCategoryPolicy>>>();
    const methodByCategory = new Map<string, "straight_line">();
    for (const category of categories) {
      const policy = await dependencies.resolvePolicy(tx, { companyCode: input.companyCode, fiscalYear: input.year, categoryId: category.id });
      if (policy.category.id !== category.id || policy.category.code !== category.code || policy.category.assetKind !== category.assetKind) {
        throw new Error(`年度资产分类政策返回的分类不一致：${category.code}`);
      }
      policyByCategory.set(category.code, policy);
      methodByCategory.set(
        category.code,
        requireStoredFinanceAssetDepreciationMethod(policy.defaultMethod, `资产分类 ${category.code}`),
      );
    }
    const importBatch = await tx.financeAssetImportBatch.upsert({
      where: { companyCode_checksum: { companyCode: input.companyCode, checksum } },
      create: { companyCode: input.companyCode, companyId: company.id, sourceFile: parsed.scope.sourceFile, checksum, cardCount: parsed.assets.length, costLineCount: 0, warningCount: 0, importedBy: input.userId, note: `${input.year}-${String(input.month).padStart(2, "0")} 当前期受控资产导入` },
      update: { companyId: company.id, sourceFile: parsed.scope.sourceFile, cardCount: parsed.assets.length, costLineCount: 0, warningCount: 0, importedBy: input.userId },
    });
    let cardCount = 0;
    for (const asset of parsed.assets) {
      const category = categoryByCode.get(asset.categoryCandidate);
      const policy = policyByCategory.get(asset.categoryCandidate);
      const method = methodByCategory.get(asset.categoryCandidate);
      if (!category || !policy || !method) throw new Error(`资产分类政策不存在：${asset.name}`);
      if (category.assetKind !== asset.assetKind || policy.category.assetKind !== asset.assetKind || policy.category.id !== category.id) {
        throw new Error(`解析资产与年度分类政策不一致：${asset.name}`);
      }
      const usefulLifeMonths = asset.usefulLifeMonths ?? policy.defaultUsefulLifeMonths;
      if (!usefulLifeMonths) throw new Error(`资产使用寿命未由来源或年度分类政策补齐：${asset.name}`);
      if (policy.minimumUsefulLifeMonths != null && usefulLifeMonths < policy.minimumUsefulLifeMonths) throw new Error(`资产使用寿命低于年度分类政策下限：${asset.name}`);
      if (policy.maximumUsefulLifeMonths != null && usefulLifeMonths > policy.maximumUsefulLifeMonths) throw new Error(`资产使用寿命超过年度分类政策上限：${asset.name}`);
      const residualRate = asset.residualRate ?? policy.defaultResidualRate;
      if (residualRate == null) throw new Error(`资产残值率未由来源或年度分类政策补齐：${asset.name}`);
      const existing = await tx.financeAssetCard.findUnique({
        where: { companyCode_sourceKey: { companyCode: input.companyCode, sourceKey: asset.sourceKey } },
        include: {
          acquisitionEvidence: { select: { id: true } },
          disposal: { select: { id: true } },
          periodEntries: { where: { OR: [{ status: "posted" }, { voucher: { status: "posted" } }] }, select: { id: true }, take: 1 },
          impairmentAllocations: { where: { assessment: { status: "confirmed" } }, select: { id: true }, take: 1 },
        },
      });
      const data = cardData(asset, { ...input, companyId: company.id }, policy, usefulLifeMonths, residualRate, method);
      const accountingLocked = Boolean(existing && (existing.acquisitionEvidence || existing.disposal || existing.periodEntries.length > 0 || existing.impairmentAllocations.length > 0));
      if (existing && accountingLocked && assetAccountingBasisChanged(existing, { ...data, assetCode: existing.assetCode })) {
        throw new Error(`资产已有受控取得、过账、减值或处置事实，重导不得修改会计基础：${asset.name}`);
      }
      let card;
      if (existing) {
        const updated = await tx.financeAssetCard.updateMany({
          where: {
            id: existing.id,
            companyCode: input.companyCode,
            companyId: company.id,
            version: existing.version,
            status: existing.status,
            ...(accountingLocked ? {} : {
              acquisitionEvidence: { is: null },
              disposal: { is: null },
              periodEntries: { none: { OR: [{ status: "posted" }, { voucher: { status: "posted" } }] } },
              impairmentAllocations: { none: { assessment: { status: "confirmed" } } },
            }),
          },
          data: accountingLocked
            ? { name: data.name, note: data.note, editedBy: input.userId, version: { increment: 1 } }
            : { ...data, version: { increment: 1 } },
        });
        if (updated.count !== 1) throw new Error(`资产卡片已被其他事实修改，请刷新后重试：${asset.name}`);
        card = await tx.financeAssetCard.findUniqueOrThrow({ where: { id: existing.id } });
      } else {
        card = await tx.financeAssetCard.create({
          data: {
            ...data,
            status: "active",
            assetCode: (await dependencies.allocateAssetCode(tx, {
              companyCode: input.companyCode,
              fiscalYear: input.year,
              assetCategoryCode: policy.category.code,
              idempotencyKey: `import:${input.companyCode}:${asset.sourceKey}`,
            })).code,
          },
        });
      }
      const existingEvidence = await tx.financeAssetAcquisitionEvidence.findUnique({
        where: { assetId: card.id },
        select: { companyCode: true, companyId: true, importBatchId: true, voucherItemId: true, sourceChecksum: true },
      });
      if (existingEvidence && (existingEvidence.companyCode !== input.companyCode || existingEvidence.companyId !== company.id
        || existingEvidence.voucherItemId != null || existingEvidence.importBatchId !== importBatch.id || existingEvidence.sourceChecksum !== checksum)) {
        throw new Error(`资产取得证据已绑定其他受控来源：${asset.name}`);
      }
      await tx.financeAssetAcquisitionEvidence.upsert({
        where: { assetId: card.id },
        create: {
          companyCode: input.companyCode,
          companyId: company.id,
          periodId: period.id,
          assetId: card.id,
          importBatchId: importBatch.id,
          sourceChecksum: checksum,
          amount: asset.originalCost,
          evidenceRef: `${asset.sourceFile}:${asset.sourceSheet}:${asset.sourceRow}`,
          confirmedBy: input.userId,
        },
        update: {
          companyId: company.id,
          periodId: period.id,
          amount: asset.originalCost,
          evidenceRef: `${asset.sourceFile}:${asset.sourceSheet}:${asset.sourceRow}`,
          confirmedBy: input.userId,
          version: { increment: 1 },
        },
      });
      const existingPeriodEntry = await tx.financeAssetPeriodEntry.findUnique({
        where: { assetId_periodId: { assetId: card.id, periodId: period.id } },
        select: { normalAmount: true, status: true, voucherId: true },
      });
      if (existingPeriodEntry?.status === "posted" || existingPeriodEntry?.voucherId != null) {
        if (!moneyEquals(existingPeriodEntry.normalAmount, currentPeriodAmount(asset))) {
          throw new Error(`资产本期折旧摊销已过账，重导金额不一致：${asset.name}`);
        }
      } else {
        await tx.financeAssetPeriodEntry.upsert({
          where: { assetId_periodId: { assetId: card.id, periodId: period.id } },
          create: { assetId: card.id, periodId: period.id, normalAmount: currentPeriodAmount(asset), status: "calculated", voucherId: null, sourceFile: asset.sourceFile, sourceSheet: asset.sourceSheet, sourceRow: asset.sourceRow },
          update: { normalAmount: currentPeriodAmount(asset), status: "calculated", voucherId: null, sourceFile: asset.sourceFile, sourceSheet: asset.sourceSheet, sourceRow: asset.sourceRow },
        });
      }
      cardCount += 1;
    }
    return { cardCount, costEvidenceCount: parsed.renovationCostEvidence.length, blockerCount: 0, controls: parsed.controls };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

function cardData(asset: ParsedCurrentPeriodAsset, input: { companyCode: string; companyId: number; userId?: number }, policy: Awaited<ReturnType<typeof resolveFinanceAssetCategoryPolicy>>, usefulLifeMonths: number, residualRate: number, method: "straight_line") {
  const note = [
    asset.note,
    `sourceAssetCode=${asset.assetCode}`,
    `sourceRange=${asset.sourceRange}`,
    asset.depreciationStartEvidence ? `depreciationStartEvidence=${asset.depreciationStartEvidence}` : undefined,
    asset.depreciationStartSourceRange ? `depreciationStartSourceRange=${asset.depreciationStartSourceRange}` : undefined,
  ].filter(Boolean).join("；");
  return { companyCode: input.companyCode, companyId: input.companyId, name: asset.name, assetKind: asset.assetKind, categoryId: policy.category.id, sourceCategory: asset.sourceCategory, assetAccountCode: policy.assetAccount.code, assetAccountId: policy.assetAccount.id, accumulatedAccountCode: policy.accumulatedAccount?.code ?? null, accumulatedAccountId: policy.accumulatedAccount?.id ?? null, acquisitionDate: asset.acquisitionDate, depreciationStartDate: asset.depreciationStartDate, originalCost: asset.originalCost, residualRate, usefulLifeMonths, method, openingAccumulatedAmount: asset.openingAccumulatedAmount, openingAsOfDate: asset.openingAsOfDate, note, sourceFile: asset.sourceFile, sourceSheet: asset.sourceSheet, sourceRow: asset.sourceRow, sourceKey: asset.sourceKey, editedBy: input.userId };
}

function assertWorkbookCompanyMatches(
  labels: string[],
  company: { code: string; party: { name: string; fullName: string | null } },
) {
  const sourceLabels = [...new Set(labels.map(normalizeCompanyName).filter(Boolean))];
  if (sourceLabels.length === 0) throw new Error("资产底稿缺少可核对的公司名称，停止导入");
  const authoritativeNames = new Set(
    [company.party.name, company.party.fullName]
      .map((value) => normalizeCompanyName(value ?? ""))
      .filter(Boolean),
  );
  if (sourceLabels.some((label) => !authoritativeNames.has(label))) {
    throw new Error(`资产底稿公司名称与目标公司 ${company.code} 不一致，停止导入`);
  }
}

function normalizeCompanyName(value: string) {
  return value.normalize("NFKC").trim().toLocaleLowerCase("zh-CN").replace(/\s+/gu, "");
}
