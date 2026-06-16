"use client";

import { useEffect, useMemo, useState } from "react";
import type { QcTemplateModuleLibraryItem } from "@/server/services/production/qc";
import { moduleCategoryLabel, moduleDisplayName } from "./editor-utils";

interface Props {
  moduleLibrary: QcTemplateModuleLibraryItem[];
  value?: string;
  onChange?: (templateId: string) => void;
  onAdd?: (templateId: string) => void;
  actionLabel?: string;
  compact?: boolean;
}

function sorted(items: QcTemplateModuleLibraryItem[]) {
  return items.slice().sort((a, b) => moduleCategoryLabel(a).localeCompare(moduleCategoryLabel(b), "zh-Hans-CN") || moduleDisplayName(a).localeCompare(moduleDisplayName(b), "zh-Hans-CN"));
}

export default function TemplateModulePicker({ moduleLibrary, value, onChange, onAdd, actionLabel = "添加", compact = false }: Props) {
  const modules = useMemo(() => sorted(moduleLibrary.filter((item) => item.blocks?.length || item.id.startsWith("parents/"))), [moduleLibrary]);
  const categories = useMemo(() => Array.from(new Set(modules.map((item) => item.category))).map((category) => {
    const sample = modules.find((item) => item.category === category);
    return { category, label: sample ? moduleCategoryLabel(sample) : category };
  }).sort((a, b) => a.label.localeCompare(b.label, "zh-Hans-CN")), [modules]);
  const [localId, setLocalId] = useState(value || "");
  const selected = modules.find((item) => item.id === localId || item.templateId === localId);
  const selectedCategory = selected?.category;
  const [category, setCategory] = useState(selected?.category || categories[0]?.category || "");
  const filtered = modules.filter((item) => item.category === category);
  const selectedId = selected?.id && selected.category === category ? selected.id : filtered[0]?.id || "";
  const selectedItem = modules.find((item) => item.id === selectedId);

  useEffect(() => {
    if (value !== undefined) setLocalId(value);
  }, [value]);

  useEffect(() => {
    if (selectedCategory && selectedCategory !== category) setCategory(selectedCategory);
  }, [category, selectedCategory]);

  function chooseCategory(nextCategory: string) {
    setCategory(nextCategory);
    const first = modules.find((item) => item.category === nextCategory);
    if (first) {
      setLocalId(first.id);
      onChange?.(first.id);
    }
  }

  function chooseModule(templateId: string) {
    setLocalId(templateId);
    onChange?.(templateId);
  }

  return (
    <div className={compact ? "space-y-2" : "space-y-2 rounded-md border border-slate-200 bg-slate-50 p-2"}>
      <select value={category} onChange={(event) => chooseCategory(event.target.value)} className="h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-700">
        {categories.map((item) => <option key={item.category} value={item.category}>{item.label}</option>)}
      </select>
      <div className={onAdd ? "grid grid-cols-[minmax(0,1fr)_auto] gap-2" : ""}>
        <select value={selectedId} onChange={(event) => chooseModule(event.target.value)} className="h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-700">
          {filtered.map((item) => <option key={item.id} value={item.id}>{moduleDisplayName(item)}</option>)}
        </select>
        {onAdd && (
          <button type="button" disabled={!selectedId} onClick={() => selectedId && onAdd(selectedId)} className="h-9 rounded-md border border-emerald-600 bg-white px-3 text-sm font-semibold text-emerald-800 hover:bg-emerald-50 disabled:opacity-50">
            {actionLabel}
          </button>
        )}
      </div>
      {selectedItem && <div className="truncate text-[11px] text-slate-500">{selectedItem.templateId}</div>}
    </div>
  );
}
