"use client";

import { CheckCircle2, Copy, Download, Plus, Save, Send, ShieldCheck } from "lucide-react";
import type { BodySurfaceCommandSpec } from "@workspace/core/ui";
import type { FieldFormulaRow, FormulaComputation } from "./model";

type FormulaProfile = {
  functionName: string;
  parameters: string[];
  expandedFormula: string;
};

const actionIcons: Record<string, typeof Save> = {
  save: Save,
  copy: Copy,
  export: Download,
  "request-publish": Send,
  "mark-published": ShieldCheck,
};

export function FormulaWorkbench({
  actions,
  canEdit,
  formulaComputation,
  rows,
  onAddFormula,
  onChangeFormula,
}: {
  actions: BodySurfaceCommandSpec[];
  canEdit: boolean;
  formulaComputation: FormulaComputation;
  rows: FieldFormulaRow[];
  onAddFormula: () => void;
  onChangeFormula: (key: string, formula: string) => void;
}) {
  const formulaRows = rows.filter((row) => row.formula || row.mode === "formula");
  const errorRows = formulaRows.filter((row) => row.error);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-900">公式工作台</div>
          <div className="mt-1 text-xs text-slate-500">
            {rows.length} 个字段 · {formulaRows.length} 个公式 · {errorRows.length ? `${errorRows.length} 个错误` : "检查通过"}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {actions.map((action) => (
            <ToolbarAction key={action.key} action={action} />
          ))}
          <button
            type="button"
            className="inline-flex h-9 items-center gap-2 rounded-md bg-emerald-600 px-3 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
            disabled={!canEdit}
            onClick={onAddFormula}
          >
            <Plus size={15} strokeWidth={2.2} />
            新增公式
          </button>
        </div>
      </div>

      <div className={`rounded-md border px-3 py-2 text-sm ${formulaComputation.errorCount ? "border-amber-300 bg-amber-50 text-amber-800" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
        公式检查：{formulaComputation.adapter} · {formulaComputation.errorCount ? `${formulaComputation.errorCount} 个错误` : "通过"}
      </div>

      <div className="overflow-hidden rounded-md border border-slate-200">
        <div className="grid grid-cols-[minmax(220px,1.2fr)_minmax(170px,0.8fr)_minmax(220px,1fr)_minmax(300px,1.35fr)_minmax(160px,0.7fr)] bg-slate-50 text-xs font-semibold text-slate-500">
          <div className="px-3 py-2">字段</div>
          <div className="px-3 py-2">函数</div>
          <div className="px-3 py-2">参数</div>
          <div className="px-3 py-2">公式</div>
          <div className="px-3 py-2">检查</div>
        </div>
        {formulaRows.length ? formulaRows.map((row) => {
          const profile = describeFormula(row.formula);
          return (
            <div key={row.key} className="grid grid-cols-[minmax(220px,1.2fr)_minmax(170px,0.8fr)_minmax(220px,1fr)_minmax(300px,1.35fr)_minmax(160px,0.7fr)] items-start border-t border-slate-100 text-sm">
              <div className="min-w-0 px-3 py-3">
                <div className="truncate font-semibold text-slate-900">{row.label}</div>
                <div className="mt-0.5 truncate font-mono text-xs text-slate-500">{row.key}</div>
                <div className="mt-1 text-xs text-slate-400">{row.type || "-"} · {row.unit || "-"}</div>
              </div>
              <div className="px-3 py-3 text-slate-800">{profile.functionName}</div>
              <div className="px-3 py-3">
                <div className="font-mono text-xs text-slate-700">参数（{profile.parameters.join("，") || "-"}）</div>
              </div>
              <div className="px-3 py-3">
                <textarea
                  className="min-h-16 w-full resize-y rounded-md border border-slate-200 bg-white px-2 py-2 font-mono text-xs leading-5 text-slate-900 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100 disabled:bg-slate-50 disabled:text-slate-500"
                  value={row.formula}
                  placeholder="例如 AVG(x1, x2)"
                  disabled={!canEdit}
                  onChange={(event) => onChangeFormula(row.key, event.target.value)}
                />
                <div className="mt-1 line-clamp-2 font-mono text-[11px] leading-4 text-slate-500">公式 {profile.expandedFormula || "-"}</div>
              </div>
              <div className="px-3 py-3">
                {row.error ? (
                  <div className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs font-medium text-red-700">{row.error}</div>
                ) : (
                  <div className="inline-flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
                    <CheckCircle2 size={13} strokeWidth={2.2} />
                    {row.computedValue}
                  </div>
                )}
              </div>
            </div>
          );
        }) : (
          <div className="border-t border-slate-100 px-3 py-8 text-center text-sm text-slate-500">暂无公式，点击右上角新增。</div>
        )}
      </div>
    </div>
  );
}

function ToolbarAction({ action }: { action: BodySurfaceCommandSpec }) {
  const Icon = actionIcons[action.key] ?? Save;
  const primary = action.variant === "primary";
  return (
    <button
      type="button"
      className={[
        "inline-flex h-9 items-center gap-2 rounded-md border px-3 text-xs font-semibold shadow-sm transition disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400",
        primary ? "border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50",
      ].join(" ")}
      disabled={action.disabled}
      onClick={() => action.onClick?.()}
    >
      <Icon size={15} strokeWidth={2.1} />
      {action.label}
    </button>
  );
}

function describeFormula(formula: string): FormulaProfile {
  const text = formula.trim();
  const compact = text.replace(/\s+/g, "");
  const call = text.match(/^([A-Za-z][A-Za-z0-9_]*)\s*\((.*)\)$/);
  if (call) {
    const name = call[1].toUpperCase();
    return { functionName: `${functionLabel(name)}函数`, parameters: splitArguments(call[2]), expandedFormula: expandedFunctionFormula(name, splitArguments(call[2])) || text };
  }
  const rd = compact.match(/^ABS\((.+)-(.+)\)\/(.+)\*100$/i);
  if (rd) return { functionName: "RD函数", parameters: [rd[1], rd[2]], expandedFormula: "ABS(a - b) / AVG(a, b) * 100" };
  const avg = compact.match(/^\(?(.+(?:\+.+)+)\)?\/(\d+)$/);
  if (avg) return { functionName: "AVG函数", parameters: avg[1].split("+"), expandedFormula: "SUM(args) / N" };
  const diff = compact.match(/^([^()+*/<>=!&|]+)-([^()+*/<>=!&|]+)$/);
  if (diff) return { functionName: "DIFF函数", parameters: [diff[1], diff[2]], expandedFormula: "a - b" };
  if (compact.includes("*") || compact.includes("/")) return { functionName: "公式模板", parameters: collectReferences(text), expandedFormula: text };
  if (text) return { functionName: "引用/常量", parameters: [text], expandedFormula: text };
  return { functionName: "自定义公式", parameters: [], expandedFormula: "" };
}

function functionLabel(name: string) {
  if (name === "AVG" || name === "AVERAGE" || name === "MEAN") return "AVG";
  if (name === "RD") return "RD";
  if (name === "RSD") return "RSD";
  if (name === "DIFF" || name === "NET") return "DIFF";
  if (name === "UPPER") return "上限";
  if (name === "LOWER") return "下限";
  return name;
}

function expandedFunctionFormula(name: string, args: string[]) {
  if (name === "AVG" || name === "AVERAGE" || name === "MEAN") return `(${args.join(" + ")}) / ${args.length}`;
  if (name === "RD" && args.length >= 2) return `ABS(${args[0]} - ${args[1]}) / AVG(${args[0]}, ${args[1]}) * 100`;
  if (name === "RSD") return "STDEV.S(args) / AVG(args) * 100";
  if ((name === "DIFF" || name === "NET") && args.length >= 2) return `${args[0]} - ${args[1]}`;
  if (name === "UPPER" && args.length >= 2) return `${args[0]} * (1 + ${args[1]} / 100)`;
  if (name === "LOWER" && args.length >= 2) return `${args[0]} * (1 - ${args[1]} / 100)`;
  return "";
}

function splitArguments(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function collectReferences(value: string) {
  return Array.from(new Set(value.match(/[\u4e00-\u9fa5A-Za-z_][\u4e00-\u9fa5A-Za-z0-9_/-]*/g) ?? [])).slice(0, 8);
}
