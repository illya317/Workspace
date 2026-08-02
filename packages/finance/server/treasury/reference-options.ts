import { z } from "zod";
import { serviceError } from "@workspace/platform/service-result";
import {
  normalizeLifecycleScope,
  searchFkOptions,
  type FkOption,
  type FkSearchParams,
} from "@workspace/platform/server/relation-registry";
import { FINANCE_FK_REGISTRY } from "../assets/fk-registry";

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
  searchOptions(input: {
    fkKey: string;
    keyword: string;
    lifecycleScope?: "active" | "all" | "archived";
    params: FkSearchParams;
  }): Promise<FkOption[]>;
};

const defaultDependencies: Dependencies = {
  searchOptions: (input) => searchFkOptions(FINANCE_FK_REGISTRY, input),
};

export async function executeTreasuryReferenceOptionsCommand(
  command: TreasuryReferenceOptionsQuery,
  dependencyOverrides: Partial<Dependencies> = {},
) {
  try {
    const dependencies = { ...defaultDependencies, ...dependencyOverrides };
    const definition = FINANCE_FK_REGISTRY.require(command.fkKey);
    if (definition.scope !== "finance" || !definition.key.startsWith("finance.treasury.")) {
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
    return { items: matches.map(standardItem) };
  } catch {
    return serviceError("资金管理候选项查询失败", 500);
  }
}

function standardItem({ id, name, subtitle, lifecycleStatus }: ReferenceItem): ReferenceItem {
  return { id, name, ...(subtitle ? { subtitle } : {}), ...(lifecycleStatus ? { lifecycleStatus } : {}) };
}

function referenceSearchParams(command: TreasuryReferenceOptionsQuery): FkSearchParams {
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
