import { z } from "zod";
import { serviceError } from "@workspace/platform/server/api";
import { searchFkParties } from "@workspace/platform/server/fk-search";
import { prisma } from "@workspace/platform/server/prisma";
import { matchSearchFields } from "@workspace/platform/search";

export const TREASURY_LENDER_PARTY_FK_KEY = "finance.treasury.lenderParty";
export const TREASURY_BANK_ACCOUNT_FINANCE_ACCOUNT_FK_KEY = "finance.treasury.bankAccount.financeAccount";
export const TREASURY_VOUCHER_ITEM_FK_KEY = "finance.treasury.voucherItem";

const commonQuery = {
  keyword: z.string().optional().default(""),
  lifecycleScope: z.enum(["active", "all", "archived"]).optional(),
};

export const treasuryReferenceOptionsQuerySchema = z.discriminatedUnion("fkKey", [
  z.object({ fkKey: z.literal(TREASURY_LENDER_PARTY_FK_KEY), ...commonQuery }).strict(),
  z.object({
    fkKey: z.literal(TREASURY_BANK_ACCOUNT_FINANCE_ACCOUNT_FK_KEY),
    companyCode: z.string().trim().min(1),
    year: z.coerce.number().int().min(2000).max(2099),
    ...commonQuery,
  }).strict(),
  z.object({
    fkKey: z.literal(TREASURY_VOUCHER_ITEM_FK_KEY),
    companyCode: z.string().trim().min(1),
    periodId: z.coerce.number().int().positive(),
    ...commonQuery,
  }).strict(),
]);

export type TreasuryReferenceOptionsQuery = z.infer<typeof treasuryReferenceOptionsQuerySchema>;
type ReferenceItem = { id: number; name: string; subtitle?: string; lifecycleStatus?: "active" | "archived" | "inactive" };
type Dependencies = {
  searchParties: typeof searchFkParties;
  searchFinanceAccounts: (input: Extract<TreasuryReferenceOptionsQuery, { fkKey: typeof TREASURY_BANK_ACCOUNT_FINANCE_ACCOUNT_FK_KEY }>) => Promise<ReferenceItem[]>;
  searchVoucherItems: (input: Extract<TreasuryReferenceOptionsQuery, { fkKey: typeof TREASURY_VOUCHER_ITEM_FK_KEY }>) => Promise<ReferenceItem[]>;
};

const defaultDependencies: Dependencies = {
  searchParties: searchFkParties,
  searchFinanceAccounts,
  searchVoucherItems,
};

export async function executeTreasuryReferenceOptionsCommand(
  command: TreasuryReferenceOptionsQuery,
  dependencyOverrides: Partial<Dependencies> = {},
) {
  try {
    const dependencies = { ...defaultDependencies, ...dependencyOverrides };
    const matches = command.fkKey === TREASURY_LENDER_PARTY_FK_KEY
      ? await dependencies.searchParties(command.keyword)
      : command.fkKey === TREASURY_BANK_ACCOUNT_FINANCE_ACCOUNT_FK_KEY
        ? await dependencies.searchFinanceAccounts(command)
        : await dependencies.searchVoucherItems(command);
    return { items: matches.map(standardItem) };
  } catch {
    return serviceError("资金管理候选项查询失败", 500);
  }
}

function standardItem({ id, name, subtitle, lifecycleStatus }: ReferenceItem): ReferenceItem {
  return { id, name, ...(subtitle ? { subtitle } : {}), ...(lifecycleStatus ? { lifecycleStatus } : {}) };
}

async function searchFinanceAccounts(input: Extract<TreasuryReferenceOptionsQuery, { fkKey: typeof TREASURY_BANK_ACCOUNT_FINANCE_ACCOUNT_FK_KEY }>) {
  const rows = await prisma.financeAccount.findMany({
    where: { companyCode: input.companyCode, year: input.year, isActive: true },
    select: { id: true, code: true, name: true },
    orderBy: [{ code: "asc" }, { id: "asc" }],
    take: 1000,
  });
  return rows.filter((row) => matchSearchFields(row, input.keyword, ["code", "name"])).slice(0, 50).map((row) => ({
    id: row.id,
    name: row.name,
    subtitle: row.code,
    lifecycleStatus: "active" as const,
  }));
}

async function searchVoucherItems(input: Extract<TreasuryReferenceOptionsQuery, { fkKey: typeof TREASURY_VOUCHER_ITEM_FK_KEY }>) {
  const period = await prisma.financePeriod.findFirst({ where: { id: input.periodId, companyCode: input.companyCode }, select: { id: true } });
  if (!period) return [];
  const rows = await prisma.financeVoucherItem.findMany({
    where: { voucher: { companyCode: input.companyCode, periodId: input.periodId } },
    select: {
      id: true, sortOrder: true, description: true, debit: true, credit: true,
      voucher: { select: { voucherNo: true, date: true } },
      account: { select: { code: true, name: true } },
    },
    orderBy: { id: "desc" },
    take: 1000,
  });
  return rows.filter((row) => matchSearchFields({
    voucherNo: row.voucher.voucherNo,
    date: row.voucher.date,
    description: row.description,
    accountCode: row.account.code,
    accountName: row.account.name,
  }, input.keyword)).slice(0, 50).map((row) => ({
    id: row.id,
    name: `${row.voucher.voucherNo} · 分录 ${row.sortOrder + 1}`,
    subtitle: [row.voucher.date, `${row.account.code} ${row.account.name}`, row.description, voucherAmount(row)].filter(Boolean).join(" · "),
    lifecycleStatus: "active" as const,
  }));
}

function voucherAmount(row: { debit: number; credit: number }) {
  if (row.debit) return `借 ${row.debit.toLocaleString("zh-CN")}`;
  if (row.credit) return `贷 ${row.credit.toLocaleString("zh-CN")}`;
  return "零金额";
}
