import {
  BUSINESS_CODE_FIELDS,
  BUSINESS_CODE_SYSTEM_TEMPLATES,
  businessCodeFieldDefinition,
  businessCodeSystemTemplate,
  type BusinessCodeFieldTransform,
  type BusinessCodeSystemTemplateKey,
  type BusinessCodeTemplateRule,
  type BusinessCodeTemplateSegment,
  type BusinessCodeTemplateSettings,
} from "./business-code-registry";
import {
  formatBusinessCodeDate,
  parseBusinessCodeDateFormat,
  type BusinessCodeSegment,
  type BusinessCodeTemporalKind,
} from "./business-code-rule";

const FIELD_KEYS = new Set(BUSINESS_CODE_FIELDS.map((field) => field.key));

function object(value: unknown, label: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label}无效`);
  return value as Record<string, unknown>;
}

function text(value: unknown, max: number, label: string) {
  const parsed = typeof value === "string" ? value.trim() : "";
  if (!parsed || parsed.length > max) throw new Error(`${label}无效`);
  return parsed;
}

function integer(value: unknown, min: number, max: number, label: string) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) throw new Error(`${label}无效`);
  return parsed;
}

function cloneSettings(settings: BusinessCodeTemplateSettings): BusinessCodeTemplateSettings {
  return JSON.parse(JSON.stringify(settings)) as BusinessCodeTemplateSettings;
}

function parseTransform(value: unknown, field: string, label: string): BusinessCodeFieldTransform | undefined {
  if (value === undefined) return undefined;
  const source = object(value, label);
  const kind = source.kind;
  const definition = businessCodeFieldDefinition(field);
  if (kind === "none") return { kind };
  if (
    kind !== "uppercaseLetters"
    && kind !== "uppercaseAlphanumeric"
    && kind !== "compactText"
    && kind !== "integer"
    && kind !== "padInteger"
  ) {
    throw new Error(`${label}不支持`);
  }
  if (!definition?.transforms?.includes(kind)) throw new Error(`${label}不适用于所选业务字段`);
  return { kind, length: integer(source.length, 1, 12, `${label}位数`) };
}

function parseSegment(value: unknown, ruleIndex: number, segmentIndex: number): BusinessCodeTemplateSegment {
  const source = object(value, `第 ${ruleIndex + 1} 条规则第 ${segmentIndex + 1} 个组成部分`);
  const label = `第 ${ruleIndex + 1} 条规则第 ${segmentIndex + 1} 个组成部分`;
  if (source.kind === "literal") {
    return { kind: "literal", value: text(source.value, 24, `${label}固定文本`) };
  }
  if (source.kind === "field") {
    const field = text(source.field, 64, `${label}业务字段`);
    if (!FIELD_KEYS.has(field)) throw new Error(`${label}业务字段未登记`);
    const definition = businessCodeFieldDefinition(field);
    if (definition?.conditionOptions) throw new Error(`${label}不能使用条件字段作为编号内容`);
    return { kind: "field", field, ...(source.transform === undefined ? {} : { transform: parseTransform(source.transform, field, `${label}安全转换`) }) };
  }
  if (source.kind === "date" || source.kind === "datetime") {
    const field = text(source.field, 64, `${label}日期字段`);
    const definition = businessCodeFieldDefinition(field);
    if (!definition || (definition.valueKind !== "date" && definition.valueKind !== "datetime")) {
      throw new Error(`${label}日期字段不可用`);
    }
    const format = text(source.format, 32, `${label}日期格式`);
    const parsed = parseBusinessCodeDateFormat(format, source.kind);
    if (!parsed.ok) throw new Error(`${label}：${parsed.error}`);
    return { kind: source.kind, field, format };
  }
  if (source.kind === "sequence") {
    return { kind: "sequence", length: integer(source.length, 1, 12, `${label}流水位数`) };
  }
  throw new Error(`${label}类型不支持`);
}

function parseRule(value: unknown, index: number): BusinessCodeTemplateRule {
  const source = object(value, `第 ${index + 1} 条规则`);
  const key = text(source.key, 64, `第 ${index + 1} 条规则标识`);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(key)) throw new Error(`第 ${index + 1} 条规则标识只能使用小写字母、数字和连字符`);
  const conditions = Array.isArray(source.conditions) ? source.conditions : [];
  if (conditions.length > 4) throw new Error(`第 ${index + 1} 条规则最多配置 4 个条件`);
  const conditionFields = new Set<string>();
  const parsedConditions = conditions.map((raw, conditionIndex) => {
    const condition = object(raw, `第 ${index + 1} 条规则第 ${conditionIndex + 1} 个条件`);
    const field = text(condition.field, 64, `第 ${index + 1} 条规则条件字段`);
    const definition = businessCodeFieldDefinition(field);
    if (!definition?.conditionOptions) throw new Error(`第 ${index + 1} 条规则条件字段未登记`);
    if (conditionFields.has(field)) throw new Error(`第 ${index + 1} 条规则不能重复使用条件字段`);
    conditionFields.add(field);
    const conditionValue = text(condition.value, 64, `第 ${index + 1} 条规则条件值`);
    if (!definition.conditionOptions.some((option) => option.value === conditionValue)) {
      throw new Error(`第 ${index + 1} 条规则条件值不可用`);
    }
    if (condition.operator !== "equals") throw new Error(`第 ${index + 1} 条规则只允许等于条件`);
    return { field, operator: "equals" as const, value: conditionValue };
  });

  if (!Array.isArray(source.segments) || source.segments.length < 1 || source.segments.length > 12) {
    throw new Error(`第 ${index + 1} 条规则必须包含 1 至 12 个组成部分`);
  }
  const segments = source.segments.map((segment, segmentIndex) => parseSegment(segment, index, segmentIndex));
  const sequenceSegments = segments.filter((segment) => segment.kind === "sequence");
  if (sequenceSegments.length > 1) throw new Error(`第 ${index + 1} 条规则最多包含一个流水号`);

  let sequence: BusinessCodeTemplateRule["sequence"];
  if (sequenceSegments.length === 1) {
    const sequenceSource = object(source.sequence, `第 ${index + 1} 条规则流水设置`);
    const length = sequenceSegments[0]?.kind === "sequence" ? sequenceSegments[0].length : 0;
    const maximum = (10 ** length) - 1;
    const start = integer(sequenceSource.start, 1, maximum, `第 ${index + 1} 条规则流水起始值`);
    const end = sequenceSource.end === undefined
      ? undefined
      : integer(sequenceSource.end, start, maximum, `第 ${index + 1} 条规则流水结束值`);
    const scope = Array.isArray(sequenceSource.scope)
      ? sequenceSource.scope.map((item, scopeIndex) => {
          const field = text(item, 64, `第 ${index + 1} 条规则第 ${scopeIndex + 1} 个流水作用域`);
          if (!businessCodeFieldDefinition(field)?.scopeEligible) throw new Error(`第 ${index + 1} 条规则流水作用域未登记`);
          return field;
        })
      : [];
    if (new Set(scope).size !== scope.length) throw new Error(`第 ${index + 1} 条规则流水作用域不能重复`);
    sequence = { start, ...(end === undefined ? {} : { end }), scope };
  } else if (source.sequence !== undefined) {
    throw new Error(`第 ${index + 1} 条规则没有流水号，不能配置流水设置`);
  }

  return {
    key,
    name: text(source.name, 40, `第 ${index + 1} 条规则名称`),
    priority: integer(source.priority, 1, 9999, `第 ${index + 1} 条规则优先级`),
    conditions: parsedConditions,
    segments,
    ...(sequence ? { sequence } : {}),
  };
}

export function parseBusinessCodeTemplateSettings(value: unknown): BusinessCodeTemplateSettings {
  const source = object(value, "模板配置");
  if (source.version !== 2) throw new Error("模板配置版本无效");
  if (!Array.isArray(source.rules) || source.rules.length < 1 || source.rules.length > 8) {
    throw new Error("模板必须包含 1 至 8 条规则分支");
  }
  const rules = source.rules.map(parseRule);
  if (new Set(rules.map((rule) => rule.key)).size !== rules.length) throw new Error("规则标识不能重复");
  if (new Set(rules.map((rule) => rule.priority)).size !== rules.length) throw new Error("规则优先级不能重复");
  return { version: 2, rules: [...rules].sort((left, right) => right.priority - left.priority) };
}

function transformField(value: unknown, transform?: BusinessCodeFieldTransform) {
  const source = String(value ?? "").trim();
  if (!transform || transform.kind === "none") return source;
  if (transform.kind === "uppercaseLetters") return source.replace(/[^a-zA-Z]/g, "").toUpperCase().slice(0, transform.length);
  if (transform.kind === "uppercaseAlphanumeric") return source.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, transform.length);
  if (transform.kind === "compactText") return source.replace(/\s/g, "").slice(0, transform.length);
  const integerText = source.replace(/\D/g, "").slice(0, transform.length);
  if (transform.kind === "integer") return integerText ? String(Number(integerText)) : "";
  return integerText.padStart(transform.length, "0");
}

function exampleValue(field: string) {
  const value = businessCodeFieldDefinition(field)?.example;
  if (value === undefined) throw new Error(`编码上下文缺少 ${field}`);
  return value;
}

export function renderBusinessCodeTemplateRule(
  rule: BusinessCodeTemplateRule,
  values: Readonly<Record<string, unknown>> = {},
  sequence = rule.sequence?.start ?? 1,
) {
  return rule.segments.map((segment) => {
    if (segment.kind === "literal") return segment.value;
    if (segment.kind === "sequence") return String(sequence).padStart(segment.length, "0");
    const value = values[segment.field] ?? exampleValue(segment.field);
    if (segment.kind === "field") return transformField(value, segment.transform);
    return formatBusinessCodeDate(value as never, segment.format, segment.kind);
  }).join("");
}

export function businessCodeTemplateExample(settings: BusinessCodeTemplateSettings) {
  const parsed = parseBusinessCodeTemplateSettings(settings);
  const first = parsed.rules[0];
  if (!first) return "—";
  return renderBusinessCodeTemplateRule(first);
}

export function businessCodeTemplateSummary(settings: BusinessCodeTemplateSettings) {
  const parsed = parseBusinessCodeTemplateSettings(settings);
  if (parsed.rules.length > 1) return `${parsed.rules.length} 条条件规则`;
  const rule = parsed.rules[0];
  return rule?.segments.map((segment) => {
    if (segment.kind === "literal") return segment.value;
    if (segment.kind === "field") return `{${businessCodeFieldDefinition(segment.field)?.label ?? segment.field}}`;
    if (segment.kind === "sequence") return `{流水:${segment.length}}`;
    return `{${segment.kind === "datetime" ? "时间" : "日期"}:${segment.format}}`;
  }).join("") ?? "—";
}

export function defaultBusinessCodeTemplateSettings(key: BusinessCodeSystemTemplateKey) {
  return cloneSettings(businessCodeSystemTemplate(key).settings);
}

function legacySegments(rule: Record<string, unknown>): BusinessCodeTemplateSegment[] {
  if (!Array.isArray(rule.segments)) return [];
  return rule.segments.flatMap((raw): BusinessCodeTemplateSegment[] => {
    if (!raw || typeof raw !== "object") return [];
    const segment = raw as BusinessCodeSegment;
    if (segment.kind === "literal") return [{ kind: "literal", value: segment.value }];
    if (segment.kind === "reference") return [{ kind: "field", field: segment.source }];
    if (segment.kind === "sequence") return [{ kind: "sequence", length: segment.length }];
    return [{ kind: segment.kind, field: segment.source, format: segment.format }];
  });
}

function legacyRuleSettings(
  segments: BusinessCodeTemplateSegment[],
  start: unknown,
  scope: string[] = [],
): BusinessCodeTemplateSettings {
  return {
    version: 2,
    rules: [{
      key: "default",
      name: "默认规则",
      priority: 100,
      conditions: [],
      segments,
      ...(segments.some((segment) => segment.kind === "sequence")
        ? { sequence: { start: integer(start, 1, 999_999_999, "流水起始值"), scope } }
        : {}),
    }],
  };
}

function withLegacyOrganization(value: Record<string, unknown>) {
  const settings = defaultBusinessCodeTemplateSettings("system.organization");
  const identifierFormat = value.identifierFormat;
  const transformKind = identifierFormat === "uppercaseAlphanumeric" || identifierFormat === "freeText"
    ? (identifierFormat === "freeText" ? "compactText" : identifierFormat)
    : "uppercaseLetters";
  const identifierLength = integer(value.identifierLength, 1, 12, "组织简称位数");
  const separator = typeof value.separator === "string" ? value.separator : "";
  const rootSuffix = text(value.managementRootSuffix, 12, "管理组织根后缀");
  const level2Suffix = text(value.level2Suffix, 12, "二级组织后缀");
  const level2Length = integer(value.level2SequenceLength, 1, 6, "二级组织流水位数");
  const level3Length = integer(value.level3SequenceLength, 1, 6, "三级组织流水位数");
  settings.rules = settings.rules.map((rule) => ({
    ...rule,
    segments: rule.segments.map((segment) => {
      if (segment.kind === "field" && segment.field === "organizationIdentifier") {
        return { ...segment, transform: { kind: transformKind, length: identifierLength } };
      }
      if (segment.kind === "field" && segment.field === "localSequence") {
        return {
          ...segment,
          transform: segment.transform?.kind === "padInteger"
            ? { kind: "padInteger", length: level3Length }
            : { kind: "integer", length: level2Length },
        };
      }
      return segment;
    }),
  }));
  const m1 = settings.rules.find((rule) => rule.key === "management-level-1");
  if (m1) m1.segments = [m1.segments[0]!, { kind: "literal", value: `${separator}${rootSuffix}` }];
  const m2 = settings.rules.find((rule) => rule.key === "management-level-2");
  if (m2) m2.segments = [m2.segments[0]!, { kind: "literal", value: separator }, m2.segments[2]!, { kind: "literal", value: level2Suffix }];
  const m3 = settings.rules.find((rule) => rule.key === "management-level-3");
  if (m3) m3.segments = [m3.segments[0]!, { kind: "literal", value: separator }, m3.segments[2]!, m3.segments[3]!];
  return settings;
}

function withLegacyPosition(value: Record<string, unknown>) {
  const prefix = typeof value.prefix === "string" ? value.prefix : "";
  const separator = typeof value.separator === "string" ? value.separator : "";
  return legacyRuleSettings([
    ...(prefix ? [{ kind: "literal" as const, value: `${prefix}${separator}` }] : []),
    { kind: "field", field: "departmentCode" },
    ...(separator ? [{ kind: "literal" as const, value: separator }] : []),
    { kind: "sequence", length: integer(value.sequenceLength, 1, 12, "岗位流水位数") },
  ], value.sequenceStart, ["departmentCode"]);
}

function withLegacyProject(value: Record<string, unknown>) {
  const settings = defaultBusinessCodeTemplateSettings("system.project");
  const prefix = text(value.companyPrefix, 24, "项目固定文本");
  const separator = typeof value.separator === "string" ? value.separator : "";
  const format = value.yearDigits === 4 ? "YYYY" : "YY";
  return {
    ...settings,
    rules: settings.rules.map((rule) => {
      const isDepartment = rule.key === "department";
      const length = integer(
        isDepartment ? value.departmentSequenceLength : rule.key === "other" ? value.otherSequenceLength : value.companySequenceLength,
        1,
        12,
        "项目流水位数",
      );
      const start = integer(
        isDepartment ? value.departmentSequenceStart : rule.key === "other" ? value.otherSequenceStart : value.companySequenceStart,
        1,
        999_999_999,
        "项目流水起始值",
      );
      return {
        ...rule,
        segments: [
          ...(isDepartment
            ? [{ kind: "field" as const, field: "departmentCode" }]
            : [{ kind: "literal" as const, value: prefix }]),
          { kind: "literal" as const, value: separator },
          { kind: "date" as const, field: "createdAt", format },
          { kind: "literal" as const, value: separator },
          { kind: "sequence" as const, length },
        ],
        sequence: {
          start,
          ...(rule.key === "company" ? { end: integer(value.companySequenceEnd, start, (10 ** length) - 1, "公司项目流水结束值") } : {}),
          scope: isDepartment ? ["departmentCode", "createdAt"] : ["createdAt"],
        },
      };
    }),
  };
}

export function upgradeBusinessCodeTemplateSettings(
  value: unknown,
  baseTemplateKey?: BusinessCodeSystemTemplateKey,
): BusinessCodeTemplateSettings {
  try {
    return parseBusinessCodeTemplateSettings(value);
  } catch {
    // Legacy template shapes are converted below; invalid values stay fail-closed.
  }
  const source = object(value, "旧模板配置");
  const rule = object(source.rule, "旧模板规则");
  if (source.kind === "sequential") return parseBusinessCodeTemplateSettings(legacyRuleSettings(legacySegments(rule), rule.sequenceStart, []));
  if (source.kind === "financeAsset") {
    return parseBusinessCodeTemplateSettings(legacyRuleSettings(
      legacySegments(rule),
      rule.sequenceStart,
      ["companyCode", "assetCategoryCode", "fiscalYear"],
    ));
  }
  if (source.kind === "organization") return parseBusinessCodeTemplateSettings(withLegacyOrganization(rule));
  if (source.kind === "position") return parseBusinessCodeTemplateSettings(withLegacyPosition(rule));
  if (source.kind === "project") return parseBusinessCodeTemplateSettings(withLegacyProject(rule));
  if (baseTemplateKey) return defaultBusinessCodeTemplateSettings(baseTemplateKey);
  throw new Error("模板配置版本无效");
}

export function businessCodeTemplateSettingsFromLegacy(
  baseTemplateKey: BusinessCodeSystemTemplateKey,
  _example: string,
) {
  return defaultBusinessCodeTemplateSettings(baseTemplateKey);
}

export function businessCodeTemplateTemporalKind(settings: BusinessCodeTemplateSettings): {
  kind: BusinessCodeTemporalKind;
  yearOnly: boolean;
} | null {
  const parsed = parseBusinessCodeTemplateSettings(settings);
  const temporal = parsed.rules[0]?.segments.find((segment) => segment.kind === "date" || segment.kind === "datetime");
  if (!temporal || (temporal.kind !== "date" && temporal.kind !== "datetime")) return null;
  return { kind: temporal.kind, yearOnly: temporal.format === "YY" || temporal.format === "YYYY" };
}

export function registeredBusinessCodeSystemSettings() {
  return BUSINESS_CODE_SYSTEM_TEMPLATES.map((template) => ({
    key: template.key,
    settings: defaultBusinessCodeTemplateSettings(template.key),
  }));
}
