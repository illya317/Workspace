import type { ComposableBusinessCodeRule } from "./business-code-rule";

export type BusinessCodeTemplateFamily =
  | "sequential"
  | "organization"
  | "position"
  | "project"
  | "financeAsset";

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

export type BusinessCodeObjectDefinition = {
  key: BusinessCodeObjectKey;
  label: string;
  ownerModule: "hr" | "external" | "work" | "finance";
  family: BusinessCodeTemplateFamily;
  defaultTemplateKey: BusinessCodeSystemTemplateKey;
  implementationPaths: readonly string[];
};

export type BusinessCodeSystemTemplate = {
  key: BusinessCodeSystemTemplateKey;
  label: string;
  family: BusinessCodeTemplateFamily;
  description: string;
  example: string;
};

export type BusinessCodeTemplateSettings =
  | {
      kind: "sequential";
      rule: ComposableBusinessCodeRule;
    }
  | {
      kind: "organization";
      rule: {
        identifierFormat: "uppercaseLetters" | "uppercaseAlphanumeric" | "freeText";
        identifierLength: number;
        functionalPrefix: string;
        separator: string;
        managementRootSuffix: string;
        level2Suffix: string;
        level2SequenceLength: number;
        level3SequenceLength: number;
      };
    }
  | {
      kind: "position";
      rule: {
        prefix: string;
        separator: string;
        sequenceLength: number;
        sequenceStart: number;
      };
    }
  | {
      kind: "project";
      rule: {
        companyPrefix: string;
        separator: string;
        yearDigits: 2 | 4;
        companySequenceLength: number;
        companySequenceStart: number;
        companySequenceEnd: number;
        departmentSequenceLength: number;
        departmentSequenceStart: number;
        otherSequenceLength: number;
        otherSequenceStart: number;
      };
    }
  | {
      kind: "financeAsset";
      rule: ComposableBusinessCodeRule;
    };

export type BusinessCodeCustomTemplate = {
  key: string;
  name: string;
  family: BusinessCodeTemplateFamily;
  baseTemplateKey: BusinessCodeSystemTemplateKey;
  example: string;
  settings: BusinessCodeTemplateSettings;
};

export type BusinessCodeManagementConfig = {
  templates: BusinessCodeCustomTemplate[];
  templateByObject: Record<BusinessCodeObjectKey, string>;
};

export const BUSINESS_CODE_SYSTEM_TEMPLATES: readonly BusinessCodeSystemTemplate[] = [
  {
    key: "system.sequential",
    label: "通用流水",
    family: "sequential",
    description: "可选固定文本、连接符和末尾流水。",
    example: "CODE-00001",
  },
  {
    key: "system.yearSequence",
    label: "年度流水",
    family: "sequential",
    description: "可选固定文本、生成年度和末尾流水。",
    example: "CODE-26-00001",
  },
  {
    key: "system.dateSequence",
    label: "日期流水",
    family: "sequential",
    description: "可选固定文本、生成日期和末尾流水。",
    example: "CODE-260729-00001",
  },
  {
    key: "system.datetimeSequence",
    label: "时间流水",
    family: "sequential",
    description: "可选固定文本、生成完整时间和末尾流水。",
    example: "CODE-260729150806-00001",
  },
  {
    key: "system.organization",
    label: "组织分层",
    family: "organization",
    description: "业务组织简称加管理层级段，子级继承上级简称。",
    example: "FUN-001",
  },
  {
    key: "system.position",
    label: "组织岗位",
    family: "position",
    description: "岗位固定文本、直属组织编码和末尾流水。",
    example: "GW-FUN-001-01",
  },
  {
    key: "system.project",
    label: "年度项目",
    family: "project",
    description: "项目标识、两位或四位年度和末尾流水。",
    example: "PRJ-26-001",
  },
  {
    key: "system.financeAsset",
    label: "财务资产",
    family: "financeAsset",
    description: "公司、资产分类、账期年度和固定五位流水。",
    example: "02-FA-ELECTRONIC-2026-00001",
  },
] as const;

export const BUSINESS_CODE_OBJECTS: readonly BusinessCodeObjectDefinition[] = [
  {
    key: "hr.employee",
    label: "员工编码",
    ownerModule: "hr",
    family: "sequential",
    defaultTemplateKey: "system.sequential",
    implementationPaths: ["packages/hr/server/employees.ts"],
  },
  {
    key: "hr.organization",
    label: "组织编码",
    ownerModule: "hr",
    family: "organization",
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
    family: "position",
    defaultTemplateKey: "system.position",
    implementationPaths: ["packages/hr/ui/tabs/department-position/utils.ts"],
  },
  {
    key: "external.customer",
    label: "客户编码",
    ownerModule: "external",
    family: "sequential",
    defaultTemplateKey: "system.sequential",
    implementationPaths: ["packages/external/server/external-party-service.ts"],
  },
  {
    key: "external.supplier",
    label: "供应商编码",
    ownerModule: "external",
    family: "sequential",
    defaultTemplateKey: "system.sequential",
    implementationPaths: ["packages/external/server/external-party-service.ts"],
  },
  {
    key: "work.project",
    label: "项目编码",
    ownerModule: "work",
    family: "project",
    defaultTemplateKey: "system.project",
    implementationPaths: ["packages/work/server/project-normalization.ts"],
  },
  {
    key: "finance.asset",
    label: "财务资产编码",
    ownerModule: "finance",
    family: "financeAsset",
    defaultTemplateKey: "system.financeAsset",
    implementationPaths: ["packages/finance/server/assets/asset-code-allocation.ts"],
  },
] as const;

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
