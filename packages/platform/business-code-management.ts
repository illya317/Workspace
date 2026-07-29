import {
  defaultFinanceAssetCodeRule,
  formatProjectBusinessCode,
  type BusinessCodeConfig,
} from "./business-code-config";
import {
  BUSINESS_CODE_OBJECTS,
  BUSINESS_CODE_SYSTEM_TEMPLATES,
  businessCodeObjectDefinition,
  type BusinessCodeCustomTemplate,
  type BusinessCodeObjectKey,
  type BusinessCodeSystemTemplateKey,
  type BusinessCodeTemplateFamily,
  type BusinessCodeTemplateSettings,
} from "./business-code-registry";
import {
  businessCodeTemplateExample,
  defaultBusinessCodeTemplateSettings,
  parseBusinessCodeTemplateSettings,
} from "./business-code-template";
import {
  formatBusinessCodeDate,
  renderBusinessCode,
  type BusinessCodeSegment,
  type BusinessCodeTemporalKind,
  type ComposableBusinessCodeRule,
} from "./business-code-rule";

const PREVIEW_DATE = {
  year: 2026,
  month: 7,
  day: 29,
  hour: 15,
  minute: 8,
  second: 6,
};
const SEPARATOR_PATTERN = /^[-_/.:]$/;

export type BusinessCodeTemplateOption = {
  value: string;
  label: string;
};

export type CreateBusinessCodeTemplateInput = {
  name: string;
  baseTemplateKey: BusinessCodeSystemTemplateKey;
  settings: BusinessCodeTemplateSettings;
};

export type UpdateBusinessCodeTemplateInput = CreateBusinessCodeTemplateInput & { key: string };

function identifierExample(config: BusinessCodeConfig) {
  const { identifierFormat, identifierLength } = config.department;
  const source = identifierFormat === "uppercaseLetters"
    ? "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    : identifierFormat === "uppercaseAlphanumeric"
      ? "A1B2C3D4E5F6"
      : "组织编码示例";
  const characters = Array.from(source);
  return Array.from({ length: identifierLength }, (_, index) => (
    characters[index % characters.length]
  )).join("");
}

function departmentExamples(config: BusinessCodeConfig) {
  const rule = config.department;
  const identifier = identifierExample(config);
  return [
    `${identifier}${rule.separator}${rule.managementRootSuffix}`,
    `${identifier}${rule.separator}1${rule.level2Suffix}`,
    `${identifier}${rule.separator}1${String(1).padStart(rule.level3SequenceLength, "0")}`,
  ];
}

export function businessCodeObjectExample(config: BusinessCodeConfig, key: BusinessCodeObjectKey) {
  if (key === "hr.employee") {
    return renderBusinessCode(config.employee, { values: { createdAt: PREVIEW_DATE }, sequence: config.employee.sequenceStart });
  }
  if (key === "hr.organization") return departmentExamples(config)[0];
  if (key === "hr.position") {
    return [
      config.position.prefix,
      departmentExamples(config)[2],
      String(config.position.sequenceStart).padStart(config.position.sequenceLength, "0"),
    ].filter(Boolean).join(config.position.separator);
  }
  if (key === "external.customer" || key === "external.supplier") {
    const rule = key === "external.customer" ? config.customer : config.supplier;
    return renderBusinessCode(rule, { values: { createdAt: PREVIEW_DATE }, sequence: rule.sequenceStart });
  }
  if (key === "work.project") {
    return formatProjectBusinessCode({
      prefix: config.project.companyPrefix,
      year: PREVIEW_DATE.year,
      sequence: config.project.companySequenceStart,
      separator: config.project.separator,
      yearDigits: config.project.yearDigits,
      sequenceLength: config.project.companySequenceLength,
    });
  }
  return renderBusinessCode(config.financeAsset, {
    values: { companyCode: "02", assetCategoryCode: "FA-ELECTRONIC", fiscalYear: PREVIEW_DATE.year },
    sequence: config.financeAsset.sequenceStart,
  });
}

function selectedTemplate(config: BusinessCodeConfig, key: BusinessCodeObjectKey) {
  return config.management.templateByObject[key]
    ?? businessCodeObjectDefinition(key).defaultTemplateKey;
}

function customTemplate(config: BusinessCodeConfig, key: string) {
  return config.management.templates.find((template) => template.key === key);
}

function baseTemplateKey(config: BusinessCodeConfig, templateKey: string): BusinessCodeSystemTemplateKey {
  const system = BUSINESS_CODE_SYSTEM_TEMPLATES.find((template) => template.key === templateKey);
  if (system) return system.key;
  const custom = customTemplate(config, templateKey);
  if (!custom) throw new Error("所选编码模板不存在");
  return custom.baseTemplateKey;
}

function templateFamily(config: BusinessCodeConfig, templateKey: string): BusinessCodeTemplateFamily {
  const system = BUSINESS_CODE_SYSTEM_TEMPLATES.find((template) => template.key === templateKey);
  const custom = customTemplate(config, templateKey);
  const family = system?.family ?? custom?.family;
  if (!family) throw new Error("所选编码模板不存在");
  return family;
}

export function businessCodeTemplateOptions(
  config: BusinessCodeConfig,
  key: BusinessCodeObjectKey,
): BusinessCodeTemplateOption[] {
  const family = businessCodeObjectDefinition(key).family;
  return [
    ...BUSINESS_CODE_SYSTEM_TEMPLATES
      .filter((template) => template.family === family)
      .map((template) => ({ value: template.key, label: template.label })),
    ...config.management.templates
      .filter((template) => template.family === family)
      .map((template) => ({ value: template.key, label: template.name })),
  ];
}

export function selectBusinessCodeTemplate(
  config: BusinessCodeConfig,
  key: BusinessCodeObjectKey,
  templateKey: string,
) {
  const definition = businessCodeObjectDefinition(key);
  if (templateFamily(config, templateKey) !== definition.family) {
    throw new Error("该模板不适用于此编码对象");
  }
  const custom = customTemplate(config, templateKey);
  const system = BUSINESS_CODE_SYSTEM_TEMPLATES.find((template) => template.key === templateKey);
  const settings = custom?.settings ?? (system ? defaultBusinessCodeTemplateSettings(system.key) : null);
  if (!settings) throw new Error("所选编码模板不存在");
  const applied = applyBusinessCodeTemplateSettings(config, key, settings);
  return {
    ...applied,
    management: {
      ...applied.management,
      templateByObject: { ...applied.management.templateByObject, [key]: templateKey },
    },
  };
}

export function applyBusinessCodeTemplateSettings(
  config: BusinessCodeConfig,
  key: BusinessCodeObjectKey,
  settings: BusinessCodeTemplateSettings,
) {
  const definition = businessCodeObjectDefinition(key);
  const parsed = parseBusinessCodeTemplateSettings(settings, definition.family);
  if (parsed.kind === "sequential") {
    if (key === "hr.employee") return { ...config, employee: parsed.rule };
    if (key === "external.customer") return { ...config, customer: parsed.rule };
    if (key === "external.supplier") return { ...config, supplier: parsed.rule };
  }
  if (parsed.kind === "organization" && key === "hr.organization") {
    return { ...config, department: { ...parsed.rule } };
  }
  if (parsed.kind === "position" && key === "hr.position") {
    return { ...config, position: { ...parsed.rule } };
  }
  if (parsed.kind === "project" && key === "work.project") {
    return { ...config, project: { ...parsed.rule } };
  }
  if (parsed.kind === "financeAsset" && key === "finance.asset") {
    return { ...config, financeAsset: parsed.rule };
  }
  throw new Error("模板规则无法应用到该编码对象");
}

type SequenceExample = {
  prefix: string;
  separator: string;
  sequenceLength: number;
  sequenceStart: number;
};

function parseSequenceExample(example: string): SequenceExample {
  const source = example.trim();
  const match = source.match(/^(.*?)(\d+)$/);
  if (!match) throw new Error("完整样例必须以流水数字结尾");
  const sequenceLength = match[2].length;
  const sequenceStart = Number(match[2]);
  if (sequenceLength < 1 || sequenceLength > 12 || sequenceStart < 1) {
    throw new Error("流水必须为 1 至 12 位且起始值大于 0");
  }
  const separatorCandidate = match[1].slice(-1);
  const separator = SEPARATOR_PATTERN.test(separatorCandidate) ? separatorCandidate : "";
  return {
    prefix: separator ? match[1].slice(0, -1) : match[1],
    separator,
    sequenceLength,
    sequenceStart,
  };
}

function literalSegments(value: string): BusinessCodeSegment[] {
  return value ? [{ kind: "literal", value }] : [];
}

function sequentialRule(example: string, templateKey: BusinessCodeSystemTemplateKey): ComposableBusinessCodeRule {
  const sequence = parseSequenceExample(example);
  if (templateKey === "system.sequential") {
    return {
      segments: [
        ...literalSegments(sequence.prefix),
        ...literalSegments(sequence.separator),
        { kind: "sequence", length: sequence.sequenceLength },
      ],
      sequenceStart: sequence.sequenceStart,
    };
  }
  if (!sequence.separator) throw new Error("日期或时间模板需要连接符");
  const dateBoundary = sequence.prefix.lastIndexOf(sequence.separator);
  const temporalValue = dateBoundary >= 0 ? sequence.prefix.slice(dateBoundary + 1) : sequence.prefix;
  const fixedPrefix = dateBoundary >= 0 ? sequence.prefix.slice(0, dateBoundary) : "";
  const kind: BusinessCodeTemporalKind = templateKey === "system.datetimeSequence" ? "datetime" : "date";
  const format = inferTemporalFormat(temporalValue, kind, templateKey === "system.yearSequence");
  return {
    segments: [
      ...literalSegments(fixedPrefix),
      ...literalSegments(fixedPrefix ? sequence.separator : ""),
      { kind, source: "createdAt", format },
      { kind: "literal", value: sequence.separator },
      { kind: "sequence", length: sequence.sequenceLength },
    ],
    sequenceStart: sequence.sequenceStart,
  };
}

function inferTemporalFormat(value: string, kind: BusinessCodeTemporalKind, yearOnly: boolean) {
  const candidates = yearOnly
    ? ["YYYY", "YY"]
    : kind === "datetime"
      ? ["YYYYMMDDHHmmss", "YYMMDDHHmmss", "YYYY-MM-DD-HH-mm-ss", "YY-MM-DD-HH-mm-ss"]
      : ["YYYYMMDD", "YYMMDD", "YYYYMM", "YYMM", "YYYYMMM", "YYMMM", "YYYY-MM-DD", "YY-MM-DD", "YYYY-MM", "YY-MM"];
  const match = candidates.find((format) => formatBusinessCodeDate(PREVIEW_DATE, format, kind) === value);
  if (!match) throw new Error("样例中的日期或时间无法识别，请使用当前预览日期 2026-07-29 15:08:06");
  return match;
}

function parseOrganizationExample(config: BusinessCodeConfig, example: string): BusinessCodeConfig {
  const match = example.trim().match(/^(.*?)([-_/.:]?)(\d+)$/);
  if (!match || !match[1] || match[1].length > 12) {
    throw new Error("组织样例应为组织简称、可选连接符和层级数字，例如 FUN-001");
  }
  const identifier = match[1];
  const identifierFormat = /^[A-Z]+$/.test(identifier)
    ? "uppercaseLetters"
    : /^[A-Z0-9]+$/.test(identifier)
      ? "uppercaseAlphanumeric"
      : "freeText";
  return {
    ...config,
    department: {
      ...config.department,
      identifierFormat,
      identifierLength: identifier.length,
      separator: match[2],
      managementRootSuffix: match[3],
    },
  };
}

function parsePositionExample(config: BusinessCodeConfig, example: string): BusinessCodeConfig {
  const sequence = parseSequenceExample(example);
  if (!sequence.separator) throw new Error("岗位样例需要使用连接符分隔岗位标识、组织编码和流水");
  const parts = sequence.prefix.split(sequence.separator);
  if (parts.length < 2 || !parts[0]) throw new Error("岗位样例缺少岗位标识或组织编码");
  return {
    ...config,
    position: {
      prefix: parts[0],
      separator: sequence.separator,
      sequenceLength: sequence.sequenceLength,
      sequenceStart: sequence.sequenceStart,
    },
  };
}

function parseProjectExample(config: BusinessCodeConfig, example: string): BusinessCodeConfig {
  const sequence = parseSequenceExample(example);
  if (!sequence.separator) throw new Error("项目样例需要使用连接符分隔项目标识、年度和流水");
  const boundary = sequence.prefix.lastIndexOf(sequence.separator);
  if (boundary < 1) throw new Error("项目样例缺少项目标识或年度");
  const prefix = sequence.prefix.slice(0, boundary);
  const year = sequence.prefix.slice(boundary + 1);
  if (!/^\d{2}(?:\d{2})?$/.test(year)) throw new Error("项目年度必须为 2 位或 4 位数字");
  const maximum = (10 ** sequence.sequenceLength) - 1;
  return {
    ...config,
    project: {
      ...config.project,
      companyPrefix: prefix,
      separator: sequence.separator,
      yearDigits: year.length === 4 ? 4 : 2,
      companySequenceLength: sequence.sequenceLength,
      companySequenceStart: sequence.sequenceStart,
      companySequenceEnd: maximum,
      departmentSequenceLength: sequence.sequenceLength,
      departmentSequenceStart: sequence.sequenceStart,
      otherSequenceLength: sequence.sequenceLength,
      otherSequenceStart: sequence.sequenceStart,
    },
  };
}

function parseFinanceAssetExample(config: BusinessCodeConfig, example: string): BusinessCodeConfig {
  const sequence = parseSequenceExample(example);
  if (sequence.sequenceLength !== 5) throw new Error("财务资产流水固定为 5 位");
  if (!sequence.separator) throw new Error("财务资产样例需要连接符");
  const parts = sequence.prefix.split(sequence.separator);
  if (parts.length < 3) throw new Error("财务资产样例必须包含公司、资产分类和年度");
  const year = parts.at(-1) ?? "";
  if (!/^\d{2}(?:\d{2})?$/.test(year)) throw new Error("财务资产年度必须为 2 位或 4 位数字");
  const baseline = defaultFinanceAssetCodeRule();
  return {
    ...config,
    financeAsset: {
      segments: baseline.segments.flatMap<BusinessCodeSegment>((segment) => {
        if (segment.kind === "literal") return [{ ...segment, value: sequence.separator }];
        if (segment.kind === "date") return [{ ...segment, format: year.length === 4 ? "YYYY" : "YY" }];
        return [segment];
      }),
      sequenceStart: sequence.sequenceStart,
    },
  };
}

function parseExampleForFamily(
  config: BusinessCodeConfig,
  key: BusinessCodeObjectKey,
  example: string,
  templateKey: BusinessCodeSystemTemplateKey,
) {
  const family = businessCodeObjectDefinition(key).family;
  if (family === "sequential") {
    const rule = sequentialRule(example, templateKey);
    if (key === "hr.employee") return { ...config, employee: rule };
    if (key === "external.customer") return { ...config, customer: rule };
    if (key === "external.supplier") return { ...config, supplier: rule };
  }
  if (family === "organization") return parseOrganizationExample(config, example);
  if (family === "position") return parsePositionExample(config, example);
  if (family === "project") return parseProjectExample(config, example);
  if (family === "financeAsset") return parseFinanceAssetExample(config, example);
  throw new Error("该编码对象暂不支持样例解析");
}

export function applyBusinessCodeObjectExample(
  config: BusinessCodeConfig,
  key: BusinessCodeObjectKey,
  example: string,
) {
  const templateKey = baseTemplateKey(config, selectedTemplate(config, key));
  return parseExampleForFamily(config, key, example, templateKey);
}

export function businessCodeObjectExampleError(
  config: BusinessCodeConfig,
  key: BusinessCodeObjectKey,
  example: string,
) {
  try {
    applyBusinessCodeObjectExample(config, key, example);
    return undefined;
  } catch (error) {
    return error instanceof Error ? error.message : "完整样例无法解析";
  }
}

function slug(value: string) {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return normalized || "template";
}

export function createBusinessCodeTemplate(
  config: BusinessCodeConfig,
  input: CreateBusinessCodeTemplateInput,
) {
  const name = input.name.trim();
  if (!name) throw new Error("模板名称不能为空");
  const base = BUSINESS_CODE_SYSTEM_TEMPLATES.find((template) => template.key === input.baseTemplateKey);
  if (!base) throw new Error("基础模板不存在");
  const settings = parseBusinessCodeTemplateSettings(input.settings, base.family);
  const example = businessCodeTemplateExample(settings);
  const baseSlug = slug(name);
  let key = `custom.${baseSlug}`;
  let suffix = 2;
  const used = new Set(config.management.templates.map((template) => template.key));
  while (used.has(key)) {
    key = `custom.${baseSlug}-${suffix}`;
    suffix += 1;
  }
  const template: BusinessCodeCustomTemplate = {
    key,
    name,
    family: base.family,
    baseTemplateKey: base.key,
    example,
    settings,
  };
  return {
    ...config,
    management: {
      ...config.management,
      templates: [...config.management.templates, template],
    },
  };
}

export function updateBusinessCodeTemplate(
  config: BusinessCodeConfig,
  input: UpdateBusinessCodeTemplateInput,
) {
  const existing = customTemplate(config, input.key);
  if (!existing) throw new Error("自定义模板不存在");
  const name = input.name.trim();
  if (!name) throw new Error("模板名称不能为空");
  if (input.baseTemplateKey !== existing.baseTemplateKey) {
    throw new Error("已创建模板不能修改基础结构");
  }
  const settings = parseBusinessCodeTemplateSettings(input.settings, existing.family);
  const template: BusinessCodeCustomTemplate = {
    ...existing,
    name,
    settings,
    example: businessCodeTemplateExample(settings),
  };
  let updated: BusinessCodeConfig = {
    ...config,
    management: {
      ...config.management,
      templates: config.management.templates.map((item) => item.key === input.key ? template : item),
    },
  };
  for (const definition of BUSINESS_CODE_OBJECTS) {
    if (updated.management.templateByObject[definition.key] === input.key) {
      updated = applyBusinessCodeTemplateSettings(updated, definition.key, settings);
    }
  }
  return updated;
}

export function deleteBusinessCodeTemplate(config: BusinessCodeConfig, key: string) {
  const template = customTemplate(config, key);
  if (!template) throw new Error("自定义模板不存在");
  const usedBy = BUSINESS_CODE_OBJECTS.filter(
    (definition) => config.management.templateByObject[definition.key] === key,
  );
  if (usedBy.length > 0) {
    throw new Error(`请先更换使用该模板的编码：${usedBy.map((item) => item.label).join("、")}`);
  }
  return {
    ...config,
    management: {
      ...config.management,
      templates: config.management.templates.filter((item) => item.key !== key),
    },
  };
}

export function selectedBusinessCodeTemplateKey(config: BusinessCodeConfig, key: BusinessCodeObjectKey) {
  return selectedTemplate(config, key);
}
