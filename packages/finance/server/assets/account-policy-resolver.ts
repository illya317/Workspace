import { prisma, type Prisma } from "@workspace/platform/server/prisma";

import type { FinanceAssetKind, FinanceAssetUsefulLifeMode } from "../../types/assets";
import { resolveFinanceGroupPolicyCompany } from "../group-policy-scope";
import { resolveFinanceCompanyAccountsFromGroupPolicyWithClient } from "../ledger/group-accounts/company-account-resolver";
import { financeAssetPolicySemanticsMatch, type FinanceAssetPolicySemanticSnapshot } from "./asset-policy-inheritance";

type AssetCategoryPolicyClient = Pick<Prisma.TransactionClient,
  "financeAssetCategoryPolicy" | "company" | "ownershipInterest" | "financeAccountingPolicyVersion"
  | "financeAccount" | "financeGroupAccountMapping" | "financeGroupAccountRevision"
>;

export async function resolveFinanceAssetCategoryPolicy(
  client: AssetCategoryPolicyClient | typeof prisma,
  input: { companyCode: string; fiscalYear: number; categoryId: number },
) {
  const groupCompany = await resolveFinanceGroupPolicyCompany(client, input);
  const policies = await client.financeAssetCategoryPolicy.findMany({
    where: {
      companyCode: { in: [...new Set([input.companyCode, groupCompany.code])] },
      year: input.fiscalYear,
      categoryId: input.categoryId,
    },
    include: {
      category: { select: { id: true, code: true, name: true, assetKind: true, depreciable: true, isActive: true, reviewStatus: true } },
      assetAccount: { select: { id: true, code: true, name: true, companyCode: true, year: true, category: true, isActive: true } },
      accumulatedAccount: { select: { id: true, code: true, name: true, companyCode: true, year: true, category: true, isActive: true } },
      expenseAccount: { select: { id: true, code: true, name: true, companyCode: true, year: true, category: true, isActive: true } },
      impairmentLossAccount: { select: { id: true, code: true, name: true, companyCode: true, year: true, category: true, isActive: true } },
      impairmentAllowanceAccount: { select: { id: true, code: true, name: true, companyCode: true, year: true, category: true, isActive: true } },
      disposalGainLossAccount: { select: { id: true, code: true, name: true, companyCode: true, year: true, category: true, isActive: true } },
    },
  });
  const groupPolicy = policies.find((policy) => policy.companyCode === groupCompany.code) ?? null;
  const companyPolicy = policies.find((policy) => policy.companyCode === input.companyCode) ?? null;
  const inheritedAccounts = groupPolicy && input.companyCode !== groupCompany.code
    ? await resolveFinanceCompanyAccountsFromGroupPolicyWithClient(client, {
        sourceAccountIds: [
          groupPolicy.assetAccountId,
          groupPolicy.accumulatedAccountId,
          groupPolicy.expenseAccountId,
          groupPolicy.impairmentLossAccountId,
          groupPolicy.impairmentAllowanceAccountId,
          groupPolicy.disposalGainLossAccountId,
        ].filter((id): id is number => id !== null),
        targetCompanyCode: input.companyCode,
        fiscalYear: input.fiscalYear,
        effectiveAt: `${input.fiscalYear}-12-31`,
      })
    : null;
  const inheritedBySourceId = new Map(inheritedAccounts?.resolutions.map((resolution) => [resolution.sourceAccountId, resolution]) ?? []);
  const projectedGroupPolicy = groupPolicy ? {
    assetAccount: input.companyCode === groupCompany.code
      ? groupPolicy.assetAccount
      : inheritedBySourceId.get(groupPolicy.assetAccountId)?.targetAccount ?? null,
    accumulatedAccount: groupPolicy.accumulatedAccountId
      ? input.companyCode === groupCompany.code
        ? groupPolicy.accumulatedAccount
        : inheritedBySourceId.get(groupPolicy.accumulatedAccountId)?.targetAccount ?? null
      : null,
    expenseAccount: groupPolicy.expenseAccountId
      ? input.companyCode === groupCompany.code
        ? groupPolicy.expenseAccount
        : inheritedBySourceId.get(groupPolicy.expenseAccountId)?.targetAccount ?? null
      : null,
    impairmentLossAccount: groupPolicy.impairmentLossAccountId
      ? input.companyCode === groupCompany.code ? groupPolicy.impairmentLossAccount : inheritedBySourceId.get(groupPolicy.impairmentLossAccountId)?.targetAccount ?? null
      : null,
    impairmentAllowanceAccount: groupPolicy.impairmentAllowanceAccountId
      ? input.companyCode === groupCompany.code ? groupPolicy.impairmentAllowanceAccount : inheritedBySourceId.get(groupPolicy.impairmentAllowanceAccountId)?.targetAccount ?? null
      : null,
    disposalGainLossAccount: groupPolicy.disposalGainLossAccountId
      ? input.companyCode === groupCompany.code ? groupPolicy.disposalGainLossAccount : inheritedBySourceId.get(groupPolicy.disposalGainLossAccountId)?.targetAccount ?? null
      : null,
  } : null;
  const groupAccountsResolved = Boolean(projectedGroupPolicy?.assetAccount)
    && (!groupPolicy?.accumulatedAccountId || Boolean(projectedGroupPolicy?.accumulatedAccount))
    && (!groupPolicy?.expenseAccountId || Boolean(projectedGroupPolicy?.expenseAccount));
  const groupCloseAccountsResolved = (!groupPolicy?.impairmentLossAccountId || Boolean(projectedGroupPolicy?.impairmentLossAccount))
    && (!groupPolicy?.impairmentAllowanceAccountId || Boolean(projectedGroupPolicy?.impairmentAllowanceAccount))
    && (!groupPolicy?.disposalGainLossAccountId || Boolean(projectedGroupPolicy?.disposalGainLossAccount));
  const companyOverride = companyPolicy && input.companyCode !== groupCompany.code && (
    !groupPolicy
    || !groupAccountsResolved
    || !groupCloseAccountsResolved
    || !financeAssetPolicySemanticsMatch(
      policySemanticSnapshot(companyPolicy),
      policySemanticSnapshot({
        ...groupPolicy,
        assetAccount: projectedGroupPolicy!.assetAccount!,
        accumulatedAccount: projectedGroupPolicy!.accumulatedAccount,
        expenseAccount: projectedGroupPolicy!.expenseAccount,
        impairmentLossAccount: projectedGroupPolicy!.impairmentLossAccount,
        impairmentAllowanceAccount: projectedGroupPolicy!.impairmentAllowanceAccount,
        disposalGainLossAccount: projectedGroupPolicy!.disposalGainLossAccount,
      }),
    )
  ) ? companyPolicy : null;
  const policy = companyOverride ?? groupPolicy;
  if (!policy || !policy.category.isActive || policy.category.reviewStatus !== "confirmed") {
    throw new Error("集团及当前公司尚未保存该年度资产分类核算政策");
  }
  const inherited = policy === groupPolicy && input.companyCode !== groupCompany.code;
  const assetAccount = inherited ? projectedGroupPolicy?.assetAccount ?? null : policy.assetAccount;
  const accumulatedAccount = policy.accumulatedAccountId
    ? inherited ? projectedGroupPolicy?.accumulatedAccount ?? null : policy.accumulatedAccount
    : null;
  const expenseAccount = policy.expenseAccountId
    ? inherited ? projectedGroupPolicy?.expenseAccount ?? null : policy.expenseAccount
    : null;
  const impairmentLossAccount = policy.impairmentLossAccountId
    ? inherited ? projectedGroupPolicy?.impairmentLossAccount ?? null : policy.impairmentLossAccount
    : null;
  const impairmentAllowanceAccount = policy.impairmentAllowanceAccountId
    ? inherited ? projectedGroupPolicy?.impairmentAllowanceAccount ?? null : policy.impairmentAllowanceAccount
    : null;
  const disposalGainLossAccount = policy.disposalGainLossAccountId
    ? inherited ? projectedGroupPolicy?.disposalGainLossAccount ?? null : policy.disposalGainLossAccount
    : null;
  if (!assetAccount) throw new Error("集团资产科目无法通过现有科目映射唯一落到当前公司，请单独设置公司政策");
  if (policy.accumulatedAccountId && !accumulatedAccount) throw new Error("集团累计折旧/摊销科目无法通过现有科目映射唯一落到当前公司，请单独设置公司政策");
  if (policy.expenseAccountId && !expenseAccount) throw new Error("集团折旧/摊销费用科目无法通过现有科目映射唯一落到当前公司，请单独设置公司政策");
  if (policy.impairmentLossAccountId && !impairmentLossAccount) throw new Error("集团减值损失科目无法通过现有科目映射唯一落到当前公司，请单独设置公司政策");
  if (policy.impairmentAllowanceAccountId && !impairmentAllowanceAccount) throw new Error("集团减值准备科目无法通过现有科目映射唯一落到当前公司，请单独设置公司政策");
  if (policy.disposalGainLossAccountId && !disposalGainLossAccount) throw new Error("集团资产处置损益科目无法通过现有科目映射唯一落到当前公司，请单独设置公司政策");
  assertPolicyAccount(assetAccount, input, ["asset"], "资产科目");
  if (accumulatedAccount) assertPolicyAccount(accumulatedAccount, input, ["asset"], "累计折旧/摊销科目");
  if (expenseAccount) assertPolicyAccount(expenseAccount, input, ["cost", "expense"], "折旧/摊销费用科目");
  if (impairmentLossAccount) assertPolicyAccount(impairmentLossAccount, input, ["cost", "expense"], "减值损失科目");
  if (impairmentAllowanceAccount) assertPolicyAccount(impairmentAllowanceAccount, input, ["asset"], "减值准备科目");
  if (disposalGainLossAccount) assertPolicyAccount(disposalGainLossAccount, input, ["cost", "expense"], "资产处置损益科目");
  if ((policy.category.assetKind === "fixed_asset" || policy.category.assetKind === "intangible") && !accumulatedAccount) {
    throw new Error("当前资产分类未配置累计折旧/摊销科目");
  }
  if ((policy.category.assetKind === "prepaid" || policy.category.assetKind === "long_term_deferred") && accumulatedAccount) {
    throw new Error("预付及长期待摊分类不应配置累计折旧/摊销科目");
  }
  return {
    policyId: policy.id,
    policyVersion: policy.version,
    policySource: companyOverride ? "company_override" as const : "group" as const,
    policyCompanyCode: policy.companyCode,
    category: {
      id: policy.category.id,
      code: policy.category.code,
      name: policy.category.name,
      assetKind: policy.category.assetKind as FinanceAssetKind,
      depreciable: policy.category.depreciable,
    },
    assetAccount: accountReference(assetAccount),
    accumulatedAccount: accumulatedAccount ? accountReference(accumulatedAccount) : null,
    expenseAccount: expenseAccount ? accountReference(expenseAccount) : null,
    impairmentLossAccount: impairmentLossAccount ? accountReference(impairmentLossAccount) : null,
    impairmentAllowanceAccount: impairmentAllowanceAccount ? accountReference(impairmentAllowanceAccount) : null,
    disposalGainLossAccount: disposalGainLossAccount ? accountReference(disposalGainLossAccount) : null,
    defaultUsefulLifeMonths: policy.defaultUsefulLifeMonths,
    defaultResidualRate: policy.defaultResidualRate == null ? null : Number(policy.defaultResidualRate),
    defaultMethod: policy.defaultMethod,
    usefulLifeMode: policy.usefulLifeMode as FinanceAssetUsefulLifeMode,
    minimumUsefulLifeMonths: policy.minimumUsefulLifeMonths,
    maximumUsefulLifeMonths: policy.maximumUsefulLifeMonths,
    reviewRequired: policy.reviewRequired,
    classificationRule: policy.classificationRule,
  };
}

function policySemanticSnapshot(policy: {
  assetAccount: { code: string };
  accumulatedAccount: { code: string } | null;
  expenseAccount: { code: string } | null;
  impairmentLossAccount: { code: string } | null;
  impairmentAllowanceAccount: { code: string } | null;
  disposalGainLossAccount: { code: string } | null;
  defaultUsefulLifeMonths: number | null;
  defaultResidualRate: unknown;
  defaultMethod: string;
  usefulLifeMode: string;
  minimumUsefulLifeMonths: number | null;
  maximumUsefulLifeMonths: number | null;
  reviewRequired: boolean;
  classificationRule: string;
}): FinanceAssetPolicySemanticSnapshot {
  return {
    assetAccountCode: policy.assetAccount.code,
    accumulatedAccountCode: policy.accumulatedAccount?.code ?? null,
    expenseAccountCode: policy.expenseAccount?.code ?? null,
    impairmentLossAccountCode: policy.impairmentLossAccount?.code ?? null,
    impairmentAllowanceAccountCode: policy.impairmentAllowanceAccount?.code ?? null,
    disposalGainLossAccountCode: policy.disposalGainLossAccount?.code ?? null,
    defaultUsefulLifeMonths: policy.defaultUsefulLifeMonths,
    defaultResidualRatePercent: Math.round(Number(policy.defaultResidualRate) * 100),
    defaultMethod: policy.defaultMethod,
    usefulLifeMode: policy.usefulLifeMode,
    minimumUsefulLifeMonths: policy.minimumUsefulLifeMonths,
    maximumUsefulLifeMonths: policy.maximumUsefulLifeMonths,
    reviewRequired: policy.reviewRequired,
    classificationRule: policy.classificationRule,
  };
}

function assertPolicyAccount(
  account: { companyCode: string; year: number | null; category: string; isActive: boolean },
  input: { companyCode: string; fiscalYear: number },
  allowedCategories: string[],
  label: string,
) {
  if (
    account.companyCode !== input.companyCode
    || account.year !== input.fiscalYear
    || !account.isActive
    || !allowedCategories.includes(account.category)
  ) {
    throw new Error(`${label}不是当前公司和年度的有效科目 FK`);
  }
}

function accountReference(account: { id: number; code: string; name: string }) {
  return { id: account.id, code: account.code, name: account.name };
}
