import { createHash } from "node:crypto";
import { Prisma, prisma } from "@workspace/platform/server/prisma";
import { buildAssetWorkbookImportCommand } from "../domain/asset-validation";
import { resolveFinanceAssetCategoryPolicy } from "./account-policy-resolver";
import { allocateFinanceAssetCode } from "./asset-code-allocation";
import { parseAssetWorkbook } from "./current-period-workbook";
import type { ParsedCurrentPeriodAsset } from "./current-period-workbook-types";
import { assetAccountingBasisChanged } from "./service";
import { requireStoredFinanceAssetDepreciationMethod } from "./depreciation-method";
import { firstMonthAfterFinanceAssetCutover, FINANCE_ASSET_LEGACY_CUTOVER_MODE } from "./legacy-cutover";
import { gateFinanceAssetLegacyCutoverBlockers } from "./legacy-cutover-blocker-gate";
import { isExecutionApprovedGovernedReconciler } from "./approved-cutover-config";
import {
  validateFinanceAssetLedgerCutoverResult,
  type FinanceAssetCutoverAuthoritativeContext,
  type FinanceAssetLedgerCutoverResult,
} from "./legacy-cutover-reconciliation";

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
  reconcileCutover: (
    tx: Prisma.TransactionClient,
    input: {
      companyCode: string;
      companyId: number;
      year: number;
      month: number;
      cutoverDate: string;
      periodId: number;
      authoritativeContext: FinanceAssetCutoverAuthoritativeContext;
      assets: Array<{
        sourceKey: string;
        sourceFile: string;
        sourceSheet: string;
        sourceRow: number;
        originalCost: number;
        workbookNetBookValue: number;
        workbookAccumulatedAmount: number;
        fullUsefulLifeMonths: number;
        remainingUsefulLifeMonthsAtCutover: number;
        cutoverResidualValue: number;
        assetAccountId: number;
        accumulatedAccountId: number | null;
        impairmentAllowanceAccountId: number | null;
      }>;
    },
  ) => Promise<FinanceAssetLedgerCutoverResult>;
};

const defaultAssetWorkbookImportDependencies: AssetWorkbookImportDependencies = {
  database: prisma,
  parseWorkbook: parseAssetWorkbook,
  resolvePolicy: resolveFinanceAssetCategoryPolicy,
  allocateAssetCode: allocateFinanceAssetCode,
  reconcileCutover: async () => {
    throw new Error("资产切点总账核对结果尚未注入，停止导入");
  },
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
  const blockerGate = gateFinanceAssetLegacyCutoverBlockers({
    year: input.year,
    month: input.month,
    hasErpGlReconciliation: overrides.reconcileCutover != null,
    blockers: parsed.blockers,
  });
  if (blockerGate.blocking.length > 0 || (!parsed.readyForImport && parsed.blockers.length === 0)) {
    const codes = [...new Set(blockerGate.blocking.map((item) => item.code))];
    throw new Error(`资产底稿存在 ${blockerGate.blocking.length || 1} 个阻断项，停止导入：${codes.join(", ") || "PARSER_READY_STATE_INVALID"}`);
  }
  const workbookWarnings = [...parsed.warnings, ...blockerGate.warnings];
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
      select: { id: true, companyCode: true, companyId: true, year: true, month: true, startDate: true, endDate: true, isClosed: true },
    });
    if (!period) throw new Error("目标会计期间不存在");
    if (blockerGate.warnings.length > 0 && period.endDate !== blockerGate.cutoverDate) {
      throw new Error(`GL 覆盖阻断仅允许 ${blockerGate.cutoverDate} 历史资产切点`);
    }
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
    const cutoverDate = period.endDate;
    const governedReconciler = isExecutionApprovedGovernedReconciler(dependencies.reconcileCutover);
    if ((blockerGate.warnings.length > 0 || parsed.assets.some(isLegacySyntheticAsset)) && !governedReconciler) {
      throw new Error("资产解析阻断降级或合成资产必须使用审批文件创建的执行级 governed reconciler");
    }
    const preparedAssets = parsed.assets.map((asset) => {
      const policy = policyByCategory.get(asset.categoryCandidate);
      if (!policy) throw new Error(`资产分类政策不存在：${asset.name}`);
      const basis = resolveCutoverAccountingBasis(asset, policy, cutoverDate);
      return {
        sourceKey: asset.sourceKey,
        sourceFile: asset.sourceFile,
        sourceSheet: asset.sourceSheet,
        sourceRow: asset.sourceRow,
        originalCost: asset.originalCost,
        workbookNetBookValue: asset.closingNetAmount,
        workbookAccumulatedAmount: cutoverAccumulatedAmount(asset),
        fullUsefulLifeMonths: basis.fullUsefulLifeMonths,
        remainingUsefulLifeMonthsAtCutover: basis.remainingUsefulLifeMonthsAtCutover,
        cutoverResidualValue: basis.cutoverResidualValue,
        residualRate: basis.residualRate,
        assetAccountId: policy.assetAccount.id,
        accumulatedAccountId: policy.accumulatedAccount?.id ?? null,
        impairmentAllowanceAccountId: policy.impairmentAllowanceAccount?.id ?? null,
      };
    });
    const authoritativeContext = await loadAuthoritativeCutoverContext(tx, {
      companyCode: input.companyCode,
      companyId: company.id,
      period,
      accountIds: [...new Set(preparedAssets.flatMap((asset) => [
        asset.assetAccountId,
        asset.accumulatedAccountId,
        asset.impairmentAllowanceAccountId,
      ]).filter((value): value is number => value != null))],
    });
    const reconciliation = await dependencies.reconcileCutover(tx, {
      companyCode: input.companyCode,
      companyId: company.id,
      year: input.year,
      month: input.month,
      cutoverDate,
      periodId: period.id,
      authoritativeContext,
      assets: preparedAssets,
    });
    const requiresTrustedProvider = reconciliation.allocations.some((row) => row.ledgerControlAdjustment !== 0)
      || reconciliation.accountControls.some((control) => control.allocationMode !== "standard"
        || control.selection === "controlled_zero" || control.approvalReason != null || control.approvedSelectedAmount != null);
    if (requiresTrustedProvider && !governedReconciler) {
      throw new Error("资产总账覆盖、受控零余额或审批调整必须来自审批文件创建的执行级 governed reconciler");
    }
    const validatedAllocationBySourceKey = validateFinanceAssetLedgerCutoverResult({
      companyCode: input.companyCode,
      companyId: company.id,
      year: input.year,
      month: input.month,
      cutoverDate,
      periodId: period.id,
      authoritativeContext,
      cards: preparedAssets.map((asset) => ({
        sourceKey: asset.sourceKey,
        originalCost: asset.originalCost,
        workbookNetBookValue: asset.workbookNetBookValue,
        workbookAccumulatedAmount: asset.workbookAccumulatedAmount,
        fullUsefulLifeMonths: asset.fullUsefulLifeMonths,
        remainingUsefulLifeMonthsAtCutover: asset.remainingUsefulLifeMonthsAtCutover,
        cutoverResidualValue: asset.cutoverResidualValue,
        assetAccountId: asset.assetAccountId,
        accumulatedAccountId: asset.accumulatedAccountId,
        impairmentAllowanceAccountId: asset.impairmentAllowanceAccountId,
      })),
      result: reconciliation,
    });
    const allocationBySourceKey = canonicalizeFinanceAssetCutoverEstimates(preparedAssets, validatedAllocationBySourceKey);
    const reconciliationFingerprint = canonicalReconciliationFingerprint(reconciliation.fingerprint, allocationBySourceKey);
    const syntheticAssets = parsed.assets.filter(isLegacySyntheticAsset);
    if (syntheticAssets.length > 1) throw new Error("本期装修成本证据只能绑定一张受控合成资产卡");
    const expectedCostLineCount = syntheticAssets.length === 1 ? parsed.renovationCostEvidence.length : 0;
    const importBatch = await tx.financeAssetImportBatch.upsert({
      where: { companyCode_checksum: { companyCode: input.companyCode, checksum } },
      create: { companyCode: input.companyCode, companyId: company.id, sourceFile: parsed.scope.sourceFile, checksum, cardCount: parsed.assets.length, costLineCount: expectedCostLineCount, warningCount: workbookWarnings.length + reconciliation.warnings.length, importedBy: input.userId, note: importBatchNote(cutoverDate, blockerGate.warnings, reconciliation.executionApproval), cutoverDate, cutoverPeriodId: period.id, ledgerReconciliationFingerprint: reconciliationFingerprint, ledgerNetBookValue: reconciliation.ledgerNetBookValue, importedNetBookValue: reconciliation.importedNetBookValue, unallocatedNetBookValue: reconciliation.unallocatedNetBookValue, reconciliationStatus: reconciliation.status },
      update: { companyId: company.id, sourceFile: parsed.scope.sourceFile, cardCount: parsed.assets.length, costLineCount: expectedCostLineCount, warningCount: workbookWarnings.length + reconciliation.warnings.length, importedBy: input.userId, note: importBatchNote(cutoverDate, blockerGate.warnings, reconciliation.executionApproval), cutoverDate, cutoverPeriodId: period.id, ledgerReconciliationFingerprint: reconciliationFingerprint, ledgerNetBookValue: reconciliation.ledgerNetBookValue, importedNetBookValue: reconciliation.importedNetBookValue, unallocatedNetBookValue: reconciliation.unallocatedNetBookValue, reconciliationStatus: reconciliation.status },
    });
    let cardCount = 0;
    let costLineCount = 0;
    for (const asset of parsed.assets) {
      const category = categoryByCode.get(asset.categoryCandidate);
      const policy = policyByCategory.get(asset.categoryCandidate);
      const method = methodByCategory.get(asset.categoryCandidate);
      const allocation = allocationBySourceKey.get(asset.sourceKey);
      const prepared = preparedAssets.find((item) => item.sourceKey === asset.sourceKey);
      if (!category || !policy || !method || !allocation || !prepared) throw new Error(`资产分类政策或切点分配不存在：${asset.name}`);
      if (category.assetKind !== asset.assetKind || policy.category.assetKind !== asset.assetKind || policy.category.id !== category.id) {
        throw new Error(`解析资产与年度分类政策不一致：${asset.name}`);
      }
      const usefulLifeMonths = prepared.fullUsefulLifeMonths;
      const policyLifeForValidation = usefulLifeMonths;
      if (policy.minimumUsefulLifeMonths != null && policyLifeForValidation < policy.minimumUsefulLifeMonths) throw new Error(`资产使用寿命低于年度分类政策下限：${asset.name}`);
      if (policy.maximumUsefulLifeMonths != null && policyLifeForValidation > policy.maximumUsefulLifeMonths) throw new Error(`资产使用寿命超过年度分类政策上限：${asset.name}`);
      const residualRate = prepared.residualRate;
      const existing = await tx.financeAssetCard.findUnique({
        where: { companyCode_sourceKey: { companyCode: input.companyCode, sourceKey: asset.sourceKey } },
        include: {
          acquisitionEvidence: { select: { id: true } },
          disposal: { select: { id: true } },
          periodEntries: { select: { id: true, status: true, voucherId: true } },
          impairmentAllocations: { where: { assessment: { status: "confirmed" } }, select: { id: true }, take: 1 },
        },
      });
      const data = cardData(asset, { ...input, companyId: company.id }, policy, usefulLifeMonths, residualRate, method, allocation, reconciliationFingerprint, period.id, cutoverDate, reconciliation.executionApproval);
      const postedEntries = existing?.periodEntries.filter((entry) => entry.status === "posted" || entry.voucherId != null) ?? [];
      if (existing && allocation.allocationStatus === "pending" && existing.periodEntries.length > 0) {
        throw new Error(`资产切点待分配前必须先清理已有折旧摊销条目：${asset.name}`);
      }
      const accountingLocked = Boolean(existing && (existing.acquisitionEvidence || existing.disposal || postedEntries.length > 0 || existing.impairmentAllocations.length > 0));
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
      if (isLegacySyntheticAsset(asset)) {
        const expectedSourceKeys = new Set(parsed.renovationCostEvidence.map((line) => line.sourceKey));
        if (expectedSourceKeys.size !== parsed.renovationCostEvidence.length) throw new Error("装修成本证据 sourceKey 缺失或重复");
        const existingCostLines = await tx.financeAssetCostLine.findMany({ where: { assetId: card.id }, select: { sourceKey: true } });
        const stale = existingCostLines.find((line) => !line.sourceKey || !expectedSourceKeys.has(line.sourceKey));
        if (stale) throw new Error(`装修资产存在陈旧或未知成本行，停止重导：${stale.sourceKey ?? "NULL"}`);
        for (const line of parsed.renovationCostEvidence) {
          if (line.treatment === "excluded_from_source_total" && !line.reason?.trim()) throw new Error(`装修排除成本行缺少原因：${line.sourceKey}`);
          await tx.financeAssetCostLine.upsert({
            where: { assetId_sourceKey: { assetId: card.id, sourceKey: line.sourceKey } },
            create: { assetId: card.id, lineType: "invoice", treatment: line.treatment, amount: line.amount, reason: line.reason ?? null, sourceFile: line.sourceFile, sourceSheet: line.sourceSheet, sourceRow: line.sourceRow, sourceKey: line.sourceKey },
            update: { lineType: "invoice", treatment: line.treatment, amount: line.amount, reason: line.reason ?? null, sourceFile: line.sourceFile, sourceSheet: line.sourceSheet, sourceRow: line.sourceRow },
          });
          costLineCount += 1;
        }
      }
      cardCount += 1;
    }
    if (costLineCount !== expectedCostLineCount) throw new Error("资产导入批次成本行计数与实际写入不一致");
    return { cardCount, costEvidenceCount: costLineCount, blockerCount: 0, warningCount: workbookWarnings.length + reconciliation.warnings.length, workbookWarnings, reconciliationWarnings: reconciliation.warnings, reconciliationStatus: reconciliation.status, controls: parsed.controls };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

function isLegacySyntheticAsset(asset: ParsedCurrentPeriodAsset) {
  return asset.legacySynthetic === true;
}

async function loadAuthoritativeCutoverContext(
  tx: Prisma.TransactionClient,
  input: {
    companyCode: string;
    companyId: number;
    period: { id: number; companyCode: string; companyId: number | null; year: number; month: number; endDate: string; isClosed: boolean };
    accountIds: number[];
  },
): Promise<FinanceAssetCutoverAuthoritativeContext> {
  if (input.period.companyId !== input.companyId || input.period.companyCode !== input.companyCode || !input.period.isClosed) {
    throw new Error("资产历史切点必须引用目标公司的已关账总账期间");
  }
  const rows = await tx.financeAccountBalance.findMany({
    where: { periodId: input.period.id, accountId: { in: input.accountIds } },
    select: {
      id: true,
      accountId: true,
      periodId: true,
      companyCode: true,
      companyId: true,
      closingDebit: true,
      closingCredit: true,
      account: { select: { code: true, balanceDirection: true, companyCode: true, companyId: true, year: true, isActive: true } },
    },
  });
  if (rows.length !== input.accountIds.length) throw new Error("资产切点缺少分类政策科目的权威总账余额 FK");
  return {
    period: {
      id: input.period.id,
      companyCode: input.period.companyCode,
      companyId: input.companyId,
      year: input.period.year,
      month: input.period.month,
      endDate: input.period.endDate,
      isClosed: input.period.isClosed,
    },
    balances: rows.map((row) => {
      if (row.companyCode !== input.companyCode || row.companyId !== input.companyId
        || row.account.companyCode !== input.companyCode || row.account.companyId !== input.companyId
        || row.account.year !== input.period.year || !row.account.isActive
        || (row.account.balanceDirection !== "debit" && row.account.balanceDirection !== "credit")) {
        throw new Error(`资产切点总账余额或科目不属于目标公司年度：${row.account.code}`);
      }
      return {
        id: row.id,
        accountId: row.accountId,
        periodId: row.periodId,
        companyCode: row.companyCode,
        companyId: input.companyId,
        accountCode: row.account.code,
        balanceDirection: row.account.balanceDirection,
        closingDebit: Number(row.closingDebit),
        closingCredit: Number(row.closingCredit),
      };
    }),
  };
}

function cardData(asset: ParsedCurrentPeriodAsset, input: { companyCode: string; companyId: number; userId?: number }, policy: Awaited<ReturnType<typeof resolveFinanceAssetCategoryPolicy>>, usefulLifeMonths: number | null, residualRate: number, method: "straight_line", allocation: FinanceAssetLedgerCutoverResult["allocations"][number], reconciliationFingerprint: string, cutoverPeriodId: number, cutoverDate: string, executionApproval?: FinanceAssetLedgerCutoverResult["executionApproval"]) {
  const note = [
    asset.note,
    `sourceAssetCode=${asset.assetCode}`,
    `sourceRange=${asset.sourceRange}`,
    asset.depreciationStartEvidence ? `depreciationStartEvidence=${asset.depreciationStartEvidence}` : undefined,
    asset.depreciationStartSourceRange ? `depreciationStartSourceRange=${asset.depreciationStartSourceRange}` : undefined,
  ].filter(Boolean).join("；");
  return { companyCode: input.companyCode, companyId: input.companyId, name: asset.name, assetKind: asset.assetKind, categoryId: policy.category.id, sourceCategory: asset.sourceCategory ?? null, assetAccountCode: policy.assetAccount.code, assetAccountId: policy.assetAccount.id, accumulatedAccountCode: policy.accumulatedAccount?.code ?? null, accumulatedAccountId: policy.accumulatedAccount?.id ?? null, acquisitionDate: asset.acquisitionDate ?? null, depreciationStartDate: firstMonthAfterFinanceAssetCutover(cutoverDate), originalCost: asset.originalCost, residualRate, usefulLifeMonths, method, initializationMode: FINANCE_ASSET_LEGACY_CUTOVER_MODE, openingAccumulatedAmount: allocation.openingAccumulatedAmount, openingImpairmentAmount: allocation.openingImpairmentAmount, openingNetBookValue: allocation.openingNetBookValue, openingAsOfDate: cutoverDate, cutoverDate, remainingUsefulLifeMonthsAtCutover: allocation.remainingUsefulLifeMonthsAtCutover, cutoverResidualValue: allocation.cutoverResidualValue, cutoverAllocationStatus: allocation.allocationStatus, cutoverReconciliationFingerprint: reconciliationFingerprint, cutoverPeriodId, cutoverAssetBalanceId: allocation.assetBalance.id, cutoverAccumulatedBalanceId: allocation.accumulatedBalance?.id ?? null, cutoverImpairmentBalanceId: allocation.impairmentBalance?.id ?? null, nonAmortizationReason: null, note: [note, allocation.roundingAdjustment ? `cutoverRoundingAdjustment=${allocation.roundingAdjustment.toFixed(2)}` : undefined, allocation.ledgerControlAllocationMode ? `cutoverLedgerControl=${allocation.ledgerControlAllocationMode}` : undefined, allocation.ledgerControlAdjustment ? `cutoverLedgerControlAdjustment=${allocation.ledgerControlAdjustment.toFixed(2)}` : undefined, allocation.ledgerControlApprovalReason ? `cutoverLedgerControlApproval=${allocation.ledgerControlApprovalReason}` : undefined, executionApproval ? `cutoverExecutionApproval=${executionApproval.approvalReference}/${executionApproval.approvedBy}/${executionApproval.executedBy}` : undefined].filter(Boolean).join("；"), sourceFile: asset.sourceFile, sourceSheet: asset.sourceSheet, sourceRow: asset.sourceRow, sourceKey: asset.sourceKey, editedBy: input.userId ?? null };
}

export function canonicalizeFinanceAssetCutoverEstimates(
  assets: Array<{ sourceKey: string; originalCost: number; fullUsefulLifeMonths: number; residualRate: number }>,
  allocations: Map<string, FinanceAssetLedgerCutoverResult["allocations"][number]>,
) {
  const canonical = new Map(allocations);
  for (const asset of assets) {
    const allocation = allocations.get(asset.sourceKey);
    if (!allocation) throw new Error(`资产切点缺少逐卡分配：${asset.sourceKey}`);
    if (!allocation.ledgerControlAllocationMode) continue;
    const openingNetBookValue = money(allocation.openingNetBookValue);
    if (asset.fullUsefulLifeMonths <= 0) {
      canonical.set(asset.sourceKey, { ...allocation, cutoverResidualValue: openingNetBookValue, remainingUsefulLifeMonthsAtCutover: 0 });
      continue;
    }
    const policyResidualValue = money(asset.originalCost * asset.residualRate);
    const cutoverResidualValue = money(Math.min(openingNetBookValue, policyResidualValue));
    const remainingDepreciable = money(openingNetBookValue - cutoverResidualValue);
    const monthlyPolicyAmount = money((asset.originalCost - policyResidualValue) / asset.fullUsefulLifeMonths);
    const remainingUsefulLifeMonthsAtCutover = remainingDepreciable <= 0 ? 0 : Math.max(1, Math.min(
      asset.fullUsefulLifeMonths,
      monthlyPolicyAmount > 0 ? Math.ceil((remainingDepreciable - 0.005) / monthlyPolicyAmount) : 0,
    ));
    canonical.set(asset.sourceKey, { ...allocation, cutoverResidualValue, remainingUsefulLifeMonthsAtCutover });
  }
  return canonical;
}

function canonicalReconciliationFingerprint(
  providerFingerprint: string,
  allocations: Map<string, FinanceAssetLedgerCutoverResult["allocations"][number]>,
) {
  return createHash("sha256").update(JSON.stringify({
    providerFingerprint,
    estimates: [...allocations.values()].sort((left, right) => left.sourceKey.localeCompare(right.sourceKey)).map((row) => ({
      sourceKey: row.sourceKey,
      openingNetBookValue: row.openingNetBookValue,
      cutoverResidualValue: row.cutoverResidualValue,
      remainingUsefulLifeMonthsAtCutover: row.remainingUsefulLifeMonthsAtCutover,
      ledgerControlAdjustment: row.ledgerControlAdjustment,
      ledgerControlAllocationMode: row.ledgerControlAllocationMode,
      ledgerControlApprovalReason: row.ledgerControlApprovalReason,
    })),
  })).digest("hex");
}

function resolveCutoverAccountingBasis(
  asset: ParsedCurrentPeriodAsset,
  policy: Awaited<ReturnType<typeof resolveFinanceAssetCategoryPolicy>>,
  cutoverDate: string,
) {
  const residualRate = asset.residualRate ?? policy.defaultResidualRate;
  if (residualRate == null || !Number.isFinite(residualRate) || residualRate < 0 || residualRate >= 1) {
    throw new Error(`资产残值率未由来源或年度分类政策有效补齐：${asset.name}`);
  }
  const configuredLife = asset.usefulLifeMonths ?? policy.defaultUsefulLifeMonths;
  if (!policy.category.depreciable) {
    return { residualRate, fullUsefulLifeMonths: configuredLife ?? 0, remainingUsefulLifeMonthsAtCutover: 0, cutoverResidualValue: money(asset.closingNetAmount) };
  }
  if (!Number.isInteger(configuredLife) || Number(configuredLife) <= 0) {
    throw new Error(`资产完整使用寿命未由来源或年度分类政策有效补齐：${asset.name}`);
  }
  const fullUsefulLifeMonths = Number(configuredLife);
  const policyResidualValue = money(asset.originalCost * residualRate);
  const cutoverResidualValue = money(Math.min(asset.closingNetAmount, policyResidualValue));
  const remainingDepreciable = money(asset.closingNetAmount - cutoverResidualValue);
  if (remainingDepreciable <= 0) return { residualRate, fullUsefulLifeMonths, remainingUsefulLifeMonthsAtCutover: 0, cutoverResidualValue };
  const sourceRemaining = asset.depreciationStartDate
    ? fullUsefulLifeMonths - monthsThroughCutover(asset.depreciationStartDate, cutoverDate)
    : null;
  const monthlyPolicyAmount = money((asset.originalCost - policyResidualValue) / fullUsefulLifeMonths);
  const valueImpliedRemaining = monthlyPolicyAmount > 0 ? Math.ceil((remainingDepreciable - 0.005) / monthlyPolicyAmount) : 0;
  const remainingUsefulLifeMonthsAtCutover = Math.max(1, Math.min(fullUsefulLifeMonths,
    sourceRemaining != null && sourceRemaining > 0 ? sourceRemaining : valueImpliedRemaining));
  return { residualRate, fullUsefulLifeMonths, remainingUsefulLifeMonthsAtCutover, cutoverResidualValue };
}

function monthsThroughCutover(startDate: string, cutoverDate: string) {
  const start = monthIndex(startDate);
  const cutover = monthIndex(cutoverDate);
  return Math.max(0, cutover - start + 1);
}

function monthIndex(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error("资产日期必须为 YYYY-MM-DD");
  return Number(match[1]) * 12 + Number(match[2]) - 1;
}

function money(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function cutoverAccumulatedAmount(asset: ParsedCurrentPeriodAsset) {
  return Math.round((asset.originalCost - asset.closingNetAmount + Number.EPSILON) * 100) / 100;
}

function importBatchNote(cutoverDate: string, overriddenBlockers: Array<{ code: string }>, executionApproval?: FinanceAssetLedgerCutoverResult["executionApproval"]) {
  const codes = [...new Set(overriddenBlockers.map((item) => item.code))];
  const overrideEvidence = codes.length > 0 ? `；GL override=${codes.join(",")}` : "";
  const approval = executionApproval ? `；approval=${executionApproval.approvalReference}/${executionApproval.approvedBy}/${executionApproval.executedBy}` : "";
  return `${cutoverDate} 历史资产切点承接；历史月度不重算${overrideEvidence}${approval}`;
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
