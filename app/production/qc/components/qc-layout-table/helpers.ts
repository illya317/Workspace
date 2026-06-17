import type { QcLayoutCell, QcLayoutPart, QcTemplateMethodField, QcTemplateTestItem } from "@/server/services/production/qc";
import type { QcFieldValues } from "../useQcFormulaEngine";
import type { LayoutRenderContext } from "./types";

export function defaultValueForPart(part: QcLayoutPart, test?: QcTemplateTestItem) {
  if (part.defaultValue) return part.defaultValue;
  if (part.field === "重量差异限度") return test?.standardText?.match(/±\s*([\d.]+)\s*%/)?.[1];
  return undefined;
}

function scopePrefix(fieldKey: string) {
  const parts = fieldKey.split("/");
  return parts.length >= 2 ? `${parts[0]}/${parts[1]}/` : `${fieldKey}/`;
}

export function isReferenceFormula(field: QcTemplateMethodField | undefined, test?: QcTemplateTestItem) {
  if (!field || field.attr !== "calculated" || !field.formula) return false;
  const expr = field.formula.replace(/\s+/g, "").replace(/（/g, "(").replace(/）/g, ")");
  if (!expr) return false;
  if (/[<>=!&|+\-*/%^(),"'.0-9]/.test(expr) || expr.includes("ALL(") || expr.includes("Math.")) return false;
  const fields = test?.methodGroups.flatMap((group) => group.fields) || [];
  const prefix = scopePrefix(field.fieldKey);
  return fields.some((candidate) => candidate.fieldKey !== field.fieldKey && candidate.fieldKey.startsWith(prefix) && candidate.name === expr);
}

export function advancedLabelForField(kind: "formulaInput" | "formulaOutput" | "reference" | "input", fieldType?: string) {
  if (kind === "reference") return "ref";
  if (kind === "formulaOutput") return "f(x)";
  if (kind === "formulaInput") return "x";
  if (fieldType === "checkbox" || fieldType === "radio") return "✓";
  return "i";
}

export function resolvePartField(
  part: QcLayoutPart,
  test: QcTemplateTestItem | undefined,
  fieldByName: Map<string, QcTemplateMethodField>,
  fieldByKey: Map<string, QcTemplateMethodField>,
) {
  const occurrence = Math.max(1, part.occurrence || 1);
  const fields = test?.methodGroups.flatMap((group) => group.fields) || [];
  const matches = part.field ? fields.filter((candidate) => candidate.name === part.field) : [];
  const field = part.field && occurrence > 1 ? matches[occurrence - 1] : part.field ? fieldByName.get(part.field) : undefined;
  const key = part.fieldKey || field?.fieldKey || part.field || part.name || "";
  return { key, field: fieldByKey.get(key) || field };
}

export function highlightedInputKey(
  activeAdvancedOutputKey: string | null | undefined,
  formulaDependencies: Map<string, Set<string>> | undefined,
  key: string,
  advancedOutputDependencies: Set<string>,
) {
  if (!activeAdvancedOutputKey) return false;
  if (activeAdvancedOutputKey === key) return true;
  if (formulaDependencies?.get(activeAdvancedOutputKey)?.has(key)) return true;
  return advancedOutputDependencies.has(key);
}

export function resolveAdvancedFormulaText(part: QcLayoutPart, values: QcFieldValues, field?: QcTemplateMethodField) {
  const selectorKey = part.advancedFormulaValueFieldKey;
  const selectorValue = selectorKey ? String(values[selectorKey] || "").trim() : "";
  if (selectorValue && part.advancedFormulaTextMap?.[selectorValue]) return part.advancedFormulaTextMap[selectorValue];
  if (part.type === "duration_days" && part.startKey && part.endKey) return `${part.endKey} - ${part.startKey}（天）`;
  if (part.type === "duration_hours" && part.startKey && part.endKey) {
    const startHourKey = part.startHourKey || `${part.startKey}_hour`;
    const endHourKey = part.endHourKey || `${part.endKey}_hour`;
    return `${part.endKey} ${endHourKey} - ${part.startKey} ${startHourKey}（小时）`;
  }
  return part.advancedFormulaText || String(field?.formula || field?.rule || "") || undefined;
}

export function resolveAdvancedDependencyKeys(part: QcLayoutPart) {
  const keys = new Set(part.advancedDependencyFieldKeys || []);
  if (part.startKey) keys.add(part.startKey);
  if (part.endKey) keys.add(part.endKey);
  if (part.type === "duration_hours") {
    if (part.startHourKey || part.startKey) keys.add(part.startHourKey || `${part.startKey}_hour`);
    if (part.endHourKey || part.endKey) keys.add(part.endHourKey || `${part.endKey}_hour`);
  }
  for (const value of Object.values(part.advancedDependencyFieldKeyMap || {})) {
    for (const key of value) keys.add(key);
  }
  return keys;
}

export function isReadonlyReferencePart(part: QcLayoutPart, field?: QcTemplateMethodField) {
  if (!part.readonlyDisplay) return false;
  if (!(part.fieldKey || field?.fieldKey || part.field || part.name)) return false;
  return field?.attr !== "calculated";
}

export function hasAdvancedFormulaMetadata(part: QcLayoutPart) {
  return !!(part.advancedFormulaText || part.advancedFormulaTextMap || part.advancedDependencyFieldKeys?.length || part.advancedDependencyFieldKeyMap);
}

export function referenceDisplayValue(context: LayoutRenderContext, key: string) {
  const sourceKey = context.referenceSourceKeyFor?.(key);
  if (!sourceKey) return undefined;
  return context.values[sourceKey] ?? context.values[key] ?? "";
}

export function referenceFormulaText(sourceKey?: string) {
  return sourceKey ? `引用字段：${sourceKey}` : undefined;
}

export function durationValue(part: QcLayoutPart, values: QcFieldValues, unit: "days" | "hours") {
  const startKey = part.startKey;
  const endKey = part.endKey;
  if (!startKey || !endKey) return "";
  if (unit === "days") {
    const start = parseDateValue(values[startKey]);
    const end = parseDateValue(values[endKey]);
    return start == null || end == null ? "" : String(Math.max(0, Math.round((end - start) / 86400000)));
  }
  const start = parseDateHourValue(values[startKey], values[part.startHourKey || `${startKey}_hour`]);
  const end = parseDateHourValue(values[endKey], values[part.endHourKey || `${endKey}_hour`]);
  return start == null || end == null ? "" : String(Math.max(0, Math.round((end - start) / 3600000)));
}

function parseDateValue(value?: string) {
  const parts = String(value || "").slice(0, 10).split("-");
  if (parts.length !== 3) return undefined;
  const [year, month, day] = parts.map((part) => Number(part));
  if (![year, month, day].every(Number.isFinite)) return undefined;
  return Date.UTC(year, month - 1, day);
}

function parseDateHourValue(dateValue?: string, hourValue?: string) {
  const date = parseDateValue(dateValue);
  const hour = Number(String(hourValue || "").replace(/\D/g, ""));
  if (date == null || !Number.isFinite(hour) || hour < 0 || hour > 23) return undefined;
  return date + hour * 60 * 60 * 1000;
}

export function testValue(part: QcLayoutPart, test?: QcTemplateTestItem) {
  const path = part.path || part.field || "";
  let value = "";
  if (path === "standard") value = test?.standardText || "";
  else if (path === "name") value = test?.name || "";
  else if (path === "method") value = test?.methodName || "";
  if (!value) value = part.defaultValue || "";
  return part.stripPlaceholder ? value.replace(/\s*[＿_]{2,}\s*[。.]?/g, "") : value;
}

export function isFormLikePart(part: QcLayoutPart) {
  return ["line", "field", "select", "date", "duration_days", "duration_hours", "radio", "checkbox", "microbial_selected_total"].includes(part.type);
}

export function isCompactFormCell(cell: QcLayoutCell) {
  const textLength = cell.parts.filter((part) => !isFormLikePart(part)).map((part) => part.text || part.defaultValue || part.name || "").join("").trim().length;
  return cell.parts.some(isFormLikePart) && !cell.rawText?.trim() && textLength <= 12;
}

export function isShortUnitTextPart(part: QcLayoutPart | undefined) {
  const text = part?.type === "text" ? (part.text || "").trim() : "";
  return !!text && text.length <= 8 && /^[A-Za-z0-9%℃°μ/]+$/.test(text);
}

export function sectionHeadingText(part: QcLayoutPart, context: LayoutRenderContext) {
  const aliases = context.sectionAliases || {};
  const base = part.sectionRef ? aliases[part.sectionRef] : "";
  const suffix = base && part.sectionSuffix && part.sectionSuffix !== "auto" ? `${base}.${part.sectionSuffix}` : base || part.sectionSuffix;
  const section = context.test?.sequence && suffix ? `${context.test.sequence}.${suffix}` : suffix;
  return section ? `${section} ${part.text || ""}` : part.text;
}
