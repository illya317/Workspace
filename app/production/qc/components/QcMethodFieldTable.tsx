"use client";

import { useMemo, useState } from "react";
import type { QcTemplateMethodField, QcTemplateTestItem } from "@/server/services/production/qc";

interface Props {
  test: QcTemplateTestItem;
  compact?: boolean;
}

function initialValues(test: QcTemplateTestItem) {
  return Object.fromEntries(test.methodGroups.flatMap((group) => group.fields.map((field) => [field.name, ""])));
}

function displayValue(value: number | boolean | string | null) {
  if (value == null) return "";
  if (typeof value === "boolean") return value ? "符合" : "不符合";
  if (typeof value === "number") return Number.isFinite(value) ? String(Math.round(value * 10000) / 10000) : "";
  return value;
}

function calculateFormula(formula: string, values: Record<string, string>) {
  const refs = Object.keys(values).sort((a, b) => b.length - a.length);
  let expr = formula;
  for (const ref of refs) {
    if (!expr.includes(ref)) continue;
    const raw = values[ref];
    if (raw === "") return null;
    const num = Number(raw);
    if (!Number.isFinite(num)) return null;
    expr = expr.split(ref).join(String(num));
  }
  expr = expr
    .replace(/\bABS\b/g, "Math.abs")
    .replace(/\bSQRT\b/g, "Math.sqrt")
    .replace(/\bROUND\b/g, "Math.round")
    .replace(/\^/g, "**")
    .replace(/≤/g, "<=")
    .replace(/≥/g, ">=")
    .replace(/==/g, "===")
    .replace(/[^\d+\-*/().%\s<>=!&|*Mathabsroundsqrt]/g, " ");
  if (!/\d/.test(expr)) return null;
  try {
    return Function(`"use strict"; return (${expr})`)() as number | boolean;
  } catch {
    return null;
  }
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: QcTemplateMethodField;
  value: string;
  onChange: (value: string) => void;
}) {
  const calculated = field.attr === "calculated" || !!field.formula;
  return (
    <div className="flex min-h-9 items-center justify-center gap-2">
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        readOnly={calculated || field.attr === "prefilled"}
        inputMode={field.type === "number" ? "decimal" : "text"}
        className={`h-8 min-w-24 border-0 border-b border-slate-950 bg-transparent px-2 text-center text-sm outline-none ${calculated ? "text-slate-950" : ""}`}
      />
      {field.unit && <span className="text-xs text-slate-700">{field.unit}</span>}
    </div>
  );
}

export default function QcMethodFieldTable({ test, compact }: Props) {
  const [values, setValues] = useState<Record<string, string>>(() => initialValues(test));
  const computedValues = useMemo(() => {
    const next = { ...values };
    for (const group of test.methodGroups) {
      for (const field of group.fields) {
        if (!field.formula) continue;
        next[field.name] = displayValue(calculateFormula(field.formula, next));
      }
    }
    return next;
  }, [test.methodGroups, values]);

  if (test.methodGroups.length === 0) {
    return <div className="border border-slate-950 px-4 py-6 text-sm text-slate-500">该方法暂未配置字段。</div>;
  }

  return (
    <div className="space-y-4">
      {test.methodGroups.map((group) => (
        <table key={group.name} className="w-full border-collapse text-sm text-slate-950">
          <tbody>
            <tr>
              <td colSpan={compact ? 3 : 4} className="border border-slate-950 px-3 py-2 font-semibold">{group.name}</td>
            </tr>
            {group.fields.map((field) => {
              const calculated = field.attr === "calculated" || !!field.formula;
              return (
                <tr key={`${group.name}-${field.name}`}>
                  <td className="w-[28%] border border-slate-950 px-3 py-2">{field.name}</td>
                  <td className="w-[28%] border border-slate-950 px-3 py-2">
                    <FieldInput
                      field={field}
                      value={computedValues[field.name] ?? ""}
                      onChange={(value) => setValues((current) => ({ ...current, [field.name]: value }))}
                    />
                  </td>
                  {!compact && <td className="w-[16%] border border-slate-950 px-3 py-2 text-center">{calculated ? "自动计算" : "填写"}</td>}
                  <td className="border border-slate-950 px-3 py-2 text-xs text-slate-600">
                    {field.formula ? `公式：${field.formula}` : field.attr === "prefilled" ? "预填" : " "}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ))}
    </div>
  );
}
