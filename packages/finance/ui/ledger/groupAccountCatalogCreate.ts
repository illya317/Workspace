import type { CreateSurfaceSectionSpec, FormSurfaceFieldSpec } from "@workspace/core/ui";
import type {
  CreateFinanceGroupAccountInput,
  FinanceGroupAccountCatalogRow,
  UpdateFinanceGroupAccountInput,
} from "@workspace/finance/types";
import { deriveFinanceGroupAccountTranslationRateType } from "@workspace/finance/types/group-account";

import { balanceDirectionLabel } from "./groupAccountMappingPresentation";

const CURRENCY_OPTIONS = [
  { value: "人民币", label: "人民币（CNY）" },
  { value: "美元", label: "美元（USD）" },
  { value: "加元", label: "加元（CAD）" },
  { value: "港币", label: "港币（HKD）" },
  { value: "欧元", label: "欧元（EUR）" },
  { value: "日元", label: "日元（JPY）" },
  { value: "澳元", label: "澳元（AUD）" },
  { value: "瑞士法郎", label: "瑞士法郎（CHF）" },
] as const;

export type GroupAccountCatalogCreateDraft = CreateFinanceGroupAccountInput;
export type GroupAccountCatalogEditDraft = UpdateFinanceGroupAccountInput & { id: number };

export function emptyGroupAccountCatalogCreateDraft(): GroupAccountCatalogCreateDraft {
  return {
    code: "",
    name: "",
    category: "asset",
    balanceDirection: "debit",
    mnemonicCode: null,
    currency: "人民币",
    parentGroupAccountId: null,
    consolidationRole: "none",
    counterpartyRequirement: "none",
    movementType: "closingBalance",
  };
}

export function groupAccountCatalogEditDraft(row: FinanceGroupAccountCatalogRow): GroupAccountCatalogEditDraft {
  const recommendedParent = row.parentRecommendation?.kind === "mapped"
    ? row.parentRecommendation.groupAccount
    : null;
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    category: row.category as GroupAccountCatalogEditDraft["category"],
    balanceDirection: row.balanceDirection as GroupAccountCatalogEditDraft["balanceDirection"],
    mnemonicCode: row.mnemonicCode,
    currency: row.currency ?? "人民币",
    parentGroupAccountId: row.parent?.id ?? recommendedParent?.id ?? null,
    consolidationRole: row.consolidationRole,
    counterpartyRequirement: row.counterpartyRequirement,
    movementType: row.movementType,
    expectedUpdatedAt: row.updatedAt,
  };
}

export function groupAccountCatalogCreateSections(
  draft: GroupAccountCatalogCreateDraft,
  onChange: (change: Partial<GroupAccountCatalogCreateDraft>) => void,
  options: { lockAttributes?: boolean } = {},
): CreateSurfaceSectionSpec<FormSurfaceFieldSpec>[] {
  return [{
    key: "group-account",
    title: "集团科目资料",
    layout: { columns: 2, density: "compact" },
    items: [
      {
        key: "code",
        label: "科目编码",
        required: true,
        spec: { valueType: "string", control: "text", validation: { required: true } },
        value: draft.code,
        maxLength: 32,
        onChange: (value) => onChange({ code: String(value ?? "") }),
      },
      {
        key: "name",
        label: "科目名称",
        required: true,
        spec: { valueType: "string", control: "text", validation: { required: true } },
        value: draft.name,
        maxLength: 100,
        onChange: (value) => onChange({ name: String(value ?? "") }),
      },
      {
        key: "category",
        label: "科目类别",
        required: true,
        spec: {
          valueType: "string",
          control: "choice",
          options: { source: "static", items: [
            { value: "asset", label: "资产" },
            { value: "liability", label: "负债" },
            { value: "common", label: "共同" },
            { value: "equity", label: "权益" },
            { value: "cost", label: "成本" },
            { value: "revenue", label: "收入" },
            { value: "expense", label: "费用" },
          ] },
        },
        value: draft.category,
        readOnly: options.lockAttributes,
        onChange: (value) => {
          const category = value as GroupAccountCatalogCreateDraft["category"];
          onChange({ category, balanceDirection: defaultDirection(category), parentGroupAccountId: null });
        },
      },
      {
        key: "balanceDirection",
        label: "余额方向",
        required: true,
        spec: {
          valueType: "string",
          control: "choice",
          options: { source: "static", items: [
            { value: "debit", label: balanceDirectionLabel("debit") },
            { value: "credit", label: balanceDirectionLabel("credit") },
          ] },
        },
        value: draft.balanceDirection,
        readOnly: options.lockAttributes,
        onChange: (value) => onChange({ balanceDirection: value as "debit" | "credit" }),
      },
      {
        key: "currency",
        label: "币种",
        required: true,
        spec: {
          valueType: "string",
          control: "choice",
          validation: { required: true },
          options: { source: "static", items: [...CURRENCY_OPTIONS] },
        },
        value: draft.currency ?? "人民币",
        onChange: (value) => onChange({ currency: String(value ?? "人民币") }),
      },
      {
        key: "parentGroupAccountId",
        label: "上级集团科目",
        spec: {
          valueType: "string",
          control: "reference",
          options: {
            source: "remote",
            fkKey: "finance.groupAccount.parent",
            endpoint: "/api/modules/finance/ledger/group-account-options",
            returnField: "id",
            queryParams: { category: draft.category },
          },
        },
        value: draft.parentGroupAccountId === null ? "" : String(draft.parentGroupAccountId),
        onChange: (value) => onChange({ parentGroupAccountId: value ? Number(value) : null }),
      },
      {
        key: "consolidationRole",
        label: "自动合并候选",
        spec: {
          valueType: "string",
          control: "choice",
          options: { source: "static", items: [
            { value: "none", label: "不参与" },
            ...(canInferConsolidationRole(draft)
              ? [{ value: "automatic", label: "参与" }]
              : []),
          ] },
        },
        value: draft.consolidationRole === "none" ? "none" : "automatic",
        onChange: (value) => {
          const consolidationRole = value === "automatic" ? inferredConsolidationRole(draft) : "none";
          onChange({
            consolidationRole,
            counterpartyRequirement: consolidationRole === "none"
              ? "none"
              : roleRequiresCounterparty(consolidationRole) ? "required" : draft.counterpartyRequirement,
          });
        },
      },
      ...(draft.consolidationRole !== "none" ? [
        {
          key: "counterpartyRequirement",
          label: "对方公司辅助",
          spec: { valueType: "string" as const, control: "choice" as const, options: { source: "static" as const, items: [
            { value: "none", label: "不使用" },
            { value: "optional", label: "可选" },
            { value: "required", label: "必填" },
          ] } },
          value: draft.counterpartyRequirement,
          readOnly: roleRequiresCounterparty(draft.consolidationRole),
          onChange: (value: unknown) => onChange({ counterpartyRequirement: value as GroupAccountCatalogCreateDraft["counterpartyRequirement"] }),
        },
        {
          key: "movementType",
          label: "默认取数口径",
          spec: { valueType: "string" as const, control: "choice" as const, options: { source: "static" as const, items: [
            { value: "closingBalance", label: "期末余额" },
            { value: "periodMovement", label: "期间发生额" },
            { value: "transaction", label: "逐笔交易" },
          ] } },
          value: draft.movementType,
          onChange: (value: unknown) => onChange({ movementType: value as GroupAccountCatalogCreateDraft["movementType"] }),
        },
        {
          key: "statutoryTranslationPolicy",
          label: "法定折算口径",
          spec: { valueType: "string" as const, control: "text" as const },
          value: statutoryTranslationPolicyLabel(deriveFinanceGroupAccountTranslationRateType(draft)),
          readOnly: true,
        },
      ] : []),
    ],
  }];
}

function roleRequiresCounterparty(role: GroupAccountCatalogCreateDraft["consolidationRole"]) {
  return role.startsWith("intercompany")
    || role === "investmentInSubsidiary"
    || role === "dividendReceivable"
    || role === "dividendPayable";
}

function inferredConsolidationRole(
  draft: Pick<GroupAccountCatalogCreateDraft, "code" | "category" | "consolidationRole">,
): GroupAccountCatalogCreateDraft["consolidationRole"] {
  if (draft.consolidationRole !== "none") return draft.consolidationRole;
  const code = draft.code.trim();
  if (/^(1511|1512)/.test(code)) return "investmentInSubsidiary";
  if (/^(4001|3001)/.test(code)) return "shareCapital";
  if (/^(4002|3002)/.test(code)) return "capitalReserve";
  if (draft.category === "asset") return "intercompanyReceivable";
  if (draft.category === "liability") return "intercompanyPayable";
  if (draft.category === "revenue") return "intercompanyRevenue";
  if (draft.category === "cost" || draft.category === "expense") return "intercompanyExpense";
  return "none";
}

function canInferConsolidationRole(
  draft: Pick<GroupAccountCatalogCreateDraft, "code" | "category" | "consolidationRole">,
) {
  return draft.consolidationRole !== "none" || inferredConsolidationRole(draft) !== "none";
}

export function groupAccountCatalogEditSections(
  draft: GroupAccountCatalogEditDraft,
  onChange: (change: Partial<GroupAccountCatalogEditDraft>) => void,
) {
  return groupAccountCatalogCreateSections(draft, onChange);
}

function defaultDirection(category: GroupAccountCatalogCreateDraft["category"]) {
  return category === "liability" || category === "equity" || category === "revenue" ? "credit" : "debit";
}

function statutoryTranslationPolicyLabel(
  value: ReturnType<typeof deriveFinanceGroupAccountTranslationRateType>,
) {
  return ({
    closing: "期末汇率",
    average: "逐月月平均汇率",
    historical: "发生日历史汇率",
    retainedEarningsRollforward: "人民币滚动",
    translationDifference: "折算差额计入其他综合收益",
  } as const)[value];
}
