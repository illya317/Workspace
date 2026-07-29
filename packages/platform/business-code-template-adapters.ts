import type { BusinessCodeConfig, DepartmentIdentifierFormat } from "./business-code-config";
import {
  BUSINESS_CODE_OBJECTS,
  businessCodeObjectDefinition,
  type BusinessCodeObjectKey,
  type BusinessCodeTemplateRule,
  type BusinessCodeTemplateSegment,
  type BusinessCodeTemplateSettings,
} from "./business-code-registry";
import { parseBusinessCodeTemplateSettings } from "./business-code-template";
import type { BusinessCodeSegment, ComposableBusinessCodeRule } from "./business-code-rule";

function onlyRule(settings: BusinessCodeTemplateSettings, label: string) {
  const parsed = parseBusinessCodeTemplateSettings(settings);
  if (parsed.rules.length !== 1 || parsed.rules[0]?.conditions.length) throw new Error(`${label}必须只有一条无条件规则`);
  return parsed.rules[0];
}

function sameMembers(actual: readonly string[], expected: readonly string[]) {
  return actual.length === expected.length && expected.every((value) => actual.includes(value));
}

function runtimeRule(rule: BusinessCodeTemplateRule, allowedFields: readonly string[], label: string): ComposableBusinessCodeRule {
  const fields = new Set(allowedFields);
  const segments = rule.segments.map((segment): BusinessCodeSegment => {
    if (segment.kind === "literal" || segment.kind === "sequence") return segment;
    if (!fields.has(segment.field)) throw new Error(`${label}不能使用字段 ${segment.field}`);
    if (segment.kind === "field") {
      if (segment.transform && segment.transform.kind !== "none") throw new Error(`${label}不支持字段转换`);
      return { kind: "reference", source: segment.field };
    }
    return { kind: segment.kind, source: segment.field, format: segment.format };
  });
  if (segments.filter((segment) => segment.kind === "sequence").length !== 1 || !rule.sequence) {
    throw new Error(`${label}必须包含一个流水号`);
  }
  if (!rule.sequence.scope.every((field) => fields.has(field))) throw new Error(`${label}流水作用域包含不可用字段`);
  return { segments, sequenceStart: rule.sequence.start, sequenceScope: [...rule.sequence.scope] };
}

function mergedSegments(segments: readonly BusinessCodeTemplateSegment[]) {
  return segments.reduce<BusinessCodeTemplateSegment[]>((result, segment) => {
    const previous = result.at(-1);
    if (previous?.kind === "literal" && segment.kind === "literal") {
      previous.value += segment.value;
    } else {
      result.push(JSON.parse(JSON.stringify(segment)) as BusinessCodeTemplateSegment);
    }
    return result;
  }, []);
}

function compilePosition(settings: BusinessCodeTemplateSettings) {
  const rule = onlyRule(settings, "岗位模板");
  const segments = mergedSegments(rule.segments);
  if (segments.length < 2 || segments.length > 4 || !rule.sequence) throw new Error("岗位模板结构无效");
  const sequence = segments.at(-1);
  if (sequence?.kind !== "sequence") throw new Error("岗位模板必须以流水号结尾");
  const departmentIndex = segments.findIndex((segment) => segment.kind === "field" && segment.field === "departmentCode");
  if (departmentIndex < 0) throw new Error("岗位模板缺少直属组织编码");
  if (!sameMembers(rule.sequence.scope, ["departmentCode"])) throw new Error("岗位流水作用域必须是直属组织编码");
  const before = segments.slice(0, departmentIndex).map((segment) => segment.kind === "literal" ? segment.value : "").join("");
  const after = segments.slice(departmentIndex + 1, -1).map((segment) => segment.kind === "literal" ? segment.value : "").join("");
  if (segments.slice(0, departmentIndex).some((segment) => segment.kind !== "literal")
    || segments.slice(departmentIndex + 1, -1).some((segment) => segment.kind !== "literal")) {
    throw new Error("岗位模板只能在直属组织编码两侧使用固定文本");
  }
  const separator = after;
  if (separator.length > 3 || (separator && !before.endsWith(separator))) throw new Error("岗位模板连接方式无效");
  return {
    prefix: separator ? before.slice(0, -separator.length) : before,
    separator,
    sequenceLength: sequence.length,
    sequenceStart: rule.sequence.start,
  };
}

function conditionValue(rule: BusinessCodeTemplateRule, field: string) {
  return rule.conditions.find((condition) => condition.field === field)?.value;
}

function organizationRule(settings: BusinessCodeTemplateSettings, hierarchyKind: "G" | "M", level?: string) {
  const matches = parseBusinessCodeTemplateSettings(settings).rules.filter((rule) => (
    conditionValue(rule, "hierarchyKind") === hierarchyKind
    && (level === undefined || conditionValue(rule, "organizationLevel") === level)
  ));
  if (matches.length !== 1) throw new Error("组织模板缺少或重复定义层级规则");
  return matches[0]!;
}

function identifierTransform(rule: BusinessCodeTemplateRule) {
  const segment = rule.segments.find((item) => item.kind === "field" && item.field === "organizationIdentifier");
  if (segment?.kind !== "field" || !segment.transform || segment.transform.kind === "none"
    || segment.transform.kind === "integer" || segment.transform.kind === "padInteger") {
    throw new Error("组织模板必须配置组织简称格式和位数");
  }
  const identifierFormat: DepartmentIdentifierFormat = segment.transform.kind === "compactText"
    ? "freeText"
    : segment.transform.kind;
  return { identifierFormat, identifierLength: segment.transform.length };
}

function compileOrganization(settings: BusinessCodeTemplateSettings, current: BusinessCodeConfig["department"]) {
  const functional = organizationRule(settings, "G");
  const level1 = organizationRule(settings, "M", "1");
  const level2 = organizationRule(settings, "M", "2");
  const level3 = organizationRule(settings, "M", "3");
  if (functional.segments.length !== 1) throw new Error("职能组织规则只能包含组织简称");
  const identifier = identifierTransform(level1);
  const functionalIdentifier = identifierTransform(functional);
  if (identifier.identifierFormat !== functionalIdentifier.identifierFormat
    || identifier.identifierLength !== functionalIdentifier.identifierLength) {
    throw new Error("职能组织和管理组织的简称格式必须一致");
  }
  const m1 = mergedSegments(level1.segments);
  if (m1.length !== 2 || m1[0]?.kind !== "field" || m1[0].field !== "organizationIdentifier" || m1[1]?.kind !== "literal") {
    throw new Error("一级管理组织规则结构无效");
  }
  const rootMatch = m1[1].value.match(/^(.*?)(\d+)$/);
  if (!rootMatch || rootMatch[1].length > 3) throw new Error("一级管理组织规则缺少数字根后缀");
  const separator = rootMatch[1];
  const m2 = mergedSegments(level2.segments);
  const m2Local = m2[2];
  if (m2.length !== 4
    || m2[0]?.kind !== "field" || m2[0].field !== "rootOrganizationIdentifier"
    || m2[1]?.kind !== "literal" || m2[1].value !== separator
    || m2Local?.kind !== "field" || m2Local.field !== "localSequence" || m2Local.transform?.kind !== "integer"
    || m2[3]?.kind !== "literal" || !/^\d+$/.test(m2[3].value)) {
    throw new Error("二级管理组织规则结构无效");
  }
  const m3 = mergedSegments(level3.segments);
  const m3Local = m3[3];
  if (m3.length !== 4
    || m3[0]?.kind !== "field" || m3[0].field !== "rootOrganizationIdentifier"
    || m3[1]?.kind !== "literal" || m3[1].value !== separator
    || m3[2]?.kind !== "field" || m3[2].field !== "parentOrganizationSequenceStem"
    || m3Local?.kind !== "field" || m3Local.field !== "localSequence" || m3Local.transform?.kind !== "padInteger") {
    throw new Error("三级管理组织规则结构无效");
  }
  return {
    ...current,
    ...identifier,
    separator,
    managementRootSuffix: rootMatch[2],
    level2Suffix: m2[3].value,
    level2SequenceLength: m2Local.transform.length,
    level3SequenceLength: m3Local.transform.length,
  };
}

function projectRule(settings: BusinessCodeTemplateSettings, projectType: "company" | "department" | "other") {
  const matches = parseBusinessCodeTemplateSettings(settings).rules.filter((rule) => conditionValue(rule, "projectType") === projectType);
  if (matches.length !== 1) throw new Error("项目模板缺少或重复定义项目类型规则");
  return matches[0]!;
}

function compileProjectBranch(rule: BusinessCodeTemplateRule, department: boolean) {
  const segments = mergedSegments(rule.segments);
  const sequence = segments.at(-1);
  if (sequence?.kind !== "sequence" || !rule.sequence || segments.length !== (department ? 5 : 4)) throw new Error("项目规则结构无效");
  const first = segments[0];
  const separatorBeforeYear = department ? segments[1] : first;
  const date = department ? segments[2] : segments[1];
  const separatorBeforeSequence = department ? segments[3] : segments[2];
  if (separatorBeforeYear?.kind !== "literal" || separatorBeforeSequence?.kind !== "literal"
    || date?.kind !== "date" || date.field !== "createdAt" || (date.format !== "YY" && date.format !== "YYYY")) {
    throw new Error("项目规则连接符或年度格式无效");
  }
  const separator = separatorBeforeSequence.value;
  if (separator.length > 3) throw new Error("项目规则连接符无效");
  if (department) {
    if (first?.kind !== "field" || first.field !== "departmentCode" || separatorBeforeYear.value !== separator
      || !sameMembers(rule.sequence.scope, ["departmentCode", "createdAt"])) {
      throw new Error("部门项目必须使用直属组织编码，并按组织和年度隔离流水");
    }
  } else if (first?.kind !== "literal" || !first.value.endsWith(separator)
    || !sameMembers(rule.sequence.scope, ["createdAt"])) {
    throw new Error("公司和其他项目必须使用固定文本，并按年度隔离流水");
  }
  return {
    prefix: first?.kind === "literal" ? (separator ? first.value.slice(0, -separator.length) : first.value) : "",
    separator,
    yearDigits: date.format === "YYYY" ? 4 as const : 2 as const,
    sequenceLength: sequence.length,
    sequenceStart: rule.sequence.start,
    sequenceEnd: rule.sequence.end ?? (10 ** sequence.length) - 1,
  };
}

function compileProject(settings: BusinessCodeTemplateSettings) {
  const company = compileProjectBranch(projectRule(settings, "company"), false);
  const department = compileProjectBranch(projectRule(settings, "department"), true);
  const other = compileProjectBranch(projectRule(settings, "other"), false);
  if (company.prefix !== other.prefix || company.separator !== department.separator || company.separator !== other.separator
    || company.yearDigits !== department.yearDigits || company.yearDigits !== other.yearDigits) {
    throw new Error("三类项目必须使用相同固定文本、连接符和年度格式");
  }
  return {
    companyPrefix: company.prefix,
    separator: company.separator,
    yearDigits: company.yearDigits,
    companySequenceLength: company.sequenceLength,
    companySequenceStart: company.sequenceStart,
    companySequenceEnd: company.sequenceEnd,
    departmentSequenceLength: department.sequenceLength,
    departmentSequenceStart: department.sequenceStart,
    otherSequenceLength: other.sequenceLength,
    otherSequenceStart: other.sequenceStart,
  };
}

function compileFinanceAsset(settings: BusinessCodeTemplateSettings) {
  const compiled = runtimeRule(
    onlyRule(settings, "财务资产模板"),
    ["companyCode", "assetCategoryCode", "fiscalYear"],
    "财务资产模板",
  );
  const sequence = compiled.segments.find((segment) => segment.kind === "sequence");
  if (sequence?.kind !== "sequence" || sequence.length !== 5) throw new Error("财务资产流水固定为 5 位");
  if (!sameMembers(compiled.sequenceScope ?? [], ["companyCode", "assetCategoryCode", "fiscalYear"])) {
    throw new Error("财务资产流水作用域必须是公司、资产分类和账期年度");
  }
  const required = new Set(compiled.segments.flatMap((segment) => (
    segment.kind === "reference" || segment.kind === "date" || segment.kind === "datetime" ? [segment.source] : []
  )));
  if (!sameMembers([...required], ["companyCode", "assetCategoryCode", "fiscalYear"])) {
    throw new Error("财务资产模板必须包含公司、资产分类和账期年度");
  }
  return compiled;
}

export function applyBusinessCodeTemplateSettings(
  config: BusinessCodeConfig,
  key: BusinessCodeObjectKey,
  settings: BusinessCodeTemplateSettings,
) {
  const adapter = businessCodeObjectDefinition(key).adapter;
  if (adapter === "sequential") {
    const rule = runtimeRule(onlyRule(settings, "流水模板"), ["createdAt"], "流水模板");
    if (key === "hr.employee") return { ...config, employee: rule };
    if (key === "external.customer") return { ...config, customer: rule };
    if (key === "external.supplier") return { ...config, supplier: rule };
  }
  if (adapter === "organization" && key === "hr.organization") return { ...config, department: compileOrganization(settings, config.department) };
  if (adapter === "position" && key === "hr.position") return { ...config, position: compilePosition(settings) };
  if (adapter === "project" && key === "work.project") return { ...config, project: compileProject(settings) };
  if (adapter === "financeAsset" && key === "finance.asset") return { ...config, financeAsset: compileFinanceAsset(settings) };
  throw new Error("模板规则无法应用到该编码对象");
}

export function businessCodeTemplateCompatibleObjectKeys(config: BusinessCodeConfig, settings: BusinessCodeTemplateSettings) {
  return BUSINESS_CODE_OBJECTS.flatMap((definition) => {
    try {
      applyBusinessCodeTemplateSettings(config, definition.key, settings);
      return [definition.key];
    } catch {
      return [];
    }
  });
}
