import type {
  CreateSurfaceSectionSpec,
  FormSurfaceFieldSpec,
  FormSurfaceSectionSpec,
} from "@workspace/core/ui";
import type {
  ExternalPartyCategory,
  ExternalParty,
  ExternalPartyDraft,
  ExternalPartyRelatedPartyType,
} from "@workspace/external/types";

type DraftField = keyof ExternalPartyDraft;
export type ExternalPartyDraftValue = string | boolean | number | null;

export const EXTERNAL_PARTY_LABELS: Record<ExternalPartyCategory, { singular: string; title: string }> = {
  customer: { singular: "客户", title: "客户信息" },
  supplier: { singular: "供应商", title: "供应商信息" },
};

export const EXTERNAL_PARTY_ROLE_LABELS: Record<ExternalPartyCategory, string> = {
  customer: "客户",
  supplier: "供应商",
};

export const EXTERNAL_PARTY_RELATED_PARTY_LABELS: Record<ExternalPartyRelatedPartyType, string> = {
  unrelated: "非关联方",
  group: "集团内",
  joint_venture_associate: "合营/联营",
  investor_influence: "控制或重大影响方",
  key_management_related: "关键管理人员关联方",
  other_related: "其他关联方",
};

interface ExternalPartyFormOptions {
  readOnly?: boolean;
  subjectReadOnly?: boolean;
  autoGenerateCode?: boolean;
  existingCandidates?: ExternalParty[];
  candidatesLoading?: boolean;
  candidatesError?: string | null;
  onExistingPartyChange?: (party: ExternalParty | null) => void;
}

export function emptyExternalPartyDraft(): ExternalPartyDraft {
  return {
    subjectType: "organization",
    existingPartyId: null,
    relatedPartyType: "unrelated",
    code: "",
    name: "",
    fullName: null,
    classification: null,
    identityNumber: "",
    legalRepresentative: null,
    contactPerson: null,
    phone: null,
    email: null,
    bankName: null,
    bankAccount: null,
    address: null,
    invoiceTitle: null,
    invoiceAddressPhone: null,
    settlementTerms: null,
    creditLimit: null,
    creditDays: null,
    taxRate: null,
    remark: null,
  };
}

function textField(
  key: DraftField,
  label: string,
  draft: ExternalPartyDraft,
  onChange: (field: DraftField, value: ExternalPartyDraftValue) => void,
  options: { required?: boolean; multiline?: boolean; readOnly?: boolean; span?: 2; type?: "email" | "tel"; hint?: string; placeholder?: string } = {},
): FormSurfaceFieldSpec {
  return {
    key,
    label,
    required: options.required,
    hint: options.hint,
    span: options.span,
    spec: {
      valueType: "string",
      control: "text",
      multiline: options.multiline,
      validation: options.required ? { required: true } : undefined,
    },
    value: String(draft[key] ?? ""),
    placeholder: options.placeholder,
    onChange: (value) => onChange(key, String(value ?? "")),
    type: options.type,
    readOnly: options.readOnly,
    rows: options.multiline ? 2 : undefined,
  };
}

function numberField(
  key: "creditLimit" | "creditDays" | "taxRate",
  label: string,
  draft: ExternalPartyDraft,
  onChange: (field: DraftField, value: ExternalPartyDraftValue) => void,
  options: { max?: number; readOnly?: boolean; step?: number | string } = {},
): FormSurfaceFieldSpec {
  return {
    key,
    label,
    spec: {
      valueType: "number",
      control: "number",
      validation: { min: 0, max: options.max },
    },
    value: draft[key] ?? "",
    step: options.step,
    readOnly: options.readOnly,
    onChange: (value) => {
      const normalized = String(value ?? "").trim();
      onChange(key, normalized ? Number(normalized) : null);
    },
  };
}

export function externalPartyFormSections(
  category: ExternalPartyCategory,
  draft: ExternalPartyDraft,
  onChange: (field: DraftField, value: ExternalPartyDraftValue) => void,
  options: ExternalPartyFormOptions = {},
): CreateSurfaceSectionSpec<FormSurfaceFieldSpec>[] {
  const individual = draft.subjectType === "individual";
  const readOnly = options.readOnly ?? false;
  const subjectReadOnly = readOnly || options.subjectReadOnly || Boolean(draft.existingPartyId);
  const singular = EXTERNAL_PARTY_LABELS[category].singular;
  return [
    {
      key: "identity",
      title: "主体信息",
      layout: { columns: 2, density: "compact" },
      items: [
        ...(options.existingCandidates ? [{
          key: "existingPartyId",
          label: "关联已有主体",
          hint: "同一单位或个人已存在时，直接补充当前往来角色",
          spec: {
            valueType: "string" as const,
            control: "choice" as const,
            options: {
              source: "static" as const,
              items: [
                { value: "", label: "新建主体" },
                ...options.existingCandidates.map((party) => ({
                  value: String(party.id),
                  label: `${party.name} · ${party.code}${party.identityNumber ? ` · ${party.identityNumber}` : ""}`,
                })),
              ],
              visibleCount: 8,
            },
          },
          value: draft.existingPartyId ? String(draft.existingPartyId) : "",
          disabled: readOnly,
          loading: options.candidatesLoading,
          emptyText: options.candidatesError || "没有可关联的已有主体",
          onChange: (value: unknown) => {
            const id = Number(value);
            options.onExistingPartyChange?.(
              Number.isInteger(id) && id > 0
                ? options.existingCandidates?.find((party) => party.id === id) ?? null
                : null,
            );
          },
        }] : []),
        {
          key: "subjectType",
          label: "主体类型",
          required: true,
          spec: {
            valueType: "string",
            control: "choice",
            options: {
              source: "static",
              items: [
                { value: "organization", label: "单位" },
                { value: "individual", label: "个人" },
              ],
              visibleCount: 2,
            },
          },
          value: draft.subjectType,
          disabled: subjectReadOnly,
          onChange: (value) => onChange("subjectType", value === "individual" ? "individual" : "organization"),
        },
        {
          key: "relatedPartyType",
          label: "关系性质",
          required: true,
          spec: {
            valueType: "string",
            control: "choice",
            options: {
              source: "static",
              items: Object.entries(EXTERNAL_PARTY_RELATED_PARTY_LABELS).map(([value, label]) => ({ value, label })),
              visibleCount: 6,
            },
          },
          value: draft.relatedPartyType,
          disabled: subjectReadOnly,
          onChange: (value) => {
            const normalized = String(value);
            onChange(
              "relatedPartyType",
              normalized in EXTERNAL_PARTY_RELATED_PARTY_LABELS
                ? normalized as ExternalPartyRelatedPartyType
                : "unrelated",
            );
          },
        },
        textField("code", `${singular}编码`, draft, onChange, {
          required: !options.autoGenerateCode,
          readOnly,
          hint: options.autoGenerateCode ? "留空时按系统编码配置自动生成" : undefined,
          placeholder: options.autoGenerateCode ? "自动生成" : undefined,
        }),
        textField("name", individual ? "姓名" : "简称", draft, onChange, { required: true, readOnly: subjectReadOnly }),
        ...(!individual ? [textField("fullName", "全称", draft, onChange, { readOnly: subjectReadOnly })] : []),
        textField("identityNumber", individual ? "证件号码" : "统一代码", draft, onChange, {
          required: true,
          readOnly: subjectReadOnly,
        }),
        ...(!individual ? [textField("legalRepresentative", "法定代表人", draft, onChange, { readOnly: subjectReadOnly })] : []),
        textField("classification", "业务分类", draft, onChange, { readOnly }),
      ],
    },
    {
      key: "contact",
      title: "联系信息",
      layout: { columns: 2, density: "compact" },
      items: [
        ...(!individual ? [textField("contactPerson", "联系人", draft, onChange, { readOnly })] : []),
        textField("phone", "联系电话", draft, onChange, { type: "tel", readOnly }),
        textField("email", "邮箱", draft, onChange, { type: "email", readOnly }),
        textField("address", individual ? "通讯地址" : "办公地址", draft, onChange, { span: 2, readOnly }),
      ],
    },
    {
      key: "settlement",
      title: "财务与结算",
      layout: { columns: 2, density: "compact" },
      items: [
        textField("bankName", "开户行", draft, onChange, { readOnly }),
        textField("bankAccount", "银行账号", draft, onChange, { readOnly }),
        textField("settlementTerms", "结算条件", draft, onChange, { readOnly }),
        numberField("creditDays", category === "customer" ? "信用期限（天）" : "付款期限（天）", draft, onChange, { max: 3650, readOnly }),
        numberField("creditLimit", "信用额度", draft, onChange, { step: "0.01", readOnly }),
        ...(!individual ? [numberField("taxRate", "税率（%）", draft, onChange, { max: 100, step: "0.01", readOnly })] : []),
        ...(!individual ? [textField("invoiceTitle", "开票抬头", draft, onChange, { readOnly })] : []),
        ...(!individual ? [textField("invoiceAddressPhone", "开票地址及电话", draft, onChange, { readOnly })] : []),
        textField("remark", "备注", draft, onChange, { multiline: true, span: 2, readOnly }),
      ],
    },
  ];
}

export function externalPartyEditSections(
  category: ExternalPartyCategory,
  draft: ExternalPartyDraft,
  onChange: (field: DraftField, value: ExternalPartyDraftValue) => void,
  options: ExternalPartyFormOptions = {},
): FormSurfaceSectionSpec[] {
  return externalPartyFormSections(category, draft, onChange, options).map((section) => ({
    kind: "section",
    ...section,
  }));
}
