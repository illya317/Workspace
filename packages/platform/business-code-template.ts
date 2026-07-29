import {
  BUSINESS_CODE_SYSTEM_TEMPLATES,
  type BusinessCodeSystemTemplateKey,
  type BusinessCodeTemplateFamily,
  type BusinessCodeTemplateSettings,
} from "./business-code-registry";
import {
  parseComposableBusinessCodeRule,
  renderBusinessCode,
  type BusinessCodeSegment,
  type BusinessCodeTemporalParts,
  type ComposableBusinessCodeRule,
} from "./business-code-rule";

const PREVIEW_DATE: BusinessCodeTemporalParts = {
  year: 2026,
  month: 7,
  day: 29,
  hour: 15,
  minute: 8,
  second: 6,
};

function sequentialRule(format?: string, kind: "date" | "datetime" = "date"): ComposableBusinessCodeRule {
  return {
    segments: [
      { kind: "literal", value: "CODE" },
      { kind: "literal", value: "-" },
      ...(format ? [{ kind, source: "createdAt", format } as const] : []),
      ...(format ? [{ kind: "literal", value: "-" } as const] : []),
      { kind: "sequence", length: 5 },
    ],
    sequenceStart: 1,
  };
}

function financeAssetRule(): ComposableBusinessCodeRule {
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
  };
}

export function defaultBusinessCodeTemplateSettings(
  baseTemplateKey: BusinessCodeSystemTemplateKey,
): BusinessCodeTemplateSettings {
  if (baseTemplateKey === "system.sequential") {
    return { kind: "sequential", rule: sequentialRule() };
  }
  if (baseTemplateKey === "system.yearSequence") {
    return { kind: "sequential", rule: sequentialRule("YY") };
  }
  if (baseTemplateKey === "system.dateSequence") {
    return { kind: "sequential", rule: sequentialRule("YYMMDD") };
  }
  if (baseTemplateKey === "system.datetimeSequence") {
    return { kind: "sequential", rule: sequentialRule("YYMMDDHHmmss", "datetime") };
  }
  if (baseTemplateKey === "system.organization") {
    return {
      kind: "organization",
      rule: {
        identifierFormat: "uppercaseLetters",
        identifierLength: 3,
        functionalPrefix: "FUN",
        separator: "",
        managementRootSuffix: "001",
        level2Suffix: "00",
        level2SequenceLength: 4,
        level3SequenceLength: 2,
      },
    };
  }
  if (baseTemplateKey === "system.position") {
    return {
      kind: "position",
      rule: { prefix: "GW", separator: "-", sequenceLength: 2, sequenceStart: 1 },
    };
  }
  if (baseTemplateKey === "system.project") {
    return {
      kind: "project",
      rule: {
        companyPrefix: "PRJ",
        separator: "-",
        yearDigits: 2,
        companySequenceLength: 3,
        companySequenceStart: 1,
        companySequenceEnd: 999,
        departmentSequenceLength: 3,
        departmentSequenceStart: 1,
        otherSequenceLength: 3,
        otherSequenceStart: 1,
      },
    };
  }
  return { kind: "financeAsset", rule: financeAssetRule() };
}

function integer(value: unknown, min: number, max: number, label: string) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) throw new Error(`${label}无效`);
  return parsed;
}

function text(value: unknown, max: number, label: string, required = true) {
  const parsed = typeof value === "string" ? value.trim() : "";
  if ((required && !parsed) || parsed.length > max) throw new Error(`${label}无效`);
  return parsed;
}

function object(value: unknown, label: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label}无效`);
  return value as Record<string, unknown>;
}

function validateSequenceRange(start: number, length: number, label: string) {
  if (start > (10 ** length) - 1) throw new Error(`${label}超出配置位数`);
}

export function parseBusinessCodeTemplateSettings(
  value: unknown,
  expectedFamily?: BusinessCodeTemplateFamily,
): BusinessCodeTemplateSettings {
  const source = object(value, "模板配置");
  const kind = source.kind as BusinessCodeTemplateFamily;
  if (expectedFamily && kind !== expectedFamily) throw new Error("模板类型与基础结构不一致");
  const rule = object(source.rule, "模板规则");

  if (kind === "sequential" || kind === "financeAsset") {
    const parsed = parseComposableBusinessCodeRule(rule, {
      allowedSources: kind === "financeAsset"
        ? ["companyCode", "assetCategoryCode", "fiscalYear"]
        : ["createdAt"],
    });
    if (kind === "financeAsset") {
      const sequence = parsed.segments.find((segment) => segment.kind === "sequence");
      if (sequence?.length !== 5) throw new Error("财务资产流水固定为 5 位");
    }
    return { kind, rule: parsed };
  }

  if (kind === "organization") {
    const formats = ["uppercaseLetters", "uppercaseAlphanumeric", "freeText"] as const;
    if (!formats.includes(rule.identifierFormat as (typeof formats)[number])) {
      throw new Error("组织简称格式无效");
    }
    return {
      kind,
      rule: {
        identifierFormat: rule.identifierFormat as (typeof formats)[number],
        identifierLength: integer(rule.identifierLength, 1, 12, "组织简称位数"),
        functionalPrefix: text(rule.functionalPrefix, 24, "职能组织标识"),
        separator: text(rule.separator, 3, "连接符", false),
        managementRootSuffix: text(rule.managementRootSuffix, 12, "管理组织根后缀"),
        level2Suffix: text(rule.level2Suffix, 12, "二级组织后缀"),
        level2SequenceLength: integer(rule.level2SequenceLength, 1, 6, "二级组织流水位数"),
        level3SequenceLength: integer(rule.level3SequenceLength, 1, 6, "三级组织流水位数"),
      },
    };
  }

  if (kind === "position") {
    const sequenceLength = integer(rule.sequenceLength, 1, 12, "岗位流水位数");
    const sequenceStart = integer(rule.sequenceStart, 1, 999_999_999, "岗位流水起始值");
    validateSequenceRange(sequenceStart, sequenceLength, "岗位流水起始值");
    return {
      kind,
      rule: {
        prefix: text(rule.prefix, 24, "岗位固定文本", false),
        separator: text(rule.separator, 3, "连接符", false),
        sequenceLength,
        sequenceStart,
      },
    };
  }

  if (kind === "project") {
    const companySequenceLength = integer(rule.companySequenceLength, 1, 12, "公司项目流水位数");
    const companySequenceStart = integer(rule.companySequenceStart, 1, 999_999_999, "公司项目流水起始值");
    const companySequenceEnd = integer(rule.companySequenceEnd, companySequenceStart, 999_999_999, "公司项目流水结束值");
    const departmentSequenceLength = integer(rule.departmentSequenceLength, 1, 12, "部门项目流水位数");
    const departmentSequenceStart = integer(rule.departmentSequenceStart, 1, 999_999_999, "部门项目流水起始值");
    const otherSequenceLength = integer(rule.otherSequenceLength, 1, 12, "其他项目流水位数");
    const otherSequenceStart = integer(rule.otherSequenceStart, 1, 999_999_999, "其他项目流水起始值");
    validateSequenceRange(companySequenceStart, companySequenceLength, "公司项目流水起始值");
    validateSequenceRange(companySequenceEnd, companySequenceLength, "公司项目流水结束值");
    validateSequenceRange(departmentSequenceStart, departmentSequenceLength, "部门项目流水起始值");
    validateSequenceRange(otherSequenceStart, otherSequenceLength, "其他项目流水起始值");
    return {
      kind,
      rule: {
        companyPrefix: text(rule.companyPrefix, 24, "项目固定文本"),
        separator: text(rule.separator, 3, "连接符", false),
        yearDigits: rule.yearDigits === 4 ? 4 : 2,
        companySequenceLength,
        companySequenceStart,
        companySequenceEnd,
        departmentSequenceLength,
        departmentSequenceStart,
        otherSequenceLength,
        otherSequenceStart,
      },
    };
  }

  throw new Error("模板类型不支持");
}

function identifierExample(settings: Extract<BusinessCodeTemplateSettings, { kind: "organization" }>) {
  const { identifierFormat, identifierLength } = settings.rule;
  const source = identifierFormat === "uppercaseLetters"
    ? "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    : identifierFormat === "uppercaseAlphanumeric"
      ? "A1B2C3D4E5F6"
      : "ORGCODE";
  return Array.from({ length: identifierLength }, (_, index) => source[index % source.length]).join("");
}

export function businessCodeTemplateExample(settings: BusinessCodeTemplateSettings) {
  const parsed = parseBusinessCodeTemplateSettings(settings);
  if (parsed.kind === "sequential") {
    return renderBusinessCode(parsed.rule, {
      values: { createdAt: PREVIEW_DATE },
      sequence: parsed.rule.sequenceStart,
    });
  }
  if (parsed.kind === "financeAsset") {
    return renderBusinessCode(parsed.rule, {
      values: {
        companyCode: "02",
        assetCategoryCode: "FA-ELECTRONIC",
        fiscalYear: PREVIEW_DATE.year,
      },
      sequence: parsed.rule.sequenceStart,
    });
  }
  if (parsed.kind === "organization") {
    const identifier = identifierExample(parsed);
    return `${identifier}${parsed.rule.separator}${parsed.rule.managementRootSuffix}`;
  }
  if (parsed.kind === "position") {
    return [
      parsed.rule.prefix,
      "FUN-001",
      String(parsed.rule.sequenceStart).padStart(parsed.rule.sequenceLength, "0"),
    ].filter(Boolean).join(parsed.rule.separator);
  }
  const year = parsed.rule.yearDigits === 4 ? "2026" : "26";
  return [
    parsed.rule.companyPrefix,
    year,
    String(parsed.rule.companySequenceStart).padStart(parsed.rule.companySequenceLength, "0"),
  ].join(parsed.rule.separator);
}

export function businessCodeTemplateSummary(settings: BusinessCodeTemplateSettings) {
  const parsed = parseBusinessCodeTemplateSettings(settings);
  if (parsed.kind === "sequential" || parsed.kind === "financeAsset") {
    return parsed.rule.segments.map((segment) => {
      if (segment.kind === "literal") return segment.value;
      if (segment.kind === "reference") return `{${segment.source}}`;
      if (segment.kind === "sequence") return `{流水:${segment.length}}`;
      return `{${segment.kind === "datetime" ? "时间" : "日期"}:${segment.format}}`;
    }).join("");
  }
  if (parsed.kind === "organization") return "组织简称 + 分层后缀";
  if (parsed.kind === "position") return "固定文本 + 直属组织编码 + 流水";
  return `固定文本 + ${parsed.rule.yearDigits} 位年度 + 分域流水`;
}

export function businessCodeTemplateSettingsFromLegacy(
  baseTemplateKey: BusinessCodeSystemTemplateKey,
  example: string,
) {
  const fallback = defaultBusinessCodeTemplateSettings(baseTemplateKey);
  const source = example.trim();
  try {
    if (fallback.kind !== "sequential") return fallback;
    const match = source.match(/^(.*?)(\d+)$/);
    if (!match) return fallback;
    const sequenceLength = match[2].length;
    const sequenceStart = Number(match[2]);
    const prefix = match[1];
    const last = prefix.slice(-1);
    const separator = /^[-_/.:]$/.test(last) ? last : "";
    const fixed = separator ? prefix.slice(0, -1) : prefix;
    const segments: BusinessCodeSegment[] = [
      ...(fixed ? [{ kind: "literal" as const, value: fixed }] : []),
      ...(separator ? [{ kind: "literal" as const, value: separator }] : []),
      { kind: "sequence", length: sequenceLength },
    ];
    return parseBusinessCodeTemplateSettings({
      kind: "sequential",
      rule: { segments, sequenceStart },
    }, "sequential");
  } catch {
    return fallback;
  }
}

export function businessCodeTemplateFamilyForBase(baseTemplateKey: BusinessCodeSystemTemplateKey) {
  const template = BUSINESS_CODE_SYSTEM_TEMPLATES.find((item) => item.key === baseTemplateKey);
  if (!template) throw new Error("基础模板不存在");
  return template.family;
}
