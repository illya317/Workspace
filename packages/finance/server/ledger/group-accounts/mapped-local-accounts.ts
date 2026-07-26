import type { FinanceGroupAccountMappedLocalAccountsResponse } from "@workspace/finance/types";
import { listCompanyDirectoryOptions } from "@workspace/platform/server/company-directory";
import { prisma } from "@workspace/platform/server/prisma";

import { compareAccountCodes } from "./mapping-policy";
import { financeAccountSourceScopeKey, financeGroupMappingKey } from "./source-accounts";

export async function listFinanceGroupAccountMappedLocalAccounts(input: {
  groupAccountId: number;
  policyVersionId: number;
}): Promise<FinanceGroupAccountMappedLocalAccountsResponse> {
  const [revision, mappings, companies] = await Promise.all([
    prisma.financeGroupAccountRevision.findUnique({
      where: { policyVersionId_groupAccountId: input },
      select: { groupAccountId: true, code: true, name: true, category: true, balanceDirection: true },
    }),
    prisma.financeGroupAccountMapping.findMany({
      where: {
        ...input,
      },
      orderBy: [{ companyCode: "asc" }, { localAccountCode: "asc" }],
    }),
    listCompanyDirectoryOptions(false),
  ]);
  if (!revision) throw new Error("集团科目在所选版本中不存在");
  const trustedMappings = mappings.filter((mapping) => mapping.mappingMethod === "manual_override"
    || mapping.mappingMethod === "hierarchy_match"
    || (mapping.localAccountCode === revision.code
      && mapping.localAccountName === revision.name
      && mapping.localCategory === revision.category
      && mapping.localBalanceDirection === revision.balanceDirection));

  const companyCodes = [...new Set(trustedMappings.map((mapping) => mapping.companyCode))];
  const localCodes = [...new Set(trustedMappings.map((mapping) => mapping.localAccountCode))];
  const accounts = companyCodes.length && localCodes.length
    ? await prisma.financeAccount.findMany({
        where: {
          companyCode: { in: companyCodes },
          code: { in: localCodes },
        },
        select: {
          id: true,
          companyCode: true,
          code: true,
          year: true,
          sourceSystem: true,
          sourceDatabase: true,
          sourceLedger: true,
        },
      })
    : [];
  const yearsByMappingKey = new Map<string, Set<number>>();
  for (const account of accounts) {
    if (account.year === null) continue;
    const key = financeGroupMappingKey(
      account.companyCode,
      financeAccountSourceScopeKey(account),
      account.code,
    );
    const years = yearsByMappingKey.get(key) ?? new Set<number>();
    years.add(account.year);
    yearsByMappingKey.set(key, years);
  }
  const companyNames = new Map(companies.map((company) => [company.code, company.name]));
  const rows = trustedMappings.map((mapping) => {
    const key = financeGroupMappingKey(mapping.companyCode, mapping.sourceScopeKey, mapping.localAccountCode);
    return {
      mappingId: mapping.id,
      companyCode: mapping.companyCode,
      companyName: companyNames.get(mapping.companyCode) ?? mapping.companyCode,
      sourceScopeKey: mapping.sourceScopeKey,
      sourceSystem: mapping.sourceSystem,
      sourceDatabase: mapping.sourceDatabase,
      sourceLedger: mapping.sourceLedger,
      localAccountCode: mapping.localAccountCode,
      localAccountName: mapping.localAccountName,
      localCategory: mapping.localCategory,
      localBalanceDirection: mapping.localBalanceDirection,
      years: [...(yearsByMappingKey.get(key) ?? [])].sort((left, right) => left - right),
      latestYear: mapping.latestYear,
      mappingMethod: mapping.mappingMethod as FinanceGroupAccountMappedLocalAccountsResponse["rows"][number]["mappingMethod"],
      reviewClass: mapping.mappingMethod === "manual_override" || mapping.mappingMethod === "hierarchy_match"
        ? "reviewed" as const
        : "confirmed" as const,
    };
  }).sort((left, right) => left.companyName.localeCompare(right.companyName, "zh-CN", { numeric: true })
    || left.sourceScopeKey.localeCompare(right.sourceScopeKey)
    || compareAccountCodes(left.localAccountCode, right.localAccountCode));

  return {
    policyVersionId: input.policyVersionId,
    groupAccountId: input.groupAccountId,
    rows,
  };
}
