import type { Prisma } from "@workspace/platform/server/prisma";

import { compareAccountCodes } from "./mapping-policy";

export interface FinanceGroupSourceAccount {
  id: number;
  code: string;
  name: string;
  category: string;
  balanceDirection: string;
  mnemonicCode: string | null;
  currency: string | null;
  subjectLevel: number | null;
  companyCode: string;
  year: number | null;
  sourceSystem: string | null;
  sourceDatabase: string | null;
  sourceLedger: string | null;
  sourceScopeKey: string;
  parentAccountCode: string | null;
}

export function financeAccountSourceScopeKey(input: {
  sourceSystem: string | null;
  sourceDatabase: string | null;
  sourceLedger: string | null;
}) {
  return [input.sourceSystem ?? "workspace", input.sourceLedger ?? input.sourceDatabase ?? "default"]
    .map((part) => encodeURIComponent(part))
    .join("::");
}

export function financeGroupMappingKey(companyCode: string, sourceScopeKey: string, localAccountCode: string) {
  return `${companyCode}\u001f${sourceScopeKey}\u001f${localAccountCode}`;
}

export function financeGroupScopedLocalKey(sourceScopeKey: string, localAccountCode: string) {
  return `${sourceScopeKey}\u001f${localAccountCode}`;
}

export async function loadLatestGroupSourceAccounts(
  tx: Prisma.TransactionClient,
  companyCodes?: readonly string[],
) {
  const accounts = await tx.financeAccount.findMany({
    where: {
      isActive: true,
      ...(companyCodes?.length ? { companyCode: { in: [...companyCodes] } } : {}),
    },
    select: {
      id: true, code: true, name: true, category: true, balanceDirection: true,
      mnemonicCode: true, currency: true, subjectLevel: true,
      companyCode: true, year: true, sourceSystem: true, sourceDatabase: true, sourceLedger: true,
      parent: { select: { code: true } },
    },
  });
  const sorted = accounts.map((account) => ({
    ...account,
    sourceScopeKey: financeAccountSourceScopeKey(account),
    parentAccountCode: account.parent?.code ?? null,
  })).sort((left, right) => {
    const company = left.companyCode.localeCompare(right.companyCode, "zh-CN", { numeric: true });
    if (company !== 0) return company;
    const scope = left.sourceScopeKey.localeCompare(right.sourceScopeKey);
    if (scope !== 0) return scope;
    const code = compareAccountCodes(left.code, right.code);
    if (code !== 0) return code;
    return (right.year ?? -1) - (left.year ?? -1) || right.id - left.id;
  });
  const latest = new Map<string, FinanceGroupSourceAccount>();
  for (const account of sorted) {
    const key = financeGroupMappingKey(account.companyCode, account.sourceScopeKey, account.code);
    const current = latest.get(key);
    if (!current || (account.year ?? -1) > (current.year ?? -1)) latest.set(key, account);
  }
  return [...latest.values()].sort((left, right) => {
    const company = left.companyCode.localeCompare(right.companyCode, "zh-CN", { numeric: true });
    if (company !== 0) return company;
    const scope = left.sourceScopeKey.localeCompare(right.sourceScopeKey);
    return scope || compareAccountCodes(left.code, right.code);
  });
}
