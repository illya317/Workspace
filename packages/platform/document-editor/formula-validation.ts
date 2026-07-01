import {
  collectFormulaReferences,
  normalizeFormulaText,
  parseFormulaExpression,
  validateFormulaFunctionArguments,
} from "../formula/parser";
import { durationUnit, isFormulaAlias, validateDateDifferenceExpression } from "../formula/date-difference";
import { normalizeFormulaDisplayText } from "./formula-display";
import { slotContextLabel } from "./slot-numbering";
import type { EditorSlotInline, FieldDefinition, FieldModel } from "./types";

export type FormulaDisplayToken = {
  fieldKey: string;
  alias: string;
  reference?: string;
  replacement?: string;
  labels: string[];
  context: string;
  formulaText?: string;
};

export function formulaDisplayText(attrs: EditorSlotInline, tokens: FormulaDisplayToken[]) {
  const formulaText = attrs.formulaText ?? "";
  if (!formulaText) return "";
  const displayTokens = scopedFormulaTokens(attrs, tokens);
  return canonicalFormulaText(formulaText, displayTokens);
}

export function validateFormulaSlotDraft(attrs: EditorSlotInline, tokens: FormulaDisplayToken[], field?: FieldDefinition) {
  const formulaText = String(attrs.formulaText ?? "").trim();
  if (!formulaText) return { ok: false as const, error: "请输入计算式" };
  const displayTokens = scopedFormulaTokens(attrs, tokens);
  const expressionText = canonicalFormulaText(formulaText, displayTokens);
  try {
    const expression = parseFormulaExpression(expressionText);
    const aliases = new Set(displayTokens.map((token) => (token.reference ?? token.alias).toLowerCase()));
    const unit = durationUnit(formulaTarget(attrs, field));
    if (unit) validateDateDifferenceExpression(expression);
    else validateFormulaFunctionArguments(expression, (reference) => isFormulaAlias(reference) && aliases.has(reference.trim().toLowerCase()));
    const selfAlias = attrs.alias?.toLowerCase();
    if (selfAlias && collectFormulaReferences(expression).some((reference) => reference.trim().toLowerCase() === selfAlias)) {
      return { ok: false as const, error: "公式不能引用自己" };
    }
    const missing = collectFormulaReferences(expression).find((reference) => !aliases.has(reference.trim().toLowerCase()));
    if (missing) return { ok: false as const, error: `公式引用不存在：${missing}` };
    return { ok: true as const, attrs: { ...attrs, formulaText: expressionText } };
  } catch (error) {
    return { ok: false as const, error: formulaValidationMessage(error) };
  }
}

export function collectFieldModelFormulaTokens(fieldModel: FieldModel | undefined, existing: Map<string, FormulaDisplayToken>) {
  if (!fieldModel || Array.isArray(fieldModel.fields)) return [];
  return Object.entries(fieldModel.fields).flatMap(([fieldKey, field]): FormulaDisplayToken[] => {
    const key = field.fieldKey ?? field.key ?? fieldKey;
    if (!key || existing.has(key)) return [];
    const replacement = constantFieldReplacement(field);
    if (!replacement) return [];
    return [{
      fieldKey: key,
      alias: key,
      reference: key,
      replacement,
      labels: [field.name, field.label, key, key.split("/").at(-1)].filter((value): value is string => Boolean(value)),
      context: fieldSourceContextLabel(field),
    }];
  });
}

function canonicalFormulaText(formulaText: string, tokens: FormulaDisplayToken[]) {
  return normalizeFormulaText(
    normalizeFormulaDisplayText(replaceFormulaLabels(formulaText, tokens), createFormulaAliasMap(tokens)),
  );
}

function scopedFormulaTokens(attrs: EditorSlotInline, tokens: FormulaDisplayToken[]) {
  const currentContext = slotContextLabel(attrs);
  if (!currentContext) return tokens;
  return tokens.filter((token) => token.context === currentContext);
}

function replaceFormulaLabels(formulaText: string, tokens: FormulaDisplayToken[]) {
  const mappings = new Map<string, string>();
  tokens.forEach((token) => {
    token.labels.forEach((label) => {
      const replacement = token.replacement ?? token.alias;
      if (label && label !== token.alias) mappings.set(label, replacement);
    });
  });
  return replaceOutsideReferences(formulaText, mappings);
}

function createFormulaAliasMap(tokens: FormulaDisplayToken[]) {
  const formulas = new Map<string, string>();
  tokens.forEach((token) => {
    if (token.formulaText && /^y\d+$/i.test(token.alias)) {
      formulas.set(token.alias.toLowerCase(), replaceFormulaLabels(token.formulaText, tokens));
    }
  });
  return formulas;
}

function formulaTarget(attrs: EditorSlotInline, field?: FieldDefinition) {
  const legacyPart = attrs.metadata?.legacyPart;
  const legacyType = legacyPart && typeof legacyPart === "object" && "type" in legacyPart ? String(legacyPart.type ?? "") : undefined;
  return {
    inputType: attrs.inputType ?? field?.inputType ?? legacyType,
    valueType: attrs.valueType ?? field?.valueType ?? field?.type ?? legacyType,
  };
}

function fieldSourceContextLabel(field: FieldDefinition) {
  const source = ((field as FieldDefinition & { source?: Record<string, unknown> }).source ?? field.metadata?.source ?? {}) as Record<string, unknown>;
  const [product, stage, sequence, test] = [source.productName, source.stageLabel, source.sequence, source.testName].map(stringValue);
  return [product, stage, [sequence, test].filter(Boolean).join(" ")].filter(Boolean).join(" / ");
}

function constantFieldReplacement(field: FieldDefinition) {
  const numeric = numericText(field.defaultValue) ?? numericText(field.recommendedValue);
  if (numeric) return numeric;
  const source = ((field as FieldDefinition & { source?: Record<string, unknown> }).source ?? field.metadata?.source ?? {}) as Record<string, unknown>;
  if (source.productKey === "berberine_tannate" && field.name === "规格" && field.unit === "mg") return "100";
  return null;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function numericText(value: unknown) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return /^-?\d+(?:\.\d+)?$/.test(text) ? text : null;
}

function formulaValidationMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Invalid formula expression.";
  if (message.includes("Unsupported formula function")) return "公式函数不支持";
  if (message.includes("only accepts x/y/z/p inputs") || message.includes("only accepts x/p inputs") || message.includes("only accepts x inputs")) return "该函数只能引用输入项 x/y/z/p";
  if (message.includes("Date duration formula only accepts a-b")) return "日期差值公式只能填写 a-b 或 (a-b)";
  if (message.includes("Unexpected trailing expression")) return "计算式后面有多余内容";
  if (message.includes("Expected value")) return "计算式不完整";
  if (message.includes("Expected")) return "计算式括号或运算符不完整";
  if (message.includes("Unclosed")) return "计算式括号或引用未闭合";
  if (message.includes("Unexpected token")) return "计算式包含无法识别的字符";
  return `计算式无效：${message}`;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replaceOutsideReferences(formulaText: string, mappings: Map<string, string>) {
  return formulaText.split(/(\{[^}]*\}|\[[^\]]*\])/g).map((part) => {
    if (/^(?:\{[^}]*\}|\[[^\]]*\])$/.test(part)) return part;
    return [...mappings.entries()]
      .sort(([left], [right]) => right.length - left.length)
      .reduce((text, [label, alias]) => text.replace(new RegExp(escapeRegExp(label), "g"), alias), part);
  }).join("");
}
