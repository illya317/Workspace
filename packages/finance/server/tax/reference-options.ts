import { z } from "zod";
import { serviceError } from "@workspace/platform/server/api";
import {
  normalizeLifecycleScope,
  searchFkOptions,
  type FkOption,
  type FkSearchParams,
} from "@workspace/platform/server/relation-registry";
import { FINANCE_FK_REGISTRY } from "../assets/fk-registry";

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
  const scopeRequirement = {
    [TAX_AUTHORITY_PARTY_FK_KEY]: { fields: [] as const, message: "" },
    [TAX_ACCRUAL_VOUCHER_FK_KEY]: {
      fields: ["companyCode", "periodId"] as const,
      message: "计税凭证候选缺少公司或会计期间",
    },
    [TAX_PAYMENT_VOUCHER_FK_KEY]: {
      fields: ["companyCode", "year", "month"] as const,
      message: "缴款凭证候选缺少公司或支付期间",
    },
  }[value.fkKey];
  if (scopeRequirement.fields.some((field) => !value[field])) {
    context.addIssue({ code: "custom", message: scopeRequirement.message });
  }
});

export type TaxReferenceOptionsQuery = z.infer<typeof taxReferenceOptionsQuerySchema>;

type ReferenceDependencies = {
  searchOptions(input: {
    fkKey: string;
    keyword: string;
    lifecycleScope?: "active" | "all" | "archived";
    params: FkSearchParams;
  }): Promise<FkOption[]>;
};

export async function executeTaxReferenceOptionsCommand(
  command: TaxReferenceOptionsQuery,
  dependencies: ReferenceDependencies = {
    searchOptions: (input) => searchFkOptions(FINANCE_FK_REGISTRY, input),
  },
) {
  try {
    const definition = FINANCE_FK_REGISTRY.require(command.fkKey);
    if (definition.scope !== "finance" || !definition.key.startsWith("finance.tax.")) {
      return serviceError("无权限", 403);
    }
    const matches = await dependencies.searchOptions({
      fkKey: command.fkKey,
      keyword: command.keyword,
      lifecycleScope: command.lifecycleScope
        ? normalizeLifecycleScope(command.lifecycleScope)
        : undefined,
      params: referenceSearchParams(command),
    });
    return {
      items: matches.map(({ id, name, subtitle }) => ({ id, name, ...(subtitle ? { subtitle } : {}) })),
    };
  } catch {
    return serviceError("税务引用候选查询失败", 500);
  }
}

function referenceSearchParams(command: TaxReferenceOptionsQuery): FkSearchParams {
  const {
    fkKey: _fkKey,
    keyword: _keyword,
    lifecycleScope: _lifecycleScope,
    ...rawParams
  } = command;
  return Object.fromEntries(
    Object.entries(rawParams)
      .filter(([, value]) => value != null)
      .map(([key, value]) => [key, String(value)]),
  );
}
