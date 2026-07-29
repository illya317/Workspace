export type BusinessCodeObjectKey =
  | "hr.employee"
  | "hr.organization"
  | "hr.position"
  | "external.customer"
  | "external.supplier"
  | "work.project"
  | "finance.asset";

export type BusinessCodeSystemTemplateKey =
  | "system.sequential"
  | "system.yearSequence"
  | "system.dateSequence"
  | "system.datetimeSequence"
  | "system.organization"
  | "system.position"
  | "system.project"
  | "system.financeAsset";

export type BusinessCodeFieldTransform =
  | { kind: "none" }
  | { kind: "uppercaseLetters"; length: number }
  | { kind: "uppercaseAlphanumeric"; length: number }
  | { kind: "compactText"; length: number }
  | { kind: "integer"; length: number }
  | { kind: "padInteger"; length: number };

export type BusinessCodeTemplateSegment =
  | { kind: "literal"; value: string }
  | { kind: "field"; field: string; transform?: BusinessCodeFieldTransform }
  | { kind: "date" | "datetime"; field: string; format: string }
  | { kind: "sequence"; length: number };

export type BusinessCodeTemplateCondition = {
  field: string;
  operator: "equals";
  value: string;
};

export type BusinessCodeTemplateRule = {
  key: string;
  name: string;
  priority: number;
  conditions: BusinessCodeTemplateCondition[];
  segments: BusinessCodeTemplateSegment[];
  sequence?: {
    start: number;
    end?: number;
    scope: string[];
  };
};

export type BusinessCodeTemplateSettings = {
  version: 2;
  rules: BusinessCodeTemplateRule[];
};

export type BusinessCodeFieldDefinition = {
  key: string;
  label: string;
  valueKind: "text" | "date" | "datetime";
  example: string | number;
  transforms?: readonly BusinessCodeFieldTransform["kind"][];
  conditionOptions?: readonly { value: string; label: string }[];
  scopeEligible?: boolean;
};

export type BusinessCodeObjectDefinition = {
  key: BusinessCodeObjectKey;
  label: string;
  ownerModule: "hr" | "external" | "work" | "finance";
  adapter: "sequential" | "organization" | "position" | "project" | "financeAsset";
  defaultTemplateKey: BusinessCodeSystemTemplateKey;
  implementationPaths: readonly string[];
};

export type BusinessCodeSystemTemplate = {
  key: BusinessCodeSystemTemplateKey;
  label: string;
  description: string;
  example: string;
  settings: BusinessCodeTemplateSettings;
};

export type BusinessCodeCustomTemplate = {
  key: string;
  name: string;
  example: string;
  settings: BusinessCodeTemplateSettings;
};

export type BusinessCodeManagementConfig = {
  templates: BusinessCodeCustomTemplate[];
  templateByObject: Record<BusinessCodeObjectKey, string>;
};

const sequenceRule = (
  segments: BusinessCodeTemplateSegment[],
  scope: string[] = [],
): BusinessCodeTemplateSettings => ({
  version: 2,
  rules: [{
    key: "default",
    name: "默认规则",
    priority: 100,
    conditions: [],
    segments,
    sequence: { start: 1, scope },
  }],
});

export const BUSINESS_CODE_FIELDS: readonly BusinessCodeFieldDefinition[] = [
  { key: "createdAt", label: "生成时间", valueKind: "datetime", example: "2026-07-29 15:08:06", scopeEligible: true },
  { key: "companyCode", label: "公司编码", valueKind: "text", example: "02", scopeEligible: true },
  { key: "assetCategoryCode", label: "资产分类编码", valueKind: "text", example: "FA-ELECTRONIC", scopeEligible: true },
  { key: "fiscalYear", label: "账期年度", valueKind: "date", example: 2026, scopeEligible: true },
  {
    key: "organizationIdentifier",
    label: "组织简称",
    valueKind: "text",
    example: "FUN",
    transforms: ["none", "uppercaseLetters", "uppercaseAlphanumeric", "compactText"],
  },
  { key: "rootOrganizationIdentifier", label: "根组织简称", valueKind: "text", example: "FUN" },
  {
    key: "localSequence",
    label: "本级编号",
    valueKind: "text",
    example: "1",
    transforms: ["none", "integer", "padInteger"],
  },
  { key: "parentOrganizationSequenceStem", label: "上级编号段", valueKind: "text", example: "1" },
  { key: "departmentCode", label: "直属组织编码", valueKind: "text", example: "FUN-001", scopeEligible: true },
  {
    key: "hierarchyKind",
    label: "组织体系",
    valueKind: "text",
    example: "M",
    conditionOptions: [{ value: "G", label: "职能组织" }, { value: "M", label: "管理组织" }],
  },
  {
    key: "organizationLevel",
    label: "组织层级",
    valueKind: "text",
    example: "1",
    conditionOptions: [{ value: "1", label: "一级" }, { value: "2", label: "二级" }, { value: "3", label: "三级" }],
  },
  {
    key: "projectType",
    label: "项目类型",
    valueKind: "text",
    example: "company",
    conditionOptions: [
      { value: "company", label: "公司项目" },
      { value: "department", label: "部门项目" },
      { value: "other", label: "其他项目" },
    ],
  },
] as const;

const organizationIdentifier = (): BusinessCodeTemplateSegment => ({
  kind: "field",
  field: "organizationIdentifier",
  transform: { kind: "uppercaseLetters", length: 3 },
});

export const BUSINESS_CODE_SYSTEM_TEMPLATES: readonly BusinessCodeSystemTemplate[] = [
  {
    key: "system.sequential",
    label: "通用流水",
    description: "固定文本与末尾流水。",
    example: "CODE-00001",
    settings: sequenceRule([
      { kind: "literal", value: "CODE-" },
      { kind: "sequence", length: 5 },
    ]),
  },
  {
    key: "system.yearSequence",
    label: "年度流水",
    description: "固定文本、生成年度和末尾流水。",
    example: "CODE-26-00001",
    settings: sequenceRule([
      { kind: "literal", value: "CODE-" },
      { kind: "date", field: "createdAt", format: "YY" },
      { kind: "literal", value: "-" },
      { kind: "sequence", length: 5 },
    ], ["createdAt"]),
  },
  {
    key: "system.dateSequence",
    label: "日期流水",
    description: "固定文本、生成日期和末尾流水。",
    example: "CODE-260729-00001",
    settings: sequenceRule([
      { kind: "literal", value: "CODE-" },
      { kind: "date", field: "createdAt", format: "YYMMDD" },
      { kind: "literal", value: "-" },
      { kind: "sequence", length: 5 },
    ], ["createdAt"]),
  },
  {
    key: "system.datetimeSequence",
    label: "时间流水",
    description: "固定文本、生成完整时间和末尾流水。",
    example: "CODE-260729150806-00001",
    settings: sequenceRule([
      { kind: "literal", value: "CODE-" },
      { kind: "datetime", field: "createdAt", format: "YYMMDDHHmmss" },
      { kind: "literal", value: "-" },
      { kind: "sequence", length: 5 },
    ], ["createdAt"]),
  },
  {
    key: "system.organization",
    label: "组织分层",
    description: "同一模板按组织体系和层级匹配四条规则。",
    example: "FUN-001",
    settings: {
      version: 2,
      rules: [
        {
          key: "management-level-1",
          name: "一级管理组织",
          priority: 400,
          conditions: [
            { field: "hierarchyKind", operator: "equals", value: "M" },
            { field: "organizationLevel", operator: "equals", value: "1" },
          ],
          segments: [organizationIdentifier(), { kind: "literal", value: "-001" }],
        },
        {
          key: "functional",
          name: "职能组织",
          priority: 300,
          conditions: [{ field: "hierarchyKind", operator: "equals", value: "G" }],
          segments: [organizationIdentifier()],
        },
        {
          key: "management-level-2",
          name: "二级管理组织",
          priority: 200,
          conditions: [
            { field: "hierarchyKind", operator: "equals", value: "M" },
            { field: "organizationLevel", operator: "equals", value: "2" },
          ],
          segments: [
            { kind: "field", field: "rootOrganizationIdentifier" },
            { kind: "literal", value: "-" },
            { kind: "field", field: "localSequence", transform: { kind: "integer", length: 4 } },
            { kind: "literal", value: "00" },
          ],
        },
        {
          key: "management-level-3",
          name: "三级管理组织",
          priority: 100,
          conditions: [
            { field: "hierarchyKind", operator: "equals", value: "M" },
            { field: "organizationLevel", operator: "equals", value: "3" },
          ],
          segments: [
            { kind: "field", field: "rootOrganizationIdentifier" },
            { kind: "literal", value: "-" },
            { kind: "field", field: "parentOrganizationSequenceStem" },
            { kind: "field", field: "localSequence", transform: { kind: "padInteger", length: 2 } },
          ],
        },
      ],
    },
  },
  {
    key: "system.position",
    label: "组织岗位",
    description: "岗位固定文本、直属组织编码和部门内流水。",
    example: "GW-FUN-001-01",
    settings: sequenceRule([
      { kind: "literal", value: "GW-" },
      { kind: "field", field: "departmentCode" },
      { kind: "literal", value: "-" },
      { kind: "sequence", length: 2 },
    ], ["departmentCode"]),
  },
  {
    key: "system.project",
    label: "年度项目",
    description: "按公司、部门和其他项目匹配三条年度流水规则。",
    example: "PRJ-26-001",
    settings: {
      version: 2,
      rules: [
        {
          key: "company",
          name: "公司项目",
          priority: 300,
          conditions: [{ field: "projectType", operator: "equals", value: "company" }],
          segments: [
            { kind: "literal", value: "PRJ-" },
            { kind: "date", field: "createdAt", format: "YY" },
            { kind: "literal", value: "-" },
            { kind: "sequence", length: 3 },
          ],
          sequence: { start: 1, end: 999, scope: ["createdAt"] },
        },
        {
          key: "department",
          name: "部门项目",
          priority: 200,
          conditions: [{ field: "projectType", operator: "equals", value: "department" }],
          segments: [
            { kind: "field", field: "departmentCode" },
            { kind: "literal", value: "-" },
            { kind: "date", field: "createdAt", format: "YY" },
            { kind: "literal", value: "-" },
            { kind: "sequence", length: 3 },
          ],
          sequence: { start: 1, scope: ["departmentCode", "createdAt"] },
        },
        {
          key: "other",
          name: "其他项目",
          priority: 100,
          conditions: [{ field: "projectType", operator: "equals", value: "other" }],
          segments: [
            { kind: "literal", value: "PRJ-" },
            { kind: "date", field: "createdAt", format: "YY" },
            { kind: "literal", value: "-" },
            { kind: "sequence", length: 3 },
          ],
          sequence: { start: 1, scope: ["createdAt"] },
        },
      ],
    },
  },
  {
    key: "system.financeAsset",
    label: "财务资产",
    description: "公司、资产分类、账期年度和固定五位流水。",
    example: "02-FA-ELECTRONIC-2026-00001",
    settings: sequenceRule([
      { kind: "field", field: "companyCode" },
      { kind: "literal", value: "-" },
      { kind: "field", field: "assetCategoryCode" },
      { kind: "literal", value: "-" },
      { kind: "date", field: "fiscalYear", format: "YYYY" },
      { kind: "literal", value: "-" },
      { kind: "sequence", length: 5 },
    ], ["companyCode", "assetCategoryCode", "fiscalYear"]),
  },
] as const;

export const BUSINESS_CODE_OBJECTS: readonly BusinessCodeObjectDefinition[] = [
  {
    key: "hr.employee",
    label: "员工编码",
    ownerModule: "hr",
    adapter: "sequential",
    defaultTemplateKey: "system.sequential",
    implementationPaths: ["packages/hr/server/employees.ts"],
  },
  {
    key: "hr.organization",
    label: "组织编码",
    ownerModule: "hr",
    adapter: "organization",
    defaultTemplateKey: "system.organization",
    implementationPaths: [
      "packages/hr/server/domain/department-validation.ts",
      "packages/hr/utils/department-code-cascade.ts",
    ],
  },
  {
    key: "hr.position",
    label: "岗位编码",
    ownerModule: "hr",
    adapter: "position",
    defaultTemplateKey: "system.position",
    implementationPaths: ["packages/hr/ui/tabs/department-position/utils.ts"],
  },
  {
    key: "external.customer",
    label: "客户编码",
    ownerModule: "external",
    adapter: "sequential",
    defaultTemplateKey: "system.sequential",
    implementationPaths: ["packages/external/server/external-party-service.ts"],
  },
  {
    key: "external.supplier",
    label: "供应商编码",
    ownerModule: "external",
    adapter: "sequential",
    defaultTemplateKey: "system.sequential",
    implementationPaths: ["packages/external/server/external-party-service.ts"],
  },
  {
    key: "work.project",
    label: "项目编码",
    ownerModule: "work",
    adapter: "project",
    defaultTemplateKey: "system.project",
    implementationPaths: ["packages/work/server/project-normalization.ts"],
  },
  {
    key: "finance.asset",
    label: "财务资产编码",
    ownerModule: "finance",
    adapter: "financeAsset",
    defaultTemplateKey: "system.financeAsset",
    implementationPaths: ["packages/finance/server/assets/asset-code-allocation.ts"],
  },
] as const;

export function businessCodeFieldDefinition(key: string) {
  return BUSINESS_CODE_FIELDS.find((item) => item.key === key);
}

export function businessCodeObjectDefinition(key: BusinessCodeObjectKey) {
  const definition = BUSINESS_CODE_OBJECTS.find((item) => item.key === key);
  if (!definition) throw new Error(`未登记编码对象 ${key}`);
  return definition;
}

export function businessCodeSystemTemplate(key: BusinessCodeSystemTemplateKey) {
  const template = BUSINESS_CODE_SYSTEM_TEMPLATES.find((item) => item.key === key);
  if (!template) throw new Error(`未登记系统编码模板 ${key}`);
  return template;
}

export function defaultBusinessCodeManagement(): BusinessCodeManagementConfig {
  return {
    templates: [],
    templateByObject: Object.fromEntries(BUSINESS_CODE_OBJECTS.map((item) => [
      item.key,
      item.defaultTemplateKey,
    ])) as Record<BusinessCodeObjectKey, string>,
  };
}
