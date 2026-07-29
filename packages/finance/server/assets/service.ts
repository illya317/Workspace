import { Prisma, prisma } from "@workspace/platform/server/prisma";
import type {
  FinanceAssetCardDto,
  FinanceAssetCategoryDto,
  FinanceAssetImpairmentConclusion,
  FinanceAssetKind,
  FinanceAssetWorkspaceDto,
} from "../../types/assets";
import { financeAssetCategoryPolicyDefaults } from "./account-policy";
import { allocateFinanceAssetCode, previewFinanceAssetCode } from "./asset-code-allocation";
import { financeAssetCreateCommandMatches } from "./asset-card-idempotency";
import {
  buildCreateFinanceAssetCardCommand,
  buildUpdateFinanceAssetCardCommand,
  type FinanceAssetCardCreateCommand,
  type FinanceAssetCardUpdateCommand,
  type FinanceAssetCodePreviewCommand,
} from "../domain/asset-validation";
import { assetPeriodVoucherLinkFingerprint } from "./period-scope";
import { resolveFinanceCompanyAccountsFromGroupPolicyAt } from "../ledger/group-accounts/company-account-resolver";
import { financeAssetPolicySemanticsMatch, type FinanceAssetPolicySemanticSnapshot } from "./asset-policy-inheritance";
import { assetAccountingBasisChanged, assetCardWriteData } from "./asset-card-write-policy";
import { moneyIsNonZero } from "./money-cents";
import { requireStoredFinanceAssetDepreciationMethod } from "./depreciation-method";

export { assetAccountingBasisChanged } from "./asset-card-write-policy";
export { deleteFinanceAssetCategoryPolicy, updateFinanceAssetCategoryPolicy } from "./asset-policy-service";

const money = (value: unknown) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
type FinanceAssetAccountSummary = { id: number; code: string; name: string };

export async function createFinanceAssetCard(command: FinanceAssetCardCreateCommand) {
  const validated = await buildCreateFinanceAssetCardCommand(command.input, command.userId);
  if (!validated.ok) throw new Error(validated.issue.message);
  command = validated.data;
  return prisma.$transaction(async (tx) => {
    const company = await tx.company.findUnique({ where: { code: command.input.companyCode }, select: { id: true } });
    if (!company) throw new Error("公司不存在");
    const idempotencyKey = `manual:${command.input.idempotencyKey}`;
    const sourceKey = idempotencyKey;
    const allocation = await allocateFinanceAssetCode(tx, {
      companyCode: command.input.companyCode,
      fiscalYear: command.input.accountYear,
      assetCategoryCode: command.category.code,
      idempotencyKey,
    });
    const createData = { ...assetCardWriteData(command.input, command.accounts, command.userId, allocation.code), companyId: company.id };
    const replay = await tx.financeAssetCard.findUnique({
      where: { companyCode_sourceKey: { companyCode: command.input.companyCode, sourceKey } },
    });
    if (replay) {
      if (replay.companyId !== company.id || !financeAssetCreateCommandMatches(replay, createData)) throw new Error("资产建卡请求标识已用于不同内容");
      return replay;
    }
    return tx.financeAssetCard.create({
      data: { ...createData, sourceKey },
    });
  });
}

export function previewFinanceAssetCardCode(command: FinanceAssetCodePreviewCommand) {
  return previewFinanceAssetCode({
    companyCode: command.companyCode,
    fiscalYear: command.year,
    assetCategoryCode: command.category.code,
  });
}

export async function updateFinanceAssetCard(command: FinanceAssetCardUpdateCommand) {
  const validated = await buildUpdateFinanceAssetCardCommand(command.input, command.userId);
  if (!validated.ok) throw new Error(validated.issue.message);
  command = validated.data;
  const input = command.input;
  return prisma.$transaction(async (tx) => {
    const existing = await tx.financeAssetCard.findUnique({
      where: { id: input.id },
      include: {
        disposal: { select: { id: true } },
        acquisitionEvidence: { select: { id: true } },
        periodEntries: {
          where: { OR: [{ status: "posted" }, { voucher: { status: "posted" } }] },
          select: { id: true },
          take: 1,
        },
        impairmentAllocations: {
          where: { assessment: { status: "confirmed" } },
          select: { id: true },
          take: 1,
        },
      },
    });
    if (!existing || existing.companyCode !== input.companyCode) throw new Error("资产卡片不存在或不属于当前公司");
    if (existing.version !== input.version) throw new Error("资产卡片已被其他人修改，请刷新后重试");
    if (input.assetCode !== existing.assetCode) throw new Error("资产编号生成后不可修改");
    const requested = assetCardWriteData(input, command.accounts, command.userId, existing.assetCode);
    const accountingLocked = Boolean(existing.disposal || existing.acquisitionEvidence || existing.periodEntries.length > 0 || existing.impairmentAllocations.length > 0);
    if (accountingLocked && assetAccountingBasisChanged(existing, requested)) {
      throw new Error("资产已有处置或已过账历史，普通编辑只能修改名称和备注；会计基础变更必须走调整或前期差错流程");
    }
    const updated = await tx.financeAssetCard.updateMany({
      where: { id: input.id, companyCode: input.companyCode, version: input.version },
      data: accountingLocked
        ? { name: requested.name, note: requested.note, editedBy: command.userId, version: { increment: 1 } }
        : { ...requested, version: { increment: 1 } },
    });
    if (updated.count !== 1) throw new Error("资产卡片已被其他人修改，请刷新后重试");
    return tx.financeAssetCard.findUniqueOrThrow({ where: { id: input.id } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

function toCardDto(card: Awaited<ReturnType<typeof loadCards>>[number], accountsByCode: Map<string, FinanceAssetAccountSummary>): FinanceAssetCardDto {
  const gross = card.costLines.length > 0 ? card.costLines.reduce((sum, line) => sum + money(line.amount), 0) : money(card.originalCost);
  const waived = card.costLines.filter((line) => line.treatment === "waived").reduce((sum, line) => sum + money(line.amount), 0);
  const assetAccount = accountsByCode.get(card.assetAccountCode) ?? null;
  const accumulatedAccount = card.accumulatedAccountCode ? accountsByCode.get(card.accumulatedAccountCode) ?? null : null;
  return {
    id: card.id,
    companyCode: card.companyCode,
    assetCode: card.assetCode,
    name: card.name,
    assetKind: card.assetKind as FinanceAssetKind,
    categoryId: card.categoryId,
    categoryCode: card.category.code,
    categoryName: card.category.name,
    assetAccountId: assetAccount?.id ?? null,
    assetAccountCode: card.assetAccountCode,
    assetAccountName: assetAccount?.name ?? null,
    accumulatedAccountId: accumulatedAccount?.id ?? null,
    accumulatedAccountCode: card.accumulatedAccountCode,
    accumulatedAccountName: accumulatedAccount?.name ?? null,
    acquisitionDate: card.acquisitionDate,
    depreciationStartDate: card.depreciationStartDate,
    originalCost: money(card.originalCost),
    residualRate: Number(card.residualRate),
    usefulLifeMonths: card.usefulLifeMonths,
    method: requireStoredFinanceAssetDepreciationMethod(card.method, `资产 ${card.assetCode}`),
    openingAccumulatedAmount: money(card.openingAccumulatedAmount),
    status: card.status,
    nonAmortizationReason: card.nonAmortizationReason,
    note: card.note,
    sourceSheet: card.sourceSheet,
    sourceRow: card.sourceRow,
    openingAsOfDate: card.openingAsOfDate,
    version: card.version,
    grossCost: money(gross),
    waivedCost: money(waived),
    capitalizedCost: money(gross - waived),
  };
}

function loadCards(companyCode: string) {
  return prisma.financeAssetCard.findMany({
    where: { companyCode },
    include: { category: true, costLines: { orderBy: { sourceRow: "asc" } } },
    orderBy: [{ status: "asc" }, { assetCode: "asc" }],
  });
}

async function loadAssetAccountsByCode(companyCode: string, year: number, codes: Array<string | null | undefined>) {
  const uniqueCodes = [...new Set(codes.filter((code): code is string => Boolean(code)))];
  if (uniqueCodes.length === 0) return new Map<string, FinanceAssetAccountSummary>();
  const accounts = await prisma.financeAccount.findMany({
    where: { companyCode, year, code: { in: uniqueCodes } },
    select: { id: true, code: true, name: true },
  });
  return new Map(accounts.map((account) => [account.code, account]));
}

type LocalFinanceAssetCategoryDto = Omit<FinanceAssetCategoryDto, "policySource"> & {
  policySource: "saved" | "system_default";
};

async function loadLocalAssetCategories(companyCode: string, year: number): Promise<LocalFinanceAssetCategoryDto[]> {
  const categories = await prisma.financeAssetCategory.findMany({
    where: { isActive: true, reviewStatus: "confirmed" },
    include: {
      accountPolicies: {
        where: { companyCode, year },
        include: {
          assetAccount: { select: { id: true, code: true, name: true } },
          accumulatedAccount: { select: { id: true, code: true, name: true } },
          expenseAccount: { select: { id: true, code: true, name: true } },
          impairmentLossAccount: { select: { id: true, code: true, name: true } },
          impairmentAllowanceAccount: { select: { id: true, code: true, name: true } },
          disposalGainLossAccount: { select: { id: true, code: true, name: true } },
        },
        orderBy: { id: "asc" },
        take: 1,
      },
    },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });
  const defaults = new Map(categories.map((category) => [
    category.id,
    financeAssetCategoryPolicyDefaults({
      ...category,
      assetKind: category.assetKind as FinanceAssetKind,
    }),
  ]));
  const accountsByCode = await loadAssetAccountsByCode(companyCode, year, categories.flatMap((category) => {
    const policyDefaults = defaults.get(category.id)!;
    return [policyDefaults.assetAccountCode, policyDefaults.accumulatedAccountCode];
  }));
  return categories.map((category) => {
    const policy = category.accountPolicies[0] ?? null;
    const policyDefaults = defaults.get(category.id)!;
    const assetAccount = policy?.assetAccount ?? accountsByCode.get(policyDefaults.assetAccountCode) ?? null;
    const accumulatedAccount = policy?.accumulatedAccount
      ?? (policyDefaults.accumulatedAccountCode ? accountsByCode.get(policyDefaults.accumulatedAccountCode) ?? null : null);
    const expenseAccount = policy?.expenseAccount ?? null;
    const impairmentLossAccount = policy?.impairmentLossAccount ?? null;
    const impairmentAllowanceAccount = policy?.impairmentAllowanceAccount ?? null;
    const disposalGainLossAccount = policy?.disposalGainLossAccount ?? null;
    const defaultResidualRate = policy ? Number(policy.defaultResidualRate) : policyDefaults.defaultResidualRate;
    return {
      id: category.id,
      code: category.code,
      name: category.name,
      assetKind: category.assetKind as FinanceAssetKind,
      defaultUsefulLifeMonths: policy ? policy.defaultUsefulLifeMonths : policyDefaults.defaultUsefulLifeMonths,
      defaultResidualRatePercent: Math.round(defaultResidualRate * 100),
      defaultMethod: requireStoredFinanceAssetDepreciationMethod(
        policy?.defaultMethod ?? policyDefaults.defaultMethod,
        `资产分类 ${category.code}`,
      ),
      depreciable: category.depreciable,
      policyId: policy?.id ?? null,
      policyVersion: policy?.version ?? 0,
      companyPolicyVersion: policy?.version ?? 0,
      policySource: policy ? "saved" as const : "system_default" as const,
      policyMappingIssue: null,
      assetAccountId: assetAccount?.id ?? null,
      assetAccountCode: assetAccount?.code ?? null,
      assetAccountName: assetAccount?.name ?? null,
      accumulatedAccountId: accumulatedAccount?.id ?? null,
      accumulatedAccountCode: accumulatedAccount?.code ?? null,
      accumulatedAccountName: accumulatedAccount?.name ?? null,
      expenseAccountId: expenseAccount?.id ?? null,
      expenseAccountCode: expenseAccount?.code ?? null,
      expenseAccountName: expenseAccount?.name ?? null,
      impairmentLossAccountId: impairmentLossAccount?.id ?? null,
      impairmentLossAccountCode: impairmentLossAccount?.code ?? null,
      impairmentLossAccountName: impairmentLossAccount?.name ?? null,
      impairmentAllowanceAccountId: impairmentAllowanceAccount?.id ?? null,
      impairmentAllowanceAccountCode: impairmentAllowanceAccount?.code ?? null,
      impairmentAllowanceAccountName: impairmentAllowanceAccount?.name ?? null,
      disposalGainLossAccountId: disposalGainLossAccount?.id ?? null,
      disposalGainLossAccountCode: disposalGainLossAccount?.code ?? null,
      disposalGainLossAccountName: disposalGainLossAccount?.name ?? null,
      usefulLifeMode: (policy?.usefulLifeMode ?? policyDefaults.usefulLifeMode) as FinanceAssetCategoryDto["usefulLifeMode"],
      minimumUsefulLifeMonths: policy ? policy.minimumUsefulLifeMonths : policyDefaults.minimumUsefulLifeMonths,
      maximumUsefulLifeMonths: policy ? policy.maximumUsefulLifeMonths : policyDefaults.maximumUsefulLifeMonths,
      reviewRequired: policy?.reviewRequired ?? policyDefaults.reviewRequired,
      classificationRule: policy?.classificationRule ?? policyDefaults.classificationRule,
    };
  });
}

async function loadAssetPolicyCategories(companyCode: string, year: number) {
  const groupCompany = await resolveFinanceGroupPolicyCompany(prisma, { companyCode, fiscalYear: year });
  const groupLocalCategories = await loadLocalAssetCategories(groupCompany.code, year);
  const groupCategories: FinanceAssetCategoryDto[] = groupLocalCategories.map((category) => ({
    ...category,
    companyPolicyVersion: 0,
    policySource: category.policySource === "saved" ? "group" : "system_default",
  }));
  if (groupCompany.code === companyCode) {
    return {
      categories: groupCategories,
      policyGroup: { companyCode: groupCompany.code, companyName: groupCompany.name, categories: groupCategories },
    };
  }
  const companyLocalCategories = await loadLocalAssetCategories(companyCode, year);
  const accountResolution = await resolveFinanceCompanyAccountsFromGroupPolicyAt({
    sourceAccountIds: groupCategories.flatMap((category) => [
      category.assetAccountId,
      category.accumulatedAccountId,
      category.expenseAccountId,
      category.impairmentLossAccountId,
      category.impairmentAllowanceAccountId,
      category.disposalGainLossAccountId,
    ].filter((id): id is number => id !== null)),
    targetCompanyCode: companyCode,
    fiscalYear: year,
    effectiveAt: `${year}-12-31`,
  });
  const accountResolutionBySourceId = new Map(accountResolution.resolutions.map((resolution) => [resolution.sourceAccountId, resolution]));
  const groupByCategoryId = new Map(groupCategories.map((category) => [category.id, category]));
  const categories = companyLocalCategories.map<FinanceAssetCategoryDto>((companyCategory) => {
    const groupCategory = groupByCategoryId.get(companyCategory.id) ?? null;
    const inheritedCategory = groupCategory
      ? remapInheritedPolicyAccounts(groupCategory, accountResolutionBySourceId)
      : null;
    const isCompanyOverride = companyCategory.policySource === "saved" && (
      !inheritedCategory
      || inheritedCategory.policySource !== "group"
      || Boolean(inheritedCategory.policyMappingIssue)
      || !financeAssetPolicySemanticsMatch(policySemanticSnapshot(companyCategory), policySemanticSnapshot(inheritedCategory))
    );
    if (isCompanyOverride) return { ...companyCategory, policySource: "company_override" };
    if (!inheritedCategory) return { ...companyCategory, policySource: "system_default" };
    return { ...inheritedCategory, companyPolicyVersion: companyCategory.companyPolicyVersion };
  });
  return {
    categories,
    policyGroup: { companyCode: groupCompany.code, companyName: groupCompany.name, categories: groupCategories },
  };
}

function policySemanticSnapshot(category: FinanceAssetCategoryDto): FinanceAssetPolicySemanticSnapshot {
  return {
    assetAccountCode: category.assetAccountCode,
    accumulatedAccountCode: category.accumulatedAccountCode,
    expenseAccountCode: category.expenseAccountCode,
    impairmentLossAccountCode: category.impairmentLossAccountCode,
    impairmentAllowanceAccountCode: category.impairmentAllowanceAccountCode,
    disposalGainLossAccountCode: category.disposalGainLossAccountCode,
    defaultUsefulLifeMonths: category.defaultUsefulLifeMonths,
    defaultResidualRatePercent: category.defaultResidualRatePercent,
    defaultMethod: category.defaultMethod,
    usefulLifeMode: category.usefulLifeMode,
    minimumUsefulLifeMonths: category.minimumUsefulLifeMonths,
    maximumUsefulLifeMonths: category.maximumUsefulLifeMonths,
    reviewRequired: category.reviewRequired,
    classificationRule: category.classificationRule,
  };
}

function remapInheritedPolicyAccounts(
  category: FinanceAssetCategoryDto,
  resolutions: Map<number, Awaited<ReturnType<typeof resolveFinanceCompanyAccountsFromGroupPolicyAt>>["resolutions"][number]>,
): FinanceAssetCategoryDto {
  const asset = category.assetAccountId ? resolutions.get(category.assetAccountId)?.targetAccount ?? null : null;
  const accumulated = category.accumulatedAccountId ? resolutions.get(category.accumulatedAccountId)?.targetAccount ?? null : null;
  const expense = category.expenseAccountId ? resolutions.get(category.expenseAccountId)?.targetAccount ?? null : null;
  const impairmentLoss = category.impairmentLossAccountId ? resolutions.get(category.impairmentLossAccountId)?.targetAccount ?? null : null;
  const impairmentAllowance = category.impairmentAllowanceAccountId ? resolutions.get(category.impairmentAllowanceAccountId)?.targetAccount ?? null : null;
  const disposalGainLoss = category.disposalGainLossAccountId ? resolutions.get(category.disposalGainLossAccountId)?.targetAccount ?? null : null;
  const unresolved = [
    category.assetAccountId ? ["资产科目", resolutions.get(category.assetAccountId)?.status] as const : null,
    category.accumulatedAccountId ? ["累计折旧/摊销科目", resolutions.get(category.accumulatedAccountId)?.status] as const : null,
    category.expenseAccountId ? ["折旧/摊销费用科目", resolutions.get(category.expenseAccountId)?.status] as const : null,
    category.impairmentLossAccountId ? ["减值损失科目", resolutions.get(category.impairmentLossAccountId)?.status] as const : null,
    category.impairmentAllowanceAccountId ? ["减值准备科目", resolutions.get(category.impairmentAllowanceAccountId)?.status] as const : null,
    category.disposalGainLossAccountId ? ["资产处置损益科目", resolutions.get(category.disposalGainLossAccountId)?.status] as const : null,
  ].filter((item): item is readonly [string, string | undefined] => Boolean(item && item[1] !== "mapped"));
  return {
    ...category,
    policyMappingIssue: unresolved.length > 0 ? `${unresolved.map(([label]) => label).join("、")}无法通过现有集团科目映射唯一落到当前公司，请单独设置公司政策` : null,
    assetAccountId: asset?.id ?? null,
    assetAccountCode: asset?.code ?? category.assetAccountCode,
    assetAccountName: asset?.name ?? null,
    accumulatedAccountId: accumulated?.id ?? null,
    accumulatedAccountCode: accumulated?.code ?? category.accumulatedAccountCode,
    accumulatedAccountName: accumulated?.name ?? null,
    expenseAccountId: expense?.id ?? null,
    expenseAccountCode: expense?.code ?? category.expenseAccountCode,
    expenseAccountName: expense?.name ?? null,
    impairmentLossAccountId: impairmentLoss?.id ?? null,
    impairmentLossAccountCode: impairmentLoss?.code ?? category.impairmentLossAccountCode,
    impairmentLossAccountName: impairmentLoss?.name ?? null,
    impairmentAllowanceAccountId: impairmentAllowance?.id ?? null,
    impairmentAllowanceAccountCode: impairmentAllowance?.code ?? category.impairmentAllowanceAccountCode,
    impairmentAllowanceAccountName: impairmentAllowance?.name ?? null,
    disposalGainLossAccountId: disposalGainLoss?.id ?? null,
    disposalGainLossAccountCode: disposalGainLoss?.code ?? category.disposalGainLossAccountCode,
    disposalGainLossAccountName: disposalGainLoss?.name ?? null,
  };
}

export async function listFinanceAssetWorkspace(scope: { companyCode: string; year: number; month: number }): Promise<FinanceAssetWorkspaceDto> {
  const [company, period] = await Promise.all([
    prisma.company.findUnique({ where: { code: scope.companyCode }, select: { id: true, party: { select: { name: true } } } }),
    prisma.financePeriod.findUnique({
      where: { companyCode_year_month: scope },
      select: { id: true, isClosed: true },
    }),
  ]);
  if (!company) throw new Error(`公司 ${scope.companyCode} 不存在`);
  const resolvedScope = { ...scope, companyId: company.id, companyName: company.party.name };
  const cards = await loadCards(scope.companyCode);
  const { categories, policyGroup } = await loadAssetPolicyCategories(scope.companyCode, scope.year);
  if (!period) {
    const accountsByCode = await loadAssetAccountsByCode(scope.companyCode, scope.year, cards.flatMap((card) => [card.assetAccountCode, card.accumulatedAccountCode]));
    return emptyWorkspace(resolvedScope, policyGroup, categories, cards.map((card) => toCardDto(card, accountsByCode)));
  }
  const [entries, adjustments, impairmentAssessment, disposals] = await Promise.all([
    prisma.financeAssetPeriodEntry.findMany({
      where: { periodId: period.id, asset: { companyCode: scope.companyCode } },
      include: { asset: true, voucher: { select: { voucherNo: true } } },
      orderBy: { asset: { assetCode: "asc" } },
    }),
    prisma.financeAssetAdjustment.findMany({
      where: { periodId: period.id, companyCode: scope.companyCode },
      include: { asset: { select: { name: true } }, voucher: { select: { voucherNo: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.financeAssetImpairmentAssessment.findUnique({
      where: { companyCode_periodId: { companyCode: scope.companyCode, periodId: period.id } },
      include: {
        voucher: { select: { voucherNo: true } },
        allocations: { include: { asset: { select: { assetCode: true, name: true } } }, orderBy: { assetId: "asc" } },
      },
    }),
    prisma.financeAssetDisposal.findMany({
      where: { companyCode: scope.companyCode },
      include: { asset: { select: { assetCode: true, name: true } }, voucher: { select: { voucherNo: true } } },
      orderBy: [{ disposalDate: "desc" }, { id: "desc" }],
    }),
  ]);
  const accountsByCode = await loadAssetAccountsByCode(scope.companyCode, scope.year, [
    ...cards.flatMap((card) => [card.assetAccountCode, card.accumulatedAccountCode]),
    ...adjustments.map((item) => item.accountCode),
  ]);
  const confirmedAdjustments = adjustments.filter((item) => item.status === "confirmed");
  const adjustmentByAsset = new Map<number, number>();
  for (const item of confirmedAdjustments) {
    if (item.assetId) adjustmentByAsset.set(item.assetId, money((adjustmentByAsset.get(item.assetId) ?? 0) + money(item.amount)));
  }
  const periodRows = entries.map((entry) => {
    const normalAmount = money(entry.normalAmount);
    const adjustmentAmount = adjustmentByAsset.get(entry.assetId) ?? 0;
    return {
      assetId: entry.assetId,
      assetCode: entry.asset.assetCode,
      name: entry.asset.name,
      assetKind: entry.asset.assetKind as FinanceAssetKind,
      accountCode: entry.asset.accumulatedAccountCode || entry.asset.assetAccountCode,
      depreciationStartDate: entry.asset.depreciationStartDate,
      originalCost: money(entry.asset.originalCost),
      normalAmount,
      adjustmentAmount,
      periodAmount: money(normalAmount + adjustmentAmount),
      status: entry.status,
      voucherNo: entry.voucher?.voucherNo ?? null,
    };
  });
  const normalAmount = money(entries.reduce((sum, item) => sum + money(item.normalAmount), 0));
  const adjustmentAmount = money(confirmedAdjustments.reduce((sum, item) => sum + money(item.amount), 0));
  return {
    scope: { ...resolvedScope, periodId: period.id, isClosed: period.isClosed },
    policyGroup,
    categories,
    cards: cards.map((card) => toCardDto(card, accountsByCode)),
    periodRows,
    adjustments: adjustments.map((item) => ({
      id: item.id,
      assetId: item.assetId,
      assetName: item.asset?.name ?? null,
      accountId: accountsByCode.get(item.accountCode)?.id ?? null,
      accountCode: item.accountCode,
      accountName: accountsByCode.get(item.accountCode)?.name ?? null,
      amount: money(item.amount),
      reason: item.reason,
      status: item.status,
      voucherNo: item.voucher?.voucherNo ?? null,
      sourceSheet: item.sourceSheet,
      sourceRow: item.sourceRow,
      createdAt: item.createdAt.toISOString(),
    })),
    impairmentAssessment: impairmentAssessment ? {
      id: impairmentAssessment.id,
      conclusion: impairmentAssessment.conclusion as FinanceAssetImpairmentConclusion,
      basis: impairmentAssessment.basis,
      evidenceRef: impairmentAssessment.evidenceRef,
      impairmentAmount: money(impairmentAssessment.impairmentAmount),
      voucherId: impairmentAssessment.voucherId,
      voucherNo: impairmentAssessment.voucher?.voucherNo ?? null,
      assetScopeFingerprint: impairmentAssessment.assetScopeFingerprint,
      calculationBasisFingerprint: impairmentAssessment.calculationBasisFingerprint,
      assetCount: impairmentAssessment.assetCount,
      status: "confirmed",
      assessedBy: impairmentAssessment.assessedBy,
      confirmedAt: impairmentAssessment.confirmedAt.toISOString(),
      version: impairmentAssessment.version,
      allocations: impairmentAssessment.allocations.map((row) => ({
        assetId: row.assetId,
        assetCode: row.asset.assetCode,
        assetName: row.asset.name,
        amount: money(row.amount),
      })),
    } : null,
    disposals: disposals.map((row) => ({
      id: row.id,
      assetId: row.assetId,
      assetCode: row.asset.assetCode,
      assetName: row.asset.name,
      disposalDate: row.disposalDate,
      disposalType: row.disposalType as "sold" | "scrapped" | "retired" | "other",
      proceedsAmount: money(row.proceedsAmount),
      reason: row.reason,
      evidenceRef: row.evidenceRef,
      voucherId: row.voucherId,
      voucherNo: row.voucher.voucherNo,
      status: "confirmed",
      confirmedAt: row.confirmedAt.toISOString(),
      version: row.version,
    })),
    periodVoucherLink: {
      voucherNo: uniqueLinkedVoucherNo(entries, confirmedAdjustments),
      linkFingerprint: assetPeriodVoucherLinkFingerprint({
        entries: entries.map((entry) => ({
          id: entry.id,
          voucherId: entry.voucherId,
          status: entry.status,
          accountCode: entry.asset.accumulatedAccountCode || entry.asset.assetAccountCode,
          expenseAccountCode: categories.find((category) => category.id === entry.asset.categoryId)?.expenseAccountCode ?? "",
          amount: entry.normalAmount,
        })),
        adjustments: adjustments.map((row) => ({
          ...row,
          expenseAccountCode: row.assetId == null ? null : categories.find((category) => category.id === cards.find((card) => card.id === row.assetId)?.categoryId)?.expenseAccountCode ?? null,
        })),
      }),
    },
    metrics: {
      normalAmount,
      adjustmentAmount,
      periodAmount: money(normalAmount + adjustmentAmount),
    },
  };
}

function emptyWorkspace(
  scope: { companyId: number; companyCode: string; companyName: string; year: number; month: number },
  policyGroup: FinanceAssetWorkspaceDto["policyGroup"],
  categories: FinanceAssetCategoryDto[],
  cards: FinanceAssetCardDto[],
): FinanceAssetWorkspaceDto {
  return { scope: { ...scope, periodId: null, isClosed: false }, policyGroup, categories, cards, periodRows: [], adjustments: [], impairmentAssessment: null, disposals: [], periodVoucherLink: { voucherNo: null, linkFingerprint: assetPeriodVoucherLinkFingerprint({ entries: [], adjustments: [] }) }, metrics: { normalAmount: 0, adjustmentAmount: 0, periodAmount: 0 } };
}

function uniqueLinkedVoucherNo(
  entries: Array<{ normalAmount: unknown; voucher?: { voucherNo: string } | null }>,
  adjustments: Array<{ amount: unknown; voucher?: { voucherNo: string } | null }>,
) {
  const linked = unique([
    ...entries.filter((row) => moneyIsNonZero(row.normalAmount)).flatMap((row) => row.voucher?.voucherNo ?? []),
    ...adjustments.filter((row) => moneyIsNonZero(row.amount)).flatMap((row) => row.voucher?.voucherNo ?? []),
  ]);
  return linked.length === 1 ? linked[0]! : null;
}

function unique<T>(items: T[]) {
  return [...new Set(items)];
}
