import {
  parseComposableBusinessCodeRule,
  renderBusinessCode,
  type BusinessCodeSegment,
  type ComposableBusinessCodeRule,
} from "./business-code-rule";
import {
  BUSINESS_CODE_OBJECTS,
  BUSINESS_CODE_SYSTEM_TEMPLATES,
  defaultBusinessCodeManagement,
  type BusinessCodeCustomTemplate,
  type BusinessCodeManagementConfig,
  type BusinessCodeObjectKey,
  type BusinessCodeSystemTemplateKey,
} from "./business-code-registry";
import {
  businessCodeTemplateSettingsFromLegacy,
  upgradeBusinessCodeTemplateSettings,
} from "./business-code-template";
import {
  DEPARTMENT_IDENTIFIER_FORMATS,
  type DepartmentCodeRule,
  type DepartmentIdentifierFormat,
  type SequentialBusinessCodeRule,
} from "./business-code-config-contract";

export {
  DEPARTMENT_IDENTIFIER_FORMATS,
  type DepartmentCodeRule,
  type DepartmentIdentifierFormat,
  type SequentialBusinessCodeRule,
} from "./business-code-config-contract";

export const BUSINESS_CODE_CONFIG_KEY = "businessCodeConfig";

export type BusinessCodeConfig = {
  management: BusinessCodeManagementConfig;
  employee: ComposableBusinessCodeRule;
  department: DepartmentCodeRule;
  position: SequentialBusinessCodeRule;
  customer: ComposableBusinessCodeRule;
  supplier: ComposableBusinessCodeRule;
  project: {
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
  financeAsset: ComposableBusinessCodeRule;
};

export type BusinessCodeTenantDefaults = {
  companyProjectCodePrefix: string;
  companyProjectSequenceWidth: number;
  companyProjectSequenceStart: number;
  companyProjectSequenceEnd: number;
  departmentProjectSequenceWidth: number;
  otherProjectSequenceStart: number;
};

const DEFAULT_SEQUENTIAL_RULES = {
  position: { prefix: "GW", separator: "-", sequenceLength: 2, sequenceStart: 1 },
} as const;

function simpleRule(prefix: string, separator: string, sequenceLength: number): ComposableBusinessCodeRule {
  return {
    segments: [
      ...(prefix ? [{ kind: "literal" as const, value: prefix }] : []),
      ...(prefix && separator ? [{ kind: "literal" as const, value: separator }] : []),
      { kind: "sequence", length: sequenceLength },
    ],
    sequenceStart: 1,
    sequenceScope: [],
  };
}

export function normalizeDepartmentIdentifier(
  value: string,
  rule: Pick<DepartmentCodeRule, "identifierFormat" | "identifierLength">,
) {
  const source = String(value ?? "");
  if (rule.identifierFormat === "uppercaseLetters") {
    return source.replace(/[^a-zA-Z]/g, "").toUpperCase().slice(0, rule.identifierLength);
  }
  if (rule.identifierFormat === "uppercaseAlphanumeric") {
    return source.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, rule.identifierLength);
  }
  return source.replace(/\s/g, "").slice(0, rule.identifierLength);
}

export function isDepartmentIdentifier(
  value: string,
  rule: Pick<DepartmentCodeRule, "identifierFormat" | "identifierLength">,
) {
  if (value.length !== rule.identifierLength) return false;
  if (rule.identifierFormat === "uppercaseLetters") return /^[A-Z]+$/.test(value);
  if (rule.identifierFormat === "uppercaseAlphanumeric") return /^[A-Z0-9]+$/.test(value);
  return /^\S+$/.test(value);
}

export function defaultFinanceAssetCodeRule(): ComposableBusinessCodeRule {
  return {
    segments: [
      { kind: "reference", source: "companyCode" },
      { kind: "literal", value: "-" },
      { kind: "reference", source: "assetCategoryCode" },
      { kind: "literal", value: "-" },
      { kind: "date", source: "fiscalYear", format: "YYYY" },
      { kind: "literal", value: "-" },
      { kind: "sequence", length: 5 },
    ],
    sequenceStart: 1,
    sequenceScope: ["companyCode", "assetCategoryCode", "fiscalYear"],
  };
}

export function parseFinanceAssetCodeRule(value: unknown): ComposableBusinessCodeRule {
  if (!value || typeof value !== "object") throw new Error("资产编码规则配置无效");
  const source = value as Record<string, unknown>;
  if (Array.isArray(source.segments)) {
    const parsed = parseComposableBusinessCodeRule(value, {
      allowedSources: ["companyCode", "assetCategoryCode", "fiscalYear"],
    });
    const sequence = parsed.segments.find((segment) => segment.kind === "sequence");
    if (!sequence || sequence.length !== 5) throw new Error("资产编码流水必须为 5 位");
    const requiredScope = ["companyCode", "assetCategoryCode", "fiscalYear"];
    if (parsed.sequenceScope !== undefined && (
      parsed.sequenceScope.length !== requiredScope.length
      || !requiredScope.every((field) => parsed.sequenceScope?.includes(field))
    )) {
      throw new Error("资产编码流水作用域必须是公司、资产分类和账期年度");
    }
    return { ...parsed, sequenceScope: requiredScope };
  }
  if (typeof source.separator !== "string" || source.separator.length > 3) {
    throw new Error("资产编码分隔符配置无效");
  }
  const separator = source.separator;
  if (source.sequenceLength !== 5) throw new Error("资产编码流水必须为 5 位");
  const sequenceStart = integer(source.sequenceStart, 0, 1, 99_999);
  if (!sequenceStart) throw new Error("资产编码流水起始值无效");
  const baseline = defaultFinanceAssetCodeRule();
  return parseComposableBusinessCodeRule({
    segments: baseline.segments.flatMap<BusinessCodeSegment>((segment) => segment.kind === "literal"
      ? (separator ? [{ ...segment, value: separator }] : [])
      : [segment]),
    sequenceStart,
  }, { allowedSources: ["companyCode", "assetCategoryCode", "fiscalYear"] });
}

export function defaultBusinessCodeConfig(
  tenant: BusinessCodeTenantDefaults,
): BusinessCodeConfig {
  return {
    management: defaultBusinessCodeManagement(),
    employee: simpleRule("", "", 5),
    department: {
      identifierFormat: "uppercaseLetters",
      identifierLength: 3,
      functionalPrefix: "FUN",
      separator: "",
      managementRootSuffix: "001",
      level2Suffix: "00",
      level2SequenceLength: 4,
      level3SequenceLength: 2,
    },
    position: { ...DEFAULT_SEQUENTIAL_RULES.position },
    customer: simpleRule("CUS", "-", 5),
    supplier: simpleRule("SUP", "-", 5),
    project: {
      companyPrefix: tenant.companyProjectCodePrefix,
      separator: "-",
      yearDigits: 2,
      companySequenceLength: tenant.companyProjectSequenceWidth,
      companySequenceStart: tenant.companyProjectSequenceStart,
      companySequenceEnd: tenant.companyProjectSequenceEnd,
      departmentSequenceLength: tenant.departmentProjectSequenceWidth,
      departmentSequenceStart: 1,
      otherSequenceLength: tenant.companyProjectSequenceWidth,
      otherSequenceStart: tenant.otherProjectSequenceStart,
    },
    financeAsset: defaultFinanceAssetCodeRule(),
  };
}

function text(value: unknown, fallback: string, maxLength = 24) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : fallback;
}

function integer(value: unknown, fallback: number, min: number, max: number) {
  return Number.isInteger(value) && Number(value) >= min && Number(value) <= max
    ? Number(value)
    : fallback;
}

function sequentialRule(
  value: unknown,
  fallback: SequentialBusinessCodeRule,
): SequentialBusinessCodeRule {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    prefix: text(source.prefix, fallback.prefix),
    separator: text(source.separator, fallback.separator, 3),
    sequenceLength: integer(source.sequenceLength, fallback.sequenceLength, 1, 12),
    sequenceStart: integer(source.sequenceStart, fallback.sequenceStart, 1, 999_999_999),
  };
}

function composedRule(
  value: unknown,
  fallback: ComposableBusinessCodeRule,
  options: { allowedSources: readonly string[]; legacy?: "sequential" | "financeAsset" },
) {
  try {
    if (value && typeof value === "object" && Array.isArray((value as Record<string, unknown>).segments)) {
      const parsed = options.legacy === "financeAsset"
        ? parseFinanceAssetCodeRule(value)
        : parseComposableBusinessCodeRule(value, { allowedSources: options.allowedSources });
      return parsed.sequenceScope === undefined
        ? { ...parsed, sequenceScope: fallback.sequenceScope ?? [] }
        : parsed;
    }
    const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
    if (options.legacy === "sequential") {
      const prefix = text(source.prefix, "");
      const separator = text(source.separator, "", 3);
      const sequenceLength = integer(source.sequenceLength, 5, 1, 12);
      return parseComposableBusinessCodeRule({
        ...simpleRule(prefix, separator, sequenceLength),
        sequenceStart: integer(source.sequenceStart, fallback.sequenceStart, 1, 999_999_999),
      }, { allowedSources: options.allowedSources });
    }
    if (options.legacy === "financeAsset") {
      const baseline = defaultFinanceAssetCodeRule();
      const separator = text(source.separator, "-", 3);
      return parseComposableBusinessCodeRule({
        segments: baseline.segments.flatMap<BusinessCodeSegment>((segment) => segment.kind === "literal"
          ? (separator ? [{ ...segment, value: separator }] : [])
          : [segment]),
        sequenceStart: integer(source.sequenceStart, fallback.sequenceStart, 1, 99_999),
      }, { allowedSources: options.allowedSources });
    }
  } catch {
    // Stored configuration is normalized to the last valid rule; API writes reject invalid shapes.
  }
  return fallback;
}

function customTemplate(value: unknown): BusinessCodeCustomTemplate | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  const key = text(source.key, "", 64);
  const name = text(source.name, "", 40);
  const example = text(source.example, "", 120);
  const baseTemplateKey = text(source.baseTemplateKey, "", 64);
  const baseTemplate = BUSINESS_CODE_SYSTEM_TEMPLATES.find((template) => template.key === baseTemplateKey);
  if (
    !key.startsWith("custom.")
    || !name
    || !example
  ) {
    return null;
  }
  let settings;
  try {
    settings = source.settings
      ? upgradeBusinessCodeTemplateSettings(source.settings, baseTemplate?.key)
      : businessCodeTemplateSettingsFromLegacy(
          baseTemplateKey as BusinessCodeSystemTemplateKey,
          example,
        );
  } catch {
    return null;
  }
  return {
    key,
    name,
    example,
    settings,
  };
}

function normalizeBusinessCodeManagement(
  value: unknown,
  fallback: BusinessCodeManagementConfig,
): BusinessCodeManagementConfig {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const templates = Array.isArray(source.templates)
    ? source.templates.map(customTemplate).filter((item): item is BusinessCodeCustomTemplate => item !== null)
    : fallback.templates;
  const uniqueTemplates = [...new Map(templates.map((template) => [template.key, template])).values()];
  const assignmentSource = source.templateByObject && typeof source.templateByObject === "object"
    ? source.templateByObject as Record<string, unknown>
    : {};
  const templateKeys = new Set<string>([
    ...BUSINESS_CODE_SYSTEM_TEMPLATES.map((template) => template.key),
    ...uniqueTemplates.map((template) => template.key),
  ]);
  const templateByObject = Object.fromEntries(BUSINESS_CODE_OBJECTS.map((definition) => {
    const candidate = text(assignmentSource[definition.key], fallback.templateByObject[definition.key], 64);
    return [
      definition.key,
      templateKeys.has(candidate) ? candidate : definition.defaultTemplateKey,
    ];
  })) as Record<BusinessCodeObjectKey, string>;
  return { templates: uniqueTemplates, templateByObject };
}

export function normalizeBusinessCodeConfig(
  value: unknown,
  fallback: BusinessCodeConfig,
): BusinessCodeConfig {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const department = source.department && typeof source.department === "object"
    ? source.department as Record<string, unknown>
    : {};
  const project = source.project && typeof source.project === "object"
    ? source.project as Record<string, unknown>
    : {};
  const companySequenceStart = integer(
    project.companySequenceStart,
    fallback.project.companySequenceStart,
    1,
    999_999_999,
  );
  const identifierFormat = DEPARTMENT_IDENTIFIER_FORMATS.includes(
    department.identifierFormat as DepartmentIdentifierFormat,
  )
    ? department.identifierFormat as DepartmentIdentifierFormat
    : fallback.department.identifierFormat;
  const companySequenceEnd = integer(
    project.companySequenceEnd,
    fallback.project.companySequenceEnd,
    companySequenceStart,
    999_999_999,
  );

  return {
    management: normalizeBusinessCodeManagement(source.management, fallback.management),
    employee: composedRule(source.employee, fallback.employee, {
      allowedSources: ["createdAt"],
      legacy: "sequential",
    }),
    department: {
      identifierFormat,
      identifierLength: integer(
        department.identifierLength,
        fallback.department.identifierLength,
        1,
        12,
      ),
      functionalPrefix: text(
        department.functionalPrefix,
        fallback.department.functionalPrefix,
      ),
      separator: text(
        department.separator,
        fallback.department.separator,
        3,
      ),
      managementRootSuffix: text(
        department.managementRootSuffix,
        fallback.department.managementRootSuffix,
        12,
      ).toUpperCase(),
      level2Suffix: text(
        department.level2Suffix,
        fallback.department.level2Suffix,
        12,
      ).toUpperCase(),
      level2SequenceLength: integer(
        department.level2SequenceLength,
        fallback.department.level2SequenceLength,
        1,
        6,
      ),
      level3SequenceLength: integer(
        department.level3SequenceLength,
        fallback.department.level3SequenceLength,
        1,
        6,
      ),
    },
    position: sequentialRule(source.position, fallback.position),
    customer: composedRule(source.customer, fallback.customer, {
      allowedSources: ["createdAt"],
      legacy: "sequential",
    }),
    supplier: composedRule(source.supplier, fallback.supplier, {
      allowedSources: ["createdAt"],
      legacy: "sequential",
    }),
    project: {
      companyPrefix: text(project.companyPrefix, fallback.project.companyPrefix).toUpperCase(),
      separator: text(project.separator, fallback.project.separator, 3),
      yearDigits: project.yearDigits === 4 ? 4 : 2,
      companySequenceLength: integer(
        project.companySequenceLength,
        fallback.project.companySequenceLength,
        1,
        12,
      ),
      companySequenceStart,
      companySequenceEnd,
      departmentSequenceLength: integer(
        project.departmentSequenceLength,
        fallback.project.departmentSequenceLength,
        1,
        12,
      ),
      departmentSequenceStart: integer(
        project.departmentSequenceStart,
        fallback.project.departmentSequenceStart,
        1,
        999_999_999,
      ),
      otherSequenceLength: integer(
        project.otherSequenceLength,
        fallback.project.otherSequenceLength,
        1,
        12,
      ),
      otherSequenceStart: integer(
        project.otherSequenceStart,
        fallback.project.otherSequenceStart,
        1,
        999_999_999,
      ),
    },
    financeAsset: composedRule(source.financeAsset, fallback.financeAsset, {
      allowedSources: ["companyCode", "assetCategoryCode", "fiscalYear"],
      legacy: "financeAsset",
    }),
  };
}

export function formatSequentialBusinessCode(
  rule: ComposableBusinessCodeRule,
  sequence: number,
  createdAt: Date = new Date(),
) {
  return renderBusinessCode(rule, { values: { createdAt }, sequence });
}

export function formatProjectBusinessCode(input: {
  prefix: string;
  year: number;
  sequence: number;
  separator: string;
  yearDigits: 2 | 4;
  sequenceLength: number;
}) {
  const year = input.yearDigits === 4
    ? String(input.year)
    : String(input.year % 100).padStart(2, "0");
  return [
    input.prefix,
    year,
    String(input.sequence).padStart(input.sequenceLength, "0"),
  ].join(input.separator);
}

export function formatFinanceAssetCode(input: {
  companyCode: string;
  categoryCode: string;
  year: number;
  sequence: number;
  rule: BusinessCodeConfig["financeAsset"];
}) {
  return renderBusinessCode(input.rule, {
    values: {
      companyCode: input.companyCode,
      assetCategoryCode: input.categoryCode,
      fiscalYear: input.year,
    },
    sequence: input.sequence,
  });
}
