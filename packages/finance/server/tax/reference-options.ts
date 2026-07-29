import { z } from "zod";
import { serviceError } from "@workspace/platform/server/api";
import { searchFkParties } from "@workspace/platform/server/fk-search";
import { prisma } from "@workspace/platform/server/prisma";
import { matchSearchFields } from "@workspace/platform/search";

export const TAX_AUTHORITY_PARTY_FK_KEY = "finance.tax.authorityParty";
export const TAX_ACCRUAL_VOUCHER_FK_KEY = "finance.tax.accrualVoucherItem";
export const TAX_PAYMENT_VOUCHER_FK_KEY = "finance.tax.paymentVoucherItem";

export const taxReferenceOptionsQuerySchema = z.object({
  fkKey: z.enum([TAX_AUTHORITY_PARTY_FK_KEY, TAX_ACCRUAL_VOUCHER_FK_KEY, TAX_PAYMENT_VOUCHER_FK_KEY]),
  keyword: z.string().optional().default(""),
  lifecycleScope: z.enum(["active", "all", "archived"]).optional(),
  companyCode: z.string().trim().min(1).optional(),
  periodId: z.coerce.number().int().positive().optional(),
  year: z.coerce.number().int().min(2000).max(2099).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
}).strict().superRefine((value, context) => {
  if (value.fkKey === TAX_ACCRUAL_VOUCHER_FK_KEY && (!value.companyCode || !value.periodId)) {
    context.addIssue({ code: "custom", message: "计税凭证候选缺少公司或会计期间" });
  }
  if (value.fkKey === TAX_PAYMENT_VOUCHER_FK_KEY && (!value.companyCode || !value.year || !value.month)) {
    context.addIssue({ code: "custom", message: "缴款凭证候选缺少公司或支付期间" });
  }
});

export type TaxReferenceOptionsQuery = z.infer<typeof taxReferenceOptionsQuerySchema>;

type ReferenceDependencies = {
  searchParties(keyword: string): ReturnType<typeof searchFkParties>;
  searchVoucherItems(input: {
    keyword: string;
    companyCode: string;
    periodId?: number;
    year?: number;
    month?: number;
  }): Promise<Array<{ id: number; name: string; subtitle?: string }>>;
};

export async function executeTaxReferenceOptionsCommand(
  command: TaxReferenceOptionsQuery,
  dependencies: ReferenceDependencies = {
    searchParties: searchFkParties,
    searchVoucherItems: searchTaxVoucherItemOptions,
  },
) {
  try {
    const matches = command.fkKey === TAX_AUTHORITY_PARTY_FK_KEY
      ? await dependencies.searchParties(command.keyword)
      : await dependencies.searchVoucherItems({
        keyword: command.keyword,
        companyCode: command.companyCode!,
        ...(command.fkKey === TAX_ACCRUAL_VOUCHER_FK_KEY
          ? { periodId: command.periodId! }
          : { year: command.year!, month: command.month! }),
      });
    return {
      items: matches.map(({ id, name, subtitle }) => ({ id, name, ...(subtitle ? { subtitle } : {}) })),
    };
  } catch {
    return serviceError("税务引用候选查询失败", 500);
  }
}

async function searchTaxVoucherItemOptions(input: {
  keyword: string;
  companyCode: string;
  periodId?: number;
  year?: number;
  month?: number;
}) {
  const rows = await prisma.financeVoucherItem.findMany({
    where: {
      voucher: {
        companyCode: input.companyCode,
        ...(input.periodId
          ? { periodId: input.periodId }
          : { period: { year: input.year!, month: input.month! } }),
      },
    },
    select: {
      id: true,
      debit: true,
      credit: true,
      description: true,
      account: { select: { code: true, name: true } },
      voucher: { select: { voucherNo: true, date: true } },
    },
    orderBy: [{ voucher: { date: "desc" } }, { voucherId: "desc" }, { sortOrder: "asc" }],
    take: 200,
  });
  return rows.filter((row) => matchSearchFields({
    voucherNo: row.voucher.voucherNo,
    date: row.voucher.date,
    accountCode: row.account.code,
    accountName: row.account.name,
    description: row.description,
  }, input.keyword)).slice(0, 50).map((row) => ({
    id: row.id,
    name: `${row.voucher.voucherNo} · ${row.account.name}`,
    subtitle: `${row.voucher.date} · ${row.account.code} · 借 ${row.debit.toLocaleString("zh-CN")} / 贷 ${row.credit.toLocaleString("zh-CN")}`,
  }));
}
