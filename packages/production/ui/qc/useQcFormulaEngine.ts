"use client";

import { useCallback, useMemo, useState } from "react";
import type { QcTemplateMethodField, QcTemplateTestItem } from "@workspace/production/server/qc";

export type QcFieldValues = Record<string, string>;

function allFields(test: QcTemplateTestItem): QcTemplateMethodField[] {
  return test.methodGroups.flatMap((group) => group.fields);
}

function displayValue(value: boolean | number | string | null, field?: QcTemplateMethodField) {
  if (value == null) return "";
  if (typeof value === "boolean") {
    const options = field?.options?.length ? field.options : ["符合", "不符合"];
    return value ? options[0] : options[1];
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(Math.round(value * 10000) / 10000) : "";
  }
  return value;
}

function scopePrefix(fieldKey: string) {
  const parts = fieldKey.split("/");
  return parts.length >= 2 ? `${parts[0]}/${parts[1]}/` : `${fieldKey}/`;
}

function constantRuleResult(rule: string) {
  const compact = rule.replace(/\s/g, "");
  if (compact.includes("标准规定") || compact.includes("各项规定")) return null;
  if (/[<>=!&|+\-*/%^]/.test(compact)) return null;
  if (compact !== "符合" && compact !== "不符合") return null;
  if (compact.includes("不符合")) return false;
  if (compact.includes("符合")) return true;
  return null;
}

function normalizeExpression(expr: string) {
  return expr
    .replace(/≤/g, "<=")
    .replace(/≥/g, ">=")
    .replace(/（/g, "(")
    .replace(/）/g, ")")
    .replace(/\bABS\b/g, "Math.abs")
    .replace(/\bROUND\b/g, "Math.round")
    .replace(/\bSQRT\b/g, "Math.sqrt")
    .replace(/\^/g, "**")
    .replace(/(==|!=)\s*([\u4e00-\u9fffA-Za-z][\u4e00-\u9fffA-Za-z0-9_-]*)(?=\s|$|\)|&|\|)/g, '$1 "$2"')
    .replace(/(?<![=!<>])==(?![=])/g, "===")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replaceFieldRef(expr: string, name: string, value: string) {
  const tokenBoundary = "[\\u4e00-\\u9fffA-Za-z0-9_-]";
  return expr.replace(new RegExp(`(?<!${tokenBoundary})${escapeRegex(name)}(?!${tokenBoundary})`, "g"), value);
}

function evaluateFormula(
  formula: string,
  field: QcTemplateMethodField,
  fields: QcTemplateMethodField[],
  values: QcFieldValues,
) {
  const literal = field.rule ? constantRuleResult(formula) : null;
  if (literal !== null) return literal;

  const prefix = scopePrefix(field.fieldKey);
  let expr = String(formula);
  expr = expr.replace(/ALL\(([^)]+)\)/g, (_match, name: string) => {
    const nums = fields
      .filter((candidate) => candidate.fieldKey.startsWith(prefix) && candidate.name === name)
      .map((candidate) => Number(values[candidate.fieldKey]))
      .filter(Number.isFinite);
    return nums.length ? String(Math.max(...nums)) : "0";
  });

  const refs = fields
    .filter((candidate) => candidate.fieldKey.startsWith(prefix) && candidate.fieldKey !== field.fieldKey && expr.includes(candidate.name))
    .sort((a, b) => b.name.length - a.name.length);

  for (const ref of refs) {
    const raw = values[ref.fieldKey];
    if (raw == null || raw === "") return null;
    const numeric = Number(raw);
    expr = replaceFieldRef(expr, ref.name, Number.isFinite(numeric) ? String(numeric) : JSON.stringify(raw));
  }

  expr = normalizeExpression(expr);
  if (!/[\d"]/.test(expr)) return null;
  if (/[^0-9+\-*/().%\s<>=!&|*"A-Za-z_$\u4e00-\u9fff]/.test(expr)) return null;

  try {
    const result = Function(`"use strict"; return (${expr})`)() as unknown;
    if (typeof result === "boolean" || typeof result === "string") return result;
    if (typeof result === "number" && Number.isFinite(result)) return result;
  } catch {
    return null;
  }
  return null;
}

function initialValues(test: QcTemplateTestItem, saved: QcFieldValues = {}) {
  const next: QcFieldValues = { ...saved };
  for (const field of allFields(test)) {
    if (next[field.fieldKey] == null && field.defaultValue != null) {
      next[field.fieldKey] = field.defaultValue;
    }
  }
  return next;
}

function computeValues(test: QcTemplateTestItem, values: QcFieldValues) {
  const fields = allFields(test);
  const calculated = fields.filter((field) => field.attr === "calculated" && (field.formula || field.rule));
  const next = { ...values };
  const passes = Math.max(1, calculated.length);

  for (let pass = 0; pass < passes; pass += 1) {
    let changed = false;
    for (const field of calculated) {
      const result = evaluateFormula(field.formula || field.rule || "", field, fields, next);
      if (result == null) continue;
      const rendered = displayValue(result, field);
      if (next[field.fieldKey] !== rendered) {
        next[field.fieldKey] = rendered;
        changed = true;
      }
    }
    if (!changed) break;
  }
  return next;
}

export function useQcFormulaEngine(test: QcTemplateTestItem, saved: QcFieldValues = {}) {
  const [manualValues, setManualValues] = useState<QcFieldValues>(() => initialValues(test, saved));
  const values = useMemo(() => computeValues(test, manualValues), [test, manualValues]);
  const fields = useMemo(() => allFields(test), [test]);
  const fieldByName = useMemo(() => {
    const map = new Map<string, QcTemplateMethodField>();
    for (const field of fields) if (!map.has(field.name)) map.set(field.name, field);
    return map;
  }, [fields]);
  const fieldByKey = useMemo(() => new Map(fields.map((field) => [field.fieldKey, field])), [fields]);

  const setValue = useCallback((key: string, value: string) => {
    setManualValues((current) => (current[key] === value ? current : { ...current, [key]: value }));
  }, []);

  return { values, setValue, fieldByName, fieldByKey };
}
