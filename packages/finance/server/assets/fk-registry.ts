import { getRegisteredModuleDefinition } from "@workspace/platform/module-registry";
import {
  createRelationCatalogFromRegistrations,
  type RelationRegistrationAdapters,
} from "@workspace/platform/server/relation-targets";
import {
  matchesFkKeyword,
  type FkOption,
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

export const FINANCE_FK_REGISTRY = createRelationCatalogFromRegistrations(
  FINANCE_RELATION_REGISTRATIONS,
  FINANCE_RELATION_ADAPTERS,
);
