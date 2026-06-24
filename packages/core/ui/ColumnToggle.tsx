"use client";

import { useState, useRef, useEffect } from "react";
import type { ReactNode } from "react";
import { getToolbarActionClassName } from "./ActionControls";
import CheckboxField from "./CheckboxField";
import { joinClassNames } from "./card-utils";

export interface ColumnDef {
  key: string;
  label: ReactNode;
  defaultVisible?: boolean;
  /** 必选列，不可隐藏。如科目编码、凭证号。 */
  required?: boolean;
}

export interface ColumnToggleProps {
  columns: ColumnDef[];
  visible: string[];
  onChange: (visible: string[]) => void;
  label?: string;
}

export default function ColumnToggle({ columns, visible, onChange, label = "字段" }: ColumnToggleProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const optional = columns.filter((c) => !c.required);
  const visibleOptional = optional.filter((c) => visible.includes(c.key));
  const defaultVisible = columns
    .filter((c) => c.required || c.defaultVisible)
    .map((c) => c.key);

  function toggle(key: string, req: boolean | undefined) {
    if (req) return;
    if (visible.includes(key)) onChange(visible.filter((k) => k !== key));
    else onChange([...visible, key]);
  }

  // 无可选列时不显示按钮
  if (optional.length === 0) return null;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={joinClassNames(getToolbarActionClassName("secondary"), "gap-2 px-3")}
      >
        <span>{label}</span>
        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600">
          {visibleOptional.length}/{optional.length}
        </span>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-2 w-56 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
            <span className="text-xs font-semibold text-slate-700">显示字段</span>
            <button
              type="button"
              onClick={() => onChange(defaultVisible)}
              className="rounded px-2 py-1 text-[11px] font-semibold text-emerald-700 transition hover:bg-emerald-50"
            >
              恢复默认
            </button>
          </div>
          <div className="max-h-72 overflow-auto p-1">
            {columns.map((c) => {
              const checked = c.required || visible.includes(c.key);
              return (
                <label
                  key={c.key}
                  className={joinClassNames(
                    "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs transition",
                    c.required ? "text-slate-400" : "text-slate-700 hover:bg-slate-50",
                  )}
                >
                  <CheckboxField
                    checked={checked}
                    disabled={c.required}
                    size="sm"
                    onChange={() => toggle(c.key, c.required)}
                    className="accent-emerald-600"
                  />
                  <span className="min-w-0 flex-1 truncate">{c.label}</span>
                  {c.required && <span className="text-[10px] font-semibold text-slate-400">必选</span>}
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
