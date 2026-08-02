import { prisma } from "@workspace/platform/server/prisma";
import { guardedDelete } from "@workspace/platform/server/delete-guard";
import { resolveFinanceGroupPolicyCompany } from "../group-policy-scope";
import {
  buildDeleteFinanceAssetCategoryPolicyCommand,
  buildUpdateFinanceAssetCategoryPolicyCommand,
  residualRatePercentToDecimal,
  type FinanceAssetCategoryPolicyDeleteCommand,
  type FinanceAssetCategoryPolicyUpdateCommand,
} from "./validation";

export async function updateFinanceAssetCategoryPolicy(command: FinanceAssetCategoryPolicyUpdateCommand) {
  const validated = await buildUpdateFinanceAssetCategoryPolicyCommand(command.input, command.userId);
  if (!validated.ok) throw new Error(validated.issue.message);
  command = validated.data;
  const input = command.input;
  const company = await prisma.company.findUnique({ where: { code: input.companyCode }, select: { id: true } });
  if (!company) throw new Error("公司不存在");
  const data = {
    companyCode: input.companyCode,
    companyId: company.id,
    year: input.year,
    categoryId: input.categoryId,
    assetAccountId: command.accounts.asset.id,
    accumulatedAccountId: command.accounts.accumulated?.id ?? null,
    expenseAccountId: command.accounts.expense?.id ?? null,
    impairmentLossAccountId: command.accounts.impairmentLoss?.id ?? null,
    impairmentAllowanceAccountId: command.accounts.impairmentAllowance?.id ?? null,
    disposalGainLossAccountId: command.accounts.disposalGainLoss?.id ?? null,
    defaultUsefulLifeMonths: input.defaultUsefulLifeMonths ?? null,
    defaultResidualRate: residualRatePercentToDecimal(input.defaultResidualRatePercent),
    defaultMethod: input.defaultMethod,
    usefulLifeMode: input.usefulLifeMode,
    minimumUsefulLifeMonths: input.minimumUsefulLifeMonths ?? null,
    maximumUsefulLifeMonths: input.maximumUsefulLifeMonths ?? null,
    reviewRequired: input.reviewRequired,
    classificationRule: input.classificationRule,
  };
  if (input.version === 0) {
    const existing = await prisma.financeAssetCategoryPolicy.findUnique({
      where: { companyCode_year_categoryId: { companyCode: input.companyCode, year: input.year, categoryId: input.categoryId } },
      select: { id: true },
    });
    if (existing) throw new Error("核算政策已被其他人保存，请刷新后重试");
    return prisma.financeAssetCategoryPolicy.create({ data });
  }
  const updated = await prisma.financeAssetCategoryPolicy.updateMany({
    where: { companyCode: input.companyCode, year: input.year, categoryId: input.categoryId, version: input.version },
    data: { ...data, version: { increment: 1 } },
  });
  if (updated.count !== 1) throw new Error("核算政策已被其他人修改，请刷新后重试");
  return prisma.financeAssetCategoryPolicy.findUniqueOrThrow({
    where: { companyCode_year_categoryId: { companyCode: input.companyCode, year: input.year, categoryId: input.categoryId } },
  });
}

export async function deleteFinanceAssetCategoryPolicy(command: FinanceAssetCategoryPolicyDeleteCommand) {
  const validated = buildDeleteFinanceAssetCategoryPolicyCommand(command.input, command.userId);
  if (!validated.ok) throw new Error(validated.issue.message);
  command = validated.data;
  const input = command.input;
  const policy = await prisma.financeAssetCategoryPolicy.findUnique({
    where: { companyCode_year_categoryId: {
      companyCode: input.companyCode,
      year: input.year,
      categoryId: input.categoryId,
    } },
    select: { id: true },
  });
  if (!policy) throw new Error("公司政策已被其他人修改，请刷新后重试");
  const deleted = await guardedDelete({
    entityType: "FinanceAssetCategoryPolicy",
    modelKey: "financeAssetCategoryPolicy",
    id: policy.id,
    userId: command.userId,
    actionLabel: "恢复集团默认资产政策",
    deleteMode: "hard",
    expectedVersion: input.version,
    auditPolicy: "none",
    referencePolicy: "none",
    transactionIsolation: "serializable",
    scopeGuard: async ({ record, tx }) => {
      if (record.companyCode !== input.companyCode
        || record.year !== input.year
        || record.categoryId !== input.categoryId) {
        return { error: "资产政策已不属于当前公司、年度或分类", status: 409 };
      }
      const groupCompany = await resolveFinanceGroupPolicyCompany(tx, {
        companyCode: input.companyCode,
        fiscalYear: input.year,
      });
      return groupCompany.code === input.companyCode
        ? { error: "集团政策不能恢复为集团默认", status: 409 }
        : { ok: true };
    },
  });
  if (!deleted.ok) throw new Error(deleted.error);
  return { deleted: true };
}
