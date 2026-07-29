import { getRegisteredModuleDefinition } from "@workspace/platform/module-registry";
import {
  createRelationCatalogFromRegistrations,
  type RelationRegistrationAdapters,
} from "@workspace/platform/server/relation-targets";
import {
  matchesFkKeyword,
  type FkOption,
  type FkSearchInput,
  type FkTargetRecord,
  type LifecycleScope,
} from "@workspace/platform/server/relation-registry";
import { prisma } from "@workspace/platform/server/prisma";

const FINANCE_RELATION_REGISTRATIONS = getRegisteredModuleDefinition("@workspace/finance").relationRegistrations ?? [];

function financeAssetAccountSearch(categories: string[]) {
  return ({ keyword, lifecycleScope, params }: { keyword: string; lifecycleScope: LifecycleScope; params?: Record<string, string> }) =>
    searchFinanceAssetAccountOptions({
      keyword,
      lifecycleScope,
      companyCode: params?.companyCode,
      year: params?.year,
      categories,
    });
}

const FINANCE_RELATION_ADAPTERS: RelationRegistrationAdapters = {
  "finance.assets.category": { search: searchFinanceAssetCategoryOptions },
  "finance.assets.assetAccount": { search: financeAssetAccountSearch(["asset"]) },
  "finance.assets.accumulatedAccount": { search: financeAssetAccountSearch(["asset"]) },
  "finance.assets.adjustmentAccount": { search: financeAssetAccountSearch(["asset"]) },
  "finance.assets.expenseAccount": { search: financeAssetAccountSearch(["cost", "expense"]) },
  "finance.tax.accrualVoucherItem": {
    search: financeVoucherItemSearch("period"),
    resolve: resolveFinanceVoucherItem,
  },
  "finance.tax.paymentVoucherItem": {
    search: financeVoucherItemSearch("month"),
    resolve: resolveFinanceVoucherItem,
  },
  "finance.treasury.bankAccount.financeAccount": {
    search: searchFinanceScopedAccountOptions,
  },
  "finance.treasury.voucherItem": {
    search: financeVoucherItemSearch("period"),
    resolve: resolveFinanceVoucherItem,
  },
};

export async function searchFinanceAssetCategoryOptions(input: {
  keyword: string;
  lifecycleScope: LifecycleScope;
  params?: Record<string, string>;
}, client: Pick<typeof prisma, "financeAssetCategory"> = prisma): Promise<FkOption[]> {
  const assetKind = input.params?.assetKind?.trim();
  const companyCode = input.params?.companyCode?.trim();
  const year = Number(input.params?.year);
  if (!assetKind || !companyCode || !Number.isInteger(year) || year < 2000 || year > 2100) return [];
  const rows = await client.financeAssetCategory.findMany({
    where: {
      assetKind,
      reviewStatus: "confirmed",
      ...(input.lifecycleScope === "active"
        ? { isActive: true }
        : input.lifecycleScope === "archived"
          ? { isActive: false }
          : {}),
    },
    select: { id: true, code: true, name: true, isActive: true },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    take: 100,
  });
  return rows
    .map((row) => ({
      id: row.id,
      name: row.name,
      subtitle: row.code,
      lifecycleStatus: row.isActive ? "active" as const : "inactive" as const,
    }))
    .filter((row) => matchesFkKeyword([row.name, row.subtitle], input.keyword))
    .slice(0, 50);
}

async function searchFinanceAssetAccountOptions(input: {
  keyword: string;
  lifecycleScope: LifecycleScope;
  companyCode?: string;
  year?: string;
  categories: string[];
}): Promise<FkOption[]> {
  const companyCode = input.companyCode?.trim();
  const year = Number(input.year);
  if (!companyCode || !Number.isInteger(year) || year < 2000 || year > 2100) return [];
  const rows = await prisma.financeAccount.findMany({
    where: {
      companyCode,
      year,
      category: { in: input.categories },
      ...(input.lifecycleScope === "active" ? { isActive: true } : input.lifecycleScope === "archived" ? { isActive: false } : {}),
    },
    select: { id: true, code: true, name: true, isActive: true },
    orderBy: [{ code: "asc" }, { id: "asc" }],
    take: 500,
  });
  return rows
    .map((row) => ({
      id: row.id,
      name: row.name,
      subtitle: row.code,
      lifecycleStatus: row.isActive ? "active" as const : "inactive" as const,
    }))
    .filter((row) => matchesFkKeyword([row.name, row.subtitle], input.keyword))
    .slice(0, 50);
}

async function searchFinanceScopedAccountOptions(input: FkSearchInput): Promise<FkOption[]> {
  const companyCode = input.params?.companyCode?.trim();
  const year = Number(input.params?.year);
  if (!companyCode || !Number.isInteger(year) || year < 2000 || year > 2100) return [];
  const rows = await prisma.financeAccount.findMany({
    where: {
      companyCode,
      year,
      ...(input.lifecycleScope === "active"
        ? { isActive: true }
        : input.lifecycleScope === "archived"
          ? { isActive: false }
          : {}),
    },
    select: { id: true, code: true, name: true, isActive: true },
    orderBy: [{ code: "asc" }, { id: "asc" }],
    take: 1000,
  });
  return rows
    .map((row) => ({
      id: row.id,
      name: row.name,
      subtitle: row.code,
      lifecycleStatus: row.isActive ? "active" as const : "inactive" as const,
    }))
    .filter((row) => matchesFkKeyword([row.name, row.subtitle], input.keyword))
    .slice(0, 50);
}

function financeVoucherItemSearch(scope: "period" | "month") {
  return (input: FkSearchInput) => searchFinanceVoucherItemOptions(input, scope);
}

async function searchFinanceVoucherItemOptions(
  input: FkSearchInput,
  scope: "period" | "month",
): Promise<FkOption[]> {
  const companyCode = input.params?.companyCode?.trim();
  const periodId = Number(input.params?.periodId);
  const year = Number(input.params?.year);
  const month = Number(input.params?.month);
  const validPeriodScope = Number.isInteger(periodId) && periodId > 0;
  const validMonthScope = Number.isInteger(year) && year >= 2000 && year <= 2099
    && Number.isInteger(month) && month >= 1 && month <= 12;
  if (!companyCode || (scope === "period" ? !validPeriodScope : !validMonthScope)) return [];
  const rows = await prisma.financeVoucherItem.findMany({
    where: {
      voucher: {
        companyCode,
        ...(scope === "period"
          ? { periodId }
          : { period: { year, month } }),
      },
    },
    select: {
      id: true,
      sortOrder: true,
      description: true,
      debit: true,
      credit: true,
      account: { select: { code: true, name: true } },
      voucher: { select: { voucherNo: true, date: true } },
    },
    orderBy: [{ voucher: { date: "desc" } }, { voucherId: "desc" }, { sortOrder: "asc" }],
    take: 1000,
  });
  return rows
    .map((row) => ({
      id: row.id,
      name: `${row.voucher.voucherNo} · ${row.account.name}`,
      subtitle: [
        row.voucher.date,
        `${row.account.code} ${row.account.name}`,
        row.description,
        row.debit ? `借 ${row.debit.toLocaleString("zh-CN")}` : row.credit ? `贷 ${row.credit.toLocaleString("zh-CN")}` : "零金额",
      ].filter(Boolean).join(" · "),
      lifecycleStatus: "active" as const,
      searchFields: [
        row.voucher.voucherNo,
        row.voucher.date,
        row.account.code,
        row.account.name,
        row.description,
      ],
    }))
    .filter((row) => matchesFkKeyword(row.searchFields, input.keyword))
    .slice(0, 50)
    .map(({ searchFields: _searchFields, ...row }) => row);
}

async function resolveFinanceVoucherItem(id: number): Promise<FkTargetRecord | null> {
  const row = await prisma.financeVoucherItem.findUnique({
    where: { id },
    select: {
      id: true,
      sortOrder: true,
      account: { select: { name: true } },
      voucher: { select: { voucherNo: true } },
    },
  });
  return row ? {
    id: row.id,
    label: `${row.voucher.voucherNo} · 分录 ${row.sortOrder + 1} · ${row.account.name}`,
    lifecycleStatus: "active",
  } : null;
}

export const FINANCE_FK_REGISTRY = createRelationCatalogFromRegistrations(
  FINANCE_RELATION_REGISTRATIONS,
  FINANCE_RELATION_ADAPTERS,
);
