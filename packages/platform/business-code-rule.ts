export type BusinessCodeTemporalKind = "date" | "datetime";

export type BusinessCodeTemporalParts = {
  year: number;
  month?: number;
  day?: number;
  hour?: number;
  minute?: number;
  second?: number;
};

export type BusinessCodeSegment =
  | { kind: "literal"; value: string }
  | { kind: "reference"; source: string }
  | { kind: BusinessCodeTemporalKind; source: string; format: string }
  | { kind: "sequence"; length: number };

export type ComposableBusinessCodeRule = {
  segments: BusinessCodeSegment[];
  sequenceStart: number;
};

export type BusinessCodeRenderContext = {
  values?: Readonly<Record<string, string | number | Date | BusinessCodeTemporalParts>>;
  sequence: number;
};

const DATE_TOKENS = ["YYYY", "MMM", "YY", "MM", "DD"] as const;
const DATETIME_TOKENS = [...DATE_TOKENS, "HH", "mm", "ss"] as const;
const FORMAT_LITERAL = /^[-_/.:]$/;
const MONTH_NAMES = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

type DateToken = (typeof DATETIME_TOKENS)[number];
type DateFormatResult =
  | { ok: true; tokens: Array<{ kind: "token"; value: DateToken } | { kind: "literal"; value: string }> }
  | { ok: false; error: string };

function tokenUnit(token: DateToken) {
  if (token === "YYYY" || token === "YY") return "year";
  if (token === "MMM" || token === "MM") return "month";
  if (token === "DD") return "day";
  if (token === "HH") return "hour";
  if (token === "mm") return "minute";
  return "second";
}

export function parseBusinessCodeDateFormat(
  format: string,
  kind: BusinessCodeTemporalKind,
): DateFormatResult {
  const source = format.trim();
  if (!source) return { ok: false, error: "日期格式不能为空" };
  if (source.length > 32) return { ok: false, error: "日期格式不能超过 32 个字符" };
  const allowed = kind === "date" ? DATE_TOKENS : DATETIME_TOKENS;
  const tokens: Extract<DateFormatResult, { ok: true }>["tokens"] = [];
  const usedUnits = new Set<string>();
  let index = 0;
  while (index < source.length) {
    const token = allowed.find((candidate) => source.startsWith(candidate, index));
    if (token) {
      const unit = tokenUnit(token);
      if (usedUnits.has(unit)) return { ok: false, error: `日期格式不能重复使用 ${unit}` };
      usedUnits.add(unit);
      tokens.push({ kind: "token", value: token });
      index += token.length;
      continue;
    }
    const literal = source[index];
    if (!FORMAT_LITERAL.test(literal)) {
      return { ok: false, error: `无法识别日期格式“${source.slice(index)}”` };
    }
    tokens.push({ kind: "literal", value: literal });
    index += 1;
  }
  if (!tokens.some((token) => token.kind === "token")) {
    return { ok: false, error: "日期格式至少需要一个格式标记" };
  }
  if (kind === "datetime" && !usedUnits.has("hour")) {
    return { ok: false, error: "完整时间格式至少需要 HH" };
  }
  return { ok: true, tokens };
}

function integerInRange(value: unknown, min: number, max: number, label: string) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new Error(`${label}无效`);
  }
  return number;
}

function temporalParts(value: string | number | Date | BusinessCodeTemporalParts): BusinessCodeTemporalParts {
  if (typeof value === "number") return { year: integerInRange(value, 0, 9999, "年度") };
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new Error("日期值无效");
    return {
      year: value.getFullYear(),
      month: value.getMonth() + 1,
      day: value.getDate(),
      hour: value.getHours(),
      minute: value.getMinutes(),
      second: value.getSeconds(),
    };
  }
  if (typeof value === "string") {
    const match = value.trim().match(/^(\d{4})(?:-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?)?$/);
    if (!match) throw new Error("日期值必须使用 YYYY、YYYY-MM-DD 或 YYYY-MM-DD HH:mm:ss");
    const year = integerInRange(match[1], 0, 9999, "年度");
    const month = match[2] ? integerInRange(match[2], 1, 12, "月份") : undefined;
    const day = match[3] ? integerInRange(match[3], 1, 31, "日期") : undefined;
    if (month !== undefined && day !== undefined) {
      const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
      const monthDays = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
      const maximumDay = monthDays[month - 1];
      if (!maximumDay || day > maximumDay) throw new Error("日期值无效");
    }
    return {
      year,
      ...(month === undefined ? {} : { month }),
      ...(day === undefined ? {} : { day }),
      ...(match[4] ? { hour: integerInRange(match[4], 0, 23, "小时") } : {}),
      ...(match[5] ? { minute: integerInRange(match[5], 0, 59, "分钟") } : {}),
      ...(match[6] ? { second: integerInRange(match[6], 0, 59, "秒") } : {}),
    };
  }
  return {
    year: integerInRange(value.year, 0, 9999, "年度"),
    ...(value.month === undefined ? {} : { month: integerInRange(value.month, 1, 12, "月份") }),
    ...(value.day === undefined ? {} : { day: integerInRange(value.day, 1, 31, "日期") }),
    ...(value.hour === undefined ? {} : { hour: integerInRange(value.hour, 0, 23, "小时") }),
    ...(value.minute === undefined ? {} : { minute: integerInRange(value.minute, 0, 59, "分钟") }),
    ...(value.second === undefined ? {} : { second: integerInRange(value.second, 0, 59, "秒") }),
  };
}

function requiredPart(parts: BusinessCodeTemporalParts, key: keyof BusinessCodeTemporalParts, label: string) {
  const value = parts[key];
  if (value === undefined) throw new Error(`当前业务数据缺少${label}，无法使用该日期格式`);
  return value;
}

export function formatBusinessCodeDate(
  value: string | number | Date | BusinessCodeTemporalParts,
  format: string,
  kind: BusinessCodeTemporalKind,
) {
  const parsed = parseBusinessCodeDateFormat(format, kind);
  if (!parsed.ok) throw new Error(parsed.error);
  const parts = temporalParts(value);
  return parsed.tokens.map((part) => {
    if (part.kind === "literal") return part.value;
    if (part.value === "YYYY") return String(parts.year).padStart(4, "0");
    if (part.value === "YY") return String(parts.year % 100).padStart(2, "0");
    if (part.value === "MMM") return MONTH_NAMES[requiredPart(parts, "month", "月份") - 1];
    if (part.value === "MM") return String(requiredPart(parts, "month", "月份")).padStart(2, "0");
    if (part.value === "DD") return String(requiredPart(parts, "day", "日期")).padStart(2, "0");
    if (part.value === "HH") return String(requiredPart(parts, "hour", "小时")).padStart(2, "0");
    if (part.value === "mm") return String(requiredPart(parts, "minute", "分钟")).padStart(2, "0");
    return String(requiredPart(parts, "second", "秒")).padStart(2, "0");
  }).join("");
}

export function parseComposableBusinessCodeRule(
  value: unknown,
  options: { allowedSources?: readonly string[] } = {},
): ComposableBusinessCodeRule {
  if (!value || typeof value !== "object") throw new Error("编码规则配置无效");
  const source = value as Record<string, unknown>;
  if (!Array.isArray(source.segments) || source.segments.length < 1 || source.segments.length > 12) {
    throw new Error("编码规则必须包含 1 至 12 个组成部分");
  }
  const allowedSources = options.allowedSources ? new Set(options.allowedSources) : null;
  let sequenceCount = 0;
  const segments = source.segments.map((raw, index): BusinessCodeSegment => {
    if (!raw || typeof raw !== "object") throw new Error(`第 ${index + 1} 个编码段无效`);
    const segment = raw as Record<string, unknown>;
    if (segment.kind === "literal") {
      const literal = typeof segment.value === "string" ? segment.value.trim() : "";
      if (!literal || literal.length > 24) throw new Error(`第 ${index + 1} 个固定文本无效`);
      return { kind: "literal", value: literal };
    }
    if (segment.kind === "reference") {
      const reference = typeof segment.source === "string" ? segment.source.trim() : "";
      if (!reference || reference.length > 64 || (allowedSources && !allowedSources.has(reference))) {
        throw new Error(`第 ${index + 1} 个业务字段不可用`);
      }
      return { kind: "reference", source: reference };
    }
    if (segment.kind === "date" || segment.kind === "datetime") {
      const reference = typeof segment.source === "string" ? segment.source.trim() : "";
      const format = typeof segment.format === "string" ? segment.format.trim() : "";
      if (!reference || (allowedSources && !allowedSources.has(reference))) {
        throw new Error(`第 ${index + 1} 个日期来源不可用`);
      }
      const parsed = parseBusinessCodeDateFormat(format, segment.kind);
      if (!parsed.ok) throw new Error(`第 ${index + 1} 个编码段：${parsed.error}`);
      return { kind: segment.kind, source: reference, format };
    }
    if (segment.kind === "sequence") {
      sequenceCount += 1;
      return { kind: "sequence", length: integerInRange(segment.length, 1, 12, "流水位数") };
    }
    throw new Error(`第 ${index + 1} 个编码段类型不支持`);
  });
  if (sequenceCount !== 1) throw new Error("编码规则必须且只能包含一个流水号");
  const sequenceStart = integerInRange(source.sequenceStart, 1, 999_999_999, "流水起始值");
  const sequenceLength = segments.find((segment) => segment.kind === "sequence")?.length ?? 0;
  if (sequenceStart > (10 ** sequenceLength) - 1) throw new Error("流水起始值超出配置位数");
  return { segments, sequenceStart };
}

export function businessCodeSequenceSettings(rule: ComposableBusinessCodeRule) {
  const segment = rule.segments.find((item): item is Extract<BusinessCodeSegment, { kind: "sequence" }> => item.kind === "sequence");
  if (!segment) throw new Error("编码规则缺少流水号");
  return { length: segment.length, start: rule.sequenceStart, maximum: (10 ** segment.length) - 1 };
}

function contextValue(context: BusinessCodeRenderContext, source: string) {
  const value = context.values?.[source];
  if (value === undefined || value === null || String(value).trim() === "") {
    throw new Error(`编码上下文缺少 ${source}`);
  }
  return value;
}

export function renderBusinessCode(
  rule: ComposableBusinessCodeRule,
  context: BusinessCodeRenderContext,
) {
  const sequence = businessCodeSequenceSettings(rule);
  if (!Number.isInteger(context.sequence) || context.sequence < 1 || context.sequence > sequence.maximum) {
    throw new Error(`编码流水必须在 1 至 ${sequence.maximum} 之间`);
  }
  return rule.segments.map((segment) => {
    if (segment.kind === "literal") return segment.value;
    if (segment.kind === "reference") return String(contextValue(context, segment.source)).trim();
    if (segment.kind === "sequence") return String(context.sequence).padStart(segment.length, "0");
    return formatBusinessCodeDate(contextValue(context, segment.source), segment.format, segment.kind);
  }).join("");
}

export function businessCodeScopeParts(
  rule: ComposableBusinessCodeRule,
  context: BusinessCodeRenderContext,
) {
  const parts: Record<string, string> = {};
  for (const segment of rule.segments) {
    if (segment.kind === "reference") {
      parts[segment.source] = String(contextValue(context, segment.source)).trim();
    } else if (segment.kind === "date" || segment.kind === "datetime") {
      const key = parts[segment.source] === undefined ? segment.source : `${segment.source}:${segment.format}`;
      parts[key] = formatBusinessCodeDate(contextValue(context, segment.source), segment.format, segment.kind);
    }
  }
  return parts;
}
