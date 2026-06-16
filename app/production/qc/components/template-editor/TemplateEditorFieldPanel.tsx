"use client";

import { useMemo, useState } from "react";
import type { QcTemplateEditorFieldGroup, QcTemplateMethodGroup } from "@/server/services/production/qc";
import { clone } from "./editor-utils";

interface Props {
  methodGroups: QcTemplateMethodGroup[];
  fieldGroups: QcTemplateEditorFieldGroup[];
  formulaFunctions: string[];
  onChange: (groups: QcTemplateMethodGroup[]) => void;
}

function fieldNames(groups: QcTemplateMethodGroup[], library: QcTemplateEditorFieldGroup[]) {
  return Array.from(new Set([
    ...groups.flatMap((group) => group.fields.map((field) => field.name)),
    ...library.flatMap((group) => group.fields.map((field) => field.name)),
  ].filter(Boolean)));
}

function compileFormula(fn: string, a: string, b: string) {
  const avg = `((${a} + ${b}) / 2)`;
  if (fn === "SUM") return `${a} + ${b}`;
  if (fn === "AVG") return avg;
  if (fn === "SUBTRACT") return `${a} - ${b}`;
  if (fn === "DIVIDE") return `${a} / ${b}`;
  if (fn === "ABS") return `ABS(${a})`;
  if (fn === "ROUND") return `ROUND(${a})`;
  if (fn === "SD_SAMPLE") return `SQRT(((${a} - ${avg})^2 + (${b} - ${avg})^2) / 1)`;
  if (fn === "RSD") return `SQRT(((${a} - ${avg})^2 + (${b} - ${avg})^2) / 1) / ${avg} * 100`;
  if (fn === "RD") return `ABS(${a} - ${b}) / ${avg} * 100`;
  return "";
}

export default function TemplateEditorFieldPanel({ methodGroups, fieldGroups, formulaFunctions, onChange }: Props) {
  const names = useMemo(() => fieldNames(methodGroups, fieldGroups), [fieldGroups, methodGroups]);
  const [name, setName] = useState("新字段");
  const [group, setGroup] = useState(methodGroups[0]?.name || "编辑字段");
  const [attr, setAttr] = useState("fillable");
  const [type, setType] = useState("number");
  const [defaultValue, setDefaultValue] = useState("");
  const [recommendedValue, setRecommendedValue] = useState("");
  const [options, setOptions] = useState("");
  const [fn, setFn] = useState(formulaFunctions[0] || "AVG");
  const [argA, setArgA] = useState(names[0] || "");
  const [argB, setArgB] = useState(names[1] || names[0] || "");
  const formula = attr === "calculated" ? compileFormula(fn, argA, argB) : "";

  function addField() {
    const next = clone(methodGroups);
    const target = next.find((item) => item.name === group) || { name: group, fields: [] };
    if (!next.includes(target)) next.push(target);
    target.fields.push({
      name: name.trim() || "新字段",
      fieldKey: `editor/${group}/${name}`.replace(/\s+/g, "_"),
      group,
      type,
      attr,
      defaultValue: defaultValue || undefined,
      recommendedValue: recommendedValue || undefined,
      options: type === "select" ? options.split(/[，,\n]/).map((item) => item.trim()).filter(Boolean) : undefined,
      formula: formula || undefined,
    });
    onChange(next);
  }

  return (
    <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
      <div>
        <h2 className="text-sm font-semibold text-slate-900">字段定义</h2>
        <p className="mt-1 text-xs text-slate-500">预填、手填、引用和计算字段先进入草稿，不影响生产。</p>
      </div>
      <div className="max-h-36 space-y-1 overflow-y-auto rounded-md border border-slate-100 p-2">
        {methodGroups.flatMap((item) => item.fields.map((field) => (
          <div key={field.fieldKey} className="flex justify-between gap-2 rounded bg-slate-50 px-2 py-1 text-xs text-slate-600">
            <span className="truncate">{field.group} / {field.name}</span>
            <span>{field.attr || "fillable"}</span>
          </div>
        )))}
      </div>
      <div className="grid gap-2">
        <input value={name} onChange={(event) => setName(event.target.value)} className="h-9 rounded-md border border-slate-300 px-2 text-sm" placeholder="字段名" />
        <input value={group} onChange={(event) => setGroup(event.target.value)} className="h-9 rounded-md border border-slate-300 px-2 text-sm" placeholder="分组" />
        <div className="grid grid-cols-2 gap-2">
          <select value={attr} onChange={(event) => setAttr(event.target.value)} className="h-9 rounded-md border border-slate-300 px-2 text-sm">
            <option value="prefilled">预填</option>
            <option value="fillable">手填</option>
            <option value="calculated">计算引用</option>
          </select>
          <select value={type} onChange={(event) => setType(event.target.value)} className="h-9 rounded-md border border-slate-300 px-2 text-sm">
            <option value="number">数字</option>
            <option value="text">文本</option>
            <option value="select">下拉框</option>
            <option value="date">日期</option>
          </select>
        </div>
        <input value={defaultValue} onChange={(event) => setDefaultValue(event.target.value)} className="h-9 rounded-md border border-slate-300 px-2 text-sm" placeholder="默认值" />
        <input value={recommendedValue} onChange={(event) => setRecommendedValue(event.target.value)} className="h-9 rounded-md border border-slate-300 px-2 text-sm" placeholder="推荐值（灰色提示）" />
        {type === "select" && <textarea value={options} onChange={(event) => setOptions(event.target.value)} className="min-h-16 rounded-md border border-slate-300 px-2 py-1 text-sm" placeholder="下拉选项，用逗号或换行分隔" />}
        {attr === "calculated" && (
          <div className="grid gap-2 rounded-md border border-slate-200 bg-slate-50 p-2">
            <select value={fn} onChange={(event) => setFn(event.target.value)} className="h-9 rounded-md border border-slate-300 px-2 text-sm">
              {formulaFunctions.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <select value={argA} onChange={(event) => setArgA(event.target.value)} className="h-9 rounded-md border border-slate-300 px-2 text-sm">
              {names.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <select value={argB} onChange={(event) => setArgB(event.target.value)} className="h-9 rounded-md border border-slate-300 px-2 text-sm">
              {names.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <div className="break-all text-xs text-slate-500">公式：{formula || "请选择参数"}</div>
          </div>
        )}
        <button onClick={addField} className="h-9 rounded-md border border-emerald-600 bg-emerald-50 text-sm font-semibold text-emerald-800 hover:bg-emerald-100">添加字段</button>
      </div>
    </section>
  );
}
