import type {
  CreateSurfaceSectionSpec,
  DataSurfaceColumnSpec,
  FormSurfaceFieldSpec,
} from "@workspace/core/ui";
import type { CompanyRecord, CompanyRelationRecord } from "../types";

export type CompanyDraft = Omit<CompanyRecord, "id" | "version"> & { id?: number; version?: number };
export type CompanyRelationDraft = Omit<CompanyRelationRecord, "id" | "parentName" | "childName" | "version"> & {
  id?: number;
  version?: number;
};

export const EMPTY_COMPANY_DRAFT: CompanyDraft = {
  code: "",
  name: "",
  fullName: null,
  registeredCapital: null,
  unifiedCode: null,
  bankName: null,
  registeredAddress: null,
  registeredDate: null,
  legalPerson: null,
  managementGroup: "常规体系",
  codePoolCode: null,
  isActive: true,
  sortOrder: 0,
};

export const EMPTY_RELATION_DRAFT: CompanyRelationDraft = {
  parentId: 0,
  childId: 0,
  shareRatio: null,
  isConsolidated: false,
  effectiveFrom: null,
  effectiveTo: null,
};

export const COMPANY_COLUMNS: DataSurfaceColumnSpec<CompanyRecord>[] = [
  { key: "code", label: "编码", defaultVisible: true, cell: (row) => ({ kind: "text", value: row.code, font: "mono" }) },
  { key: "name", label: "简称", defaultVisible: true, cell: (row) => ({ kind: "text", value: row.name, emphasis: "medium" }) },
  { key: "fullName", label: "公司全称", defaultVisible: true, cell: (row) => row.fullName || "-" },
  { key: "unifiedCode", label: "统一社会信用代码", cell: (row) => row.unifiedCode || "-" },
  { key: "registeredCapital", label: "注册资本", cell: (row) => row.registeredCapital || "-" },
  { key: "legalPerson", label: "法定代表人", cell: (row) => row.legalPerson || "-" },
  { key: "managementGroup", label: "管理体系", cell: (row) => row.managementGroup },
  {
    key: "isActive",
    label: "状态",
    cell: (row) => ({ kind: "badge", label: row.isActive ? "启用" : "停用", tone: row.isActive ? "green" : "slate" }),
  },
];

export const COMPANY_VISIBLE_COLUMNS = COMPANY_COLUMNS.map((column) => column.key);

export const RELATION_COLUMNS: DataSurfaceColumnSpec<CompanyRelationRecord>[] = [
  { key: "parentName", label: "持股方", defaultVisible: true, cell: (row) => ({ kind: "text", value: row.parentName, emphasis: "medium" }) },
  { key: "childName", label: "被持股方", defaultVisible: true, cell: (row) => ({ kind: "text", value: row.childName, emphasis: "medium" }) },
  { key: "shareRatio", label: "持股比例", align: "left", font: "default", numeric: true, cell: (row) => row.shareRatio == null ? "-" : `${(row.shareRatio * 100).toFixed(2)}%` },
  {
    key: "isConsolidated",
    label: "并表口径",
    cell: (row) => ({ kind: "badge", label: row.isConsolidated ? "纳入并表" : "不纳入并表", tone: row.isConsolidated ? "sky" : "slate" }),
  },
  { key: "effectiveFrom", label: "生效日期", cell: (row) => row.effectiveFrom || "-" },
  { key: "effectiveTo", label: "失效日期", cell: (row) => row.effectiveTo || "长期有效" },
];

export const RELATION_VISIBLE_COLUMNS = RELATION_COLUMNS.map((column) => column.key);

export function companyFormSections(
  draft: CompanyDraft,
  onChange: <K extends keyof CompanyDraft>(key: K, value: CompanyDraft[K]) => void,
  companies: CompanyRecord[],
): CreateSurfaceSectionSpec<FormSurfaceFieldSpec>[] {
  const text = (key: keyof CompanyDraft, label: string, required = false): FormSurfaceFieldSpec => ({
    key: String(key),
    label,
    required,
    spec: { valueType: "string", control: "text", validation: required ? { required: true } : undefined },
    value: draft[key] == null ? "" : String(draft[key]),
    onChange: (value) => onChange(key, (String(value ?? "") || null) as CompanyDraft[typeof key]),
  });
  return [{
    key: "identity",
    title: "公司身份",
    layout: { columns: 2, density: "compact" },
    items: [
      text("code", "公司编码", true),
      text("name", "公司简称", true),
      { ...text("fullName", "公司全称"), span: 2 },
      text("unifiedCode", "统一社会信用代码"),
      text("legalPerson", "法定代表人"),
      text("registeredCapital", "注册资本"),
      {
        key: "registeredDate",
        label: "注册日期",
        spec: { valueType: "date", control: "temporal", precision: "date" },
        value: draft.registeredDate,
        onChange: (value) => onChange("registeredDate", value ? String(value) : null),
      },
      { ...text("registeredAddress", "注册地址"), span: 2 },
    ],
  }, {
    key: "management",
    title: "管理信息",
    layout: { columns: 2, density: "compact" },
    items: [
      text("bankName", "开户行"),
      {
        key: "managementGroup",
        label: "管理体系",
        spec: { valueType: "string", control: "choice", options: { source: "static", items: [
          { value: "常规体系", label: "常规体系" },
          { value: "GMP", label: "GMP" },
        ] } },
        value: draft.managementGroup,
        onChange: (value) => onChange("managementGroup", String(value ?? "常规体系")),
      },
      {
        key: "codePoolCode",
        label: "编码池",
        spec: { valueType: "reference", control: "choice", options: { source: "static", items: [
          { value: "", label: "自身" },
          ...companies.map((company) => ({ value: company.code, label: `${company.code} ${company.name}` })),
        ] } },
        value: draft.codePoolCode ?? "",
        onChange: (value) => onChange("codePoolCode", value ? String(value) : null),
      },
      {
        key: "sortOrder",
        label: "排序",
        spec: { valueType: "number", control: "number" },
        value: draft.sortOrder,
        onChange: (value) => onChange("sortOrder", Number(value) || 0),
      },
      {
        key: "isActive",
        label: "状态",
        spec: { valueType: "string", control: "choice", options: { source: "static", items: [
          { value: "enabled", label: "启用" },
          { value: "disabled", label: "停用" },
        ] } },
        value: draft.isActive ? "enabled" : "disabled",
        onChange: (value) => onChange("isActive", value === "enabled"),
      },
    ],
  }];
}

export function relationFormSections(
  draft: CompanyRelationDraft,
  onChange: <K extends keyof CompanyRelationDraft>(key: K, value: CompanyRelationDraft[K]) => void,
  companies: CompanyRecord[],
): CreateSurfaceSectionSpec<FormSurfaceFieldSpec>[] {
  const companyOptions = companies.map((company) => ({ value: String(company.id), label: `${company.name}（${company.code}）` }));
  return [{
    key: "relationship",
    title: "直接持股关系",
    layout: { columns: 2, density: "compact" },
    items: [
      {
        key: "parentId",
        label: "持股方",
        required: true,
        spec: { valueType: "reference", control: "choice", options: { source: "static", items: companyOptions }, validation: { required: true } },
        value: draft.parentId ? String(draft.parentId) : "",
        onChange: (value) => onChange("parentId", Number(value) || 0),
      },
      {
        key: "childId",
        label: "被持股方",
        required: true,
        spec: { valueType: "reference", control: "choice", options: { source: "static", items: companyOptions }, validation: { required: true } },
        value: draft.childId ? String(draft.childId) : "",
        onChange: (value) => onChange("childId", Number(value) || 0),
      },
      {
        key: "shareRatio",
        label: "持股比例",
        spec: { valueType: "number", control: "number", format: "percent", validation: { min: 0, max: 100 } },
        value: draft.shareRatio == null ? null : draft.shareRatio * 100,
        onChange: (value) => onChange("shareRatio", value === "" || value == null ? null : Number(value) / 100),
      },
      {
        key: "isConsolidated",
        label: "并表口径",
        spec: { valueType: "string", control: "choice", options: { source: "static", items: [
          { value: "included", label: "纳入并表" },
          { value: "excluded", label: "不纳入并表" },
        ] } },
        value: draft.isConsolidated ? "included" : "excluded",
        onChange: (value) => onChange("isConsolidated", value === "included"),
      },
      {
        key: "effectiveFrom",
        label: "生效日期",
        spec: { valueType: "date", control: "temporal", precision: "date" },
        value: draft.effectiveFrom,
        onChange: (value) => onChange("effectiveFrom", value ? String(value) : null),
      },
      {
        key: "effectiveTo",
        label: "失效日期",
        spec: { valueType: "date", control: "temporal", precision: "date" },
        value: draft.effectiveTo,
        onChange: (value) => onChange("effectiveTo", value ? String(value) : null),
      },
    ],
  }];
}
