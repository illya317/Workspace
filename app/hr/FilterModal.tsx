"use client";

import { useState, useMemo } from "react";
import LocalAutocompleteInput from "./LocalAutocompleteInput";
import type { FieldConfig } from "./types";

interface FilterCondition {
  field: string;
  value: string;
}

interface Props {
  open: boolean;
  fields: FieldConfig[];
  items: any[];
  onClose: () => void;
  onApply: (conditions: Record<string, string>) => void;
  onReset: () => void;
}

export default function FilterModal({ open, fields, items, onClose, onApply, onReset }: Props) {
  const [conditions, setConditions] = useState<FilterCondition[]>([{ field: "", value: "" }]);

  const usableFields = fields.filter((f) => !f.hidden && f.type !== "textarea");

  const fieldOptions = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const f of usableFields) {
      const vals = new Set<string>();
      for (const item of items) {
        const v = item[f.key];
        if (v !== null && v !== undefined && v !== "") {
          vals.add(String(v));
        }
      }
      map[f.key] = Array.from(vals).sort();
    }
    return map;
  }, [usableFields, items]);

  if (!open) return null;

  function updateCondition(index: number, patch: Partial<FilterCondition>) {
    setConditions((prev) =>
      prev.map((c, i) => (i === index ? { ...c, ...patch } : c))
    );
  }

  function addCondition() {
    setConditions((prev) => [...prev, { field: "", value: "" }]);
  }

  function removeCondition(index: number) {
    setConditions((prev) => prev.filter((_, i) => i !== index));
  }

  function handleApply() {
    const result: Record<string, string> = {};
    for (const c of conditions) {
      if (c.field && c.value !== "" && c.value !== undefined && c.value !== null) {
        result[c.field] = c.value;
      }
    }
    onApply(result);
    onClose();
  }

  function handleReset() {
    setConditions([{ field: "", value: "" }]);
    onReset();
    onClose();
  }

  function getInputType(fieldKey: string) {
    const f = usableFields.find((x) => x.key === fieldKey);
    if (!f) return "text";
    if (f.type === "date") return "date";
    if (f.type === "number") return "number";
    if (f.type === "boolean") return "boolean";
    return "text";
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-800">高级筛选</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>

        <div className="space-y-3 max-h-[50vh] overflow-auto pr-1">
          {conditions.map((c, i) => {
            const inputType = getInputType(c.field);
            const options = c.field ? fieldOptions[c.field] || [] : [];
            return (
              <div key={i} className="flex items-center gap-2">
                <select
                  value={c.field}
                  onChange={(e) => updateCondition(i, { field: e.target.value, value: "" })}
                  className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                >
                  <option value="">选择字段</option>
                  {usableFields.map((f) => (
                    <option key={f.key} value={f.key}>{f.label}</option>
                  ))}
                </select>

                {inputType === "boolean" ? (
                  <select
                    value={c.value}
                    onChange={(e) => updateCondition(i, { value: e.target.value })}
                    className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    <option value="">请选择</option>
                    <option value="true">是</option>
                    <option value="false">否</option>
                  </select>
                ) : inputType === "date" ? (
                  <input
                    type="date"
                    value={c.value}
                    onChange={(e) => updateCondition(i, { value: e.target.value })}
                    className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-700 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                ) : options.length > 0 ? (
                  <LocalAutocompleteInput
                    value={c.value}
                    onChange={(v) => updateCondition(i, { value: v })}
                    options={options}
                    placeholder="输入搜索..."
                  />
                ) : (
                  <input
                    type="text"
                    value={c.value}
                    onChange={(e) => updateCondition(i, { value: e.target.value })}
                    placeholder="输入值"
                    className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-700 placeholder-gray-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                )}

                <button
                  onClick={() => removeCondition(i)}
                  className="shrink-0 text-gray-400 hover:text-red-500"
                  title="移除"
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>

        <button
          onClick={addCondition}
          className="mt-3 text-sm text-emerald-600 hover:text-emerald-700"
        >
          + 添加条件
        </button>

        <div className="mt-5 flex justify-end gap-3">
          <button
            onClick={handleReset}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            重置
          </button>
          <button
            onClick={handleApply}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
          >
            应用
          </button>
        </div>
      </div>
    </div>
  );
}
