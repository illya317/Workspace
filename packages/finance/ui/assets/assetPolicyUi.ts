import type { CreateSurfaceSectionSpec, FormSurfaceFieldSpec } from "@workspace/core/ui";
import type {
  FinanceAssetCategoryDto,
  UpdateFinanceAssetCategoryPolicyInput,
} from "../../types/assets";
import { KIND_LABELS } from "./assetScheduleUi";

const ASSET_REFERENCE_OPTIONS_ENDPOINT = "/api/modules/finance/assets/reference-options";

export function editAssetPolicyDraft(
  category: FinanceAssetCategoryDto,
  companyCode: string,
  year: number,
  scope: "group" | "company" = "company",
): UpdateFinanceAssetCategoryPolicyInput {
  return {
    companyCode,
    year,
    categoryId: category.id,
    version: scope === "group"
      ? category.policySource === "group" ? category.policyVersion : 0
      : category.companyPolicyVersion,
    assetAccountId: category.assetAccountId ?? 0,
    accumulatedAccountId: category.accumulatedAccountId,
    expenseAccountId: category.expenseAccountId,
    impairmentLossAccountId: category.impairmentLossAccountId,
    impairmentAllowanceAccountId: category.impairmentAllowanceAccountId,
    disposalGainLossAccountId: category.disposalGainLossAccountId,
    defaultUsefulLifeMonths: category.defaultUsefulLifeMonths,
    defaultResidualRatePercent: category.defaultResidualRatePercent ?? 0,
    defaultMethod: "straight_line",
    usefulLifeMode: category.usefulLifeMode,
    minimumUsefulLifeMonths: category.minimumUsefulLifeMonths,
    maximumUsefulLifeMonths: category.maximumUsefulLifeMonths,
    reviewRequired: category.reviewRequired,
    classificationRule: category.classificationRule,
  };
}

export function assetPolicyFormSections(input: {
  category: FinanceAssetCategoryDto;
  draft: UpdateFinanceAssetCategoryPolicyInput;
  readOnly: boolean;
  onChange: (key: keyof UpdateFinanceAssetCategoryPolicyInput, value: unknown) => void;
}): CreateSurfaceSectionSpec<FormSurfaceFieldSpec>[] {
  const { category, draft, readOnly, onChange } = input;
  return [
    {
      key: "classification",
      title: "分类口径",
      layout: { columns: 2, density: "compact" },
      items: [
        readOnlyText("category", "资产分类", `${category.code} · ${category.name}`),
        readOnlyText("assetKind", "资产类型", KIND_LABELS[category.assetKind]),
        {
          key: "classificationRule",
          label: "分类判断",
          required: true,
          spec: { valueType: "string", control: "text", multiline: true, validation: { required: true } },
          value: draft.classificationRule,
          readOnly,
          onChange: (value) => onChange("classificationRule", String(value ?? "")),
        },
        {
          key: "reviewRequired",
          label: "录入前复核",
          spec: { valueType: "string", control: "choice", options: { source: "static", items: [
            { value: "false", label: "不要求（直接录入）" },
            { value: "true", label: "要求（独立审批）" },
          ] } },
          value: String(draft.reviewRequired),
          disabled: readOnly,
          onChange: (value) => onChange("reviewRequired", value === "true"),
        },
      ],
    },
    {
      key: "accounts",
      title: "科目映射",
      layout: { columns: 2, density: "compact" },
      items: [
        accountReferenceField({
          key: "assetAccountId",
          label: "资产科目",
          fkKey: "finance.assets.assetAccount",
          value: draft.assetAccountId,
          displayValue: draft.assetAccountId === category.assetAccountId ? accountDisplay(category.assetAccountCode, category.assetAccountName) : undefined,
          companyCode: draft.companyCode,
          year: draft.year,
          required: true,
          readOnly,
          onChange,
        }),
        accountReferenceField({
          key: "accumulatedAccountId",
          label: "累计折旧/摊销科目",
          fkKey: "finance.assets.accumulatedAccount",
          value: draft.accumulatedAccountId,
          displayValue: draft.accumulatedAccountId === category.accumulatedAccountId ? accountDisplay(category.accumulatedAccountCode, category.accumulatedAccountName) : undefined,
          companyCode: draft.companyCode,
          year: draft.year,
          required: category.assetKind === "fixed_asset" || category.assetKind === "intangible",
          readOnly: readOnly || category.assetKind === "prepaid" || category.assetKind === "long_term_deferred",
          onChange,
        }),
        accountReferenceField({
          key: "expenseAccountId",
          label: "折旧/摊销费用科目",
          fkKey: "finance.assets.expenseAccount",
          value: draft.expenseAccountId,
          displayValue: draft.expenseAccountId === category.expenseAccountId ? accountDisplay(category.expenseAccountCode, category.expenseAccountName) : undefined,
          companyCode: draft.companyCode,
          year: draft.year,
          readOnly,
          onChange,
        }),
        accountReferenceField({
          key: "impairmentLossAccountId",
          label: "资产减值损失科目",
          fkKey: "finance.assets.expenseAccount",
          value: draft.impairmentLossAccountId,
          displayValue: draft.impairmentLossAccountId === category.impairmentLossAccountId ? accountDisplay(category.impairmentLossAccountCode, category.impairmentLossAccountName) : undefined,
          companyCode: draft.companyCode,
          year: draft.year,
          readOnly,
          onChange,
        }),
        accountReferenceField({
          key: "impairmentAllowanceAccountId",
          label: "资产减值准备科目",
          fkKey: "finance.assets.accumulatedAccount",
          value: draft.impairmentAllowanceAccountId,
          displayValue: draft.impairmentAllowanceAccountId === category.impairmentAllowanceAccountId ? accountDisplay(category.impairmentAllowanceAccountCode, category.impairmentAllowanceAccountName) : undefined,
          companyCode: draft.companyCode,
          year: draft.year,
          readOnly,
          onChange,
        }),
        accountReferenceField({
          key: "disposalGainLossAccountId",
          label: "资产处置损益科目",
          fkKey: "finance.assets.expenseAccount",
          value: draft.disposalGainLossAccountId,
          displayValue: draft.disposalGainLossAccountId === category.disposalGainLossAccountId ? accountDisplay(category.disposalGainLossAccountCode, category.disposalGainLossAccountName) : undefined,
          companyCode: draft.companyCode,
          year: draft.year,
          readOnly,
          onChange,
        }),
      ],
    },
    {
      key: "calculation",
      title: "默认计算",
      layout: { columns: 3, density: "compact" },
      items: [
        {
          key: "usefulLifeMode",
          label: "期限口径",
          required: true,
          spec: { valueType: "string", control: "choice", options: { source: "static", items: [
            { value: "required", label: "必须填写期限" },
            { value: "required_or_indefinite_basis", label: "无期限需留依据" },
          ] } },
          value: draft.usefulLifeMode,
          disabled: readOnly || category.assetKind !== "intangible",
          onChange: (value) => onChange("usefulLifeMode", String(value)),
        },
        numberField("defaultUsefulLifeMonths", "默认期限（月）", draft.defaultUsefulLifeMonths, onChange, readOnly),
        numberField("defaultResidualRatePercent", "默认残值率（%）", draft.defaultResidualRatePercent, onChange, readOnly, { min: 0, max: 99 }),
        numberField("minimumUsefulLifeMonths", "最短期限（月）", draft.minimumUsefulLifeMonths, onChange, readOnly),
        numberField("maximumUsefulLifeMonths", "最长期限（月）", draft.maximumUsefulLifeMonths, onChange, readOnly),
        readOnlyText("defaultMethod", "计算方法", "直线法"),
      ],
    },
  ];
}

function readOnlyText(key: string, label: string, value: string): FormSurfaceFieldSpec {
  return {
    key,
    label,
    spec: { valueType: "string", control: "text" },
    value,
    readOnly: true,
    onChange: () => undefined,
  };
}

function numberField(
  key: "defaultUsefulLifeMonths" | "defaultResidualRatePercent" | "minimumUsefulLifeMonths" | "maximumUsefulLifeMonths",
  label: string,
  value: number | null | undefined,
  onChange: (key: keyof UpdateFinanceAssetCategoryPolicyInput, value: unknown) => void,
  readOnly: boolean,
  limits: { min?: number; max?: number } = { min: 1 },
): FormSurfaceFieldSpec {
  return {
    key,
    label,
    spec: { valueType: "number", control: "number", validation: limits },
    value: value ?? "",
    step: 1,
    readOnly,
    onChange: (next) => onChange(key, String(next ?? "").trim() ? Number(next) : null),
  };
}

function accountReferenceField(input: {
  key: "assetAccountId" | "accumulatedAccountId" | "expenseAccountId" | "impairmentLossAccountId" | "impairmentAllowanceAccountId" | "disposalGainLossAccountId";
  label: string;
  fkKey: string;
  value: number | null | undefined;
  displayValue?: string;
  companyCode: string;
  year: number;
  required?: boolean;
  readOnly: boolean;
  onChange: (key: keyof UpdateFinanceAssetCategoryPolicyInput, value: unknown) => void;
}): FormSurfaceFieldSpec {
  return {
    key: input.key,
    label: input.label,
    required: input.required,
    spec: {
      valueType: "reference",
      control: "reference",
      options: {
        source: "remote",
        fkKey: input.fkKey,
        endpoint: ASSET_REFERENCE_OPTIONS_ENDPOINT,
        returnField: "id",
        queryParams: { companyCode: input.companyCode, year: input.year },
      },
      validation: input.required ? { required: true } : undefined,
    },
    value: input.value ? String(input.value) : "",
    displayValue: input.displayValue,
    placeholder: "搜索科目名称或编码",
    readOnly: input.readOnly,
    onChange: (value) => input.onChange(input.key, String(value ?? "").trim() ? Number(value) : null),
  };
}

function accountDisplay(code: string | null, name: string | null) {
  if (!code) return undefined;
  return name ? `${code} · ${name}` : code;
}
