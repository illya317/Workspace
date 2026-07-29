import type {
  FinanceAssetKind,
  FinanceAssetUsefulLifeMode,
} from "../../types/assets";

type AssetCategoryDefaultsInput = {
  code: string;
  name: string;
  assetKind: FinanceAssetKind;
  defaultUsefulLifeMonths: number | null;
  defaultResidualRate: unknown;
  defaultMethod: string;
};

export type FinanceAssetCategoryPolicyDefaults = {
  assetAccountCode: string;
  accumulatedAccountCode: string | null;
  defaultUsefulLifeMonths: number | null;
  defaultResidualRate: number;
  defaultMethod: string;
  usefulLifeMode: FinanceAssetUsefulLifeMode;
  minimumUsefulLifeMonths: number | null;
  maximumUsefulLifeMonths: number | null;
  reviewRequired: boolean;
  classificationRule: string;
};

const DEFAULT_ACCOUNT_CODES: Record<FinanceAssetKind, {
  assetAccountCode: string;
  accumulatedAccountCode: string | null;
}> = {
  fixed_asset: { assetAccountCode: "1601", accumulatedAccountCode: "1602" },
  intangible: { assetAccountCode: "1701", accumulatedAccountCode: "1702" },
  prepaid: { assetAccountCode: "1123", accumulatedAccountCode: null },
  long_term_deferred: { assetAccountCode: "1801", accumulatedAccountCode: null },
};

const CATEGORY_ACCOUNT_CODES: Partial<Record<string, { assetAccountCode: string; accumulatedAccountCode: string | null }>> = {
  "PA-RENT": { assetAccountCode: "1463", accumulatedAccountCode: null },
  "PA-PARKING": { assetAccountCode: "1123", accumulatedAccountCode: null },
  "PA-NETWORK": { assetAccountCode: "1463", accumulatedAccountCode: null },
  "PA-OTHER": { assetAccountCode: "1463", accumulatedAccountCode: null },
};

const CATEGORY_RULES: Record<string, { rule: string; reviewRequired?: boolean }> = {
  "FA-BUILDING": { rule: "用于生产经营、预计使用超过一个会计年度且成本能够可靠计量；出租或持有增值的房产需先复核投资性房地产分类。", reviewRequired: true },
  "FA-MACHINERY": { rule: "用于生产经营、预计使用超过一个会计年度且成本能够可靠计量的机器及生产设备。" },
  "FA-TRANSPORT": { rule: "企业拥有或控制、预计使用超过一个会计年度的运输工具。" },
  "FA-ELECTRONIC": { rule: "企业拥有或控制、预计使用超过一个会计年度的电子设备。" },
  "FA-OFFICE": { rule: "企业拥有或控制、预计使用超过一个会计年度的办公设备及家具。" },
  "FA-OTHER": { rule: "符合固定资产确认条件、但不属于既有专门分类的其他有形资产。", reviewRequired: true },
  "IA-SOFTWARE": { rule: "可辨认、由企业控制且预期带来经济利益的软件权利；使用寿命按合同期限和预计受益期确定。" },
  "IA-LAND-USE": { rule: "企业取得并控制的土地使用权；出租或持有增值目的需先复核投资性房地产分类。", reviewRequired: true },
  "IA-LICENSE": { rule: "可辨认并受合同或法律权利保护的牌照、许可；使用寿命按权利期限和预计受益期确定。", reviewRequired: true },
  "IA-OTHER": { rule: "符合可辨认、无实物形态、企业控制及预期经济利益条件的其他无形资产。", reviewRequired: true },
  "PA-RENT": { rule: "仅在不构成使用权资产且受益期不超过十二个月时作为预付；录入前先完成租赁识别。", reviewRequired: true },
  "PA-PARKING": { rule: "先判断取得的是产权、长期使用权、租赁权还是短期服务；只有受益期不超过十二个月的预付款进入本分类。", reviewRequired: true },
  "PA-NETWORK": { rule: "已支付、对应未来网络或服务期间且预计在十二个月内结转的款项。" },
  "PA-OTHER": { rule: "已支付、对应未来商品或服务且预计在十二个月内结转的其他预付款。", reviewRequired: true },
  "LT-RENOVATION": { rule: "已经发生、受益期超过十二个月且不应计入其他资产成本的装修改造支出。", reviewRequired: true },
  "LT-LEASEHOLD": { rule: "租入资产改良支出单独判断并按受益期与剩余租赁期口径摊销，不直接并入使用权资产成本。", reviewRequired: true },
  "LT-OTHER": { rule: "已经发生、受益期超过十二个月且不属于其他资产成本的其他长期待摊支出。", reviewRequired: true },
};

const GENERIC_RULES: Record<FinanceAssetKind, string> = {
  fixed_asset: "用于生产经营、预计使用超过一个会计年度且成本能够可靠计量的有形资产。",
  intangible: "可辨认、无实物形态、由企业控制且预期带来经济利益的资产。",
  prepaid: "已支付并对应未来商品或服务、预计在十二个月内结转的款项。",
  long_term_deferred: "已经发生、受益期超过十二个月且不应计入其他资产成本的支出。",
};

export function financeAssetCategoryPolicyDefaults(
  category: AssetCategoryDefaultsInput,
): FinanceAssetCategoryPolicyDefaults {
  const accountCodes = CATEGORY_ACCOUNT_CODES[category.code] ?? DEFAULT_ACCOUNT_CODES[category.assetKind];
  const categoryRule = CATEGORY_RULES[category.code];
  return {
    ...accountCodes,
    defaultUsefulLifeMonths: category.defaultUsefulLifeMonths,
    defaultResidualRate: category.defaultResidualRate == null ? 0 : Number(category.defaultResidualRate),
    defaultMethod: category.defaultMethod || "straight_line",
    usefulLifeMode: category.assetKind === "intangible" ? "required_or_indefinite_basis" : "required",
    minimumUsefulLifeMonths: category.assetKind === "long_term_deferred" ? 13 : 1,
    maximumUsefulLifeMonths: category.assetKind === "prepaid" ? 12 : null,
    reviewRequired: categoryRule?.reviewRequired ?? false,
    classificationRule: categoryRule?.rule ?? GENERIC_RULES[category.assetKind],
  };
}
