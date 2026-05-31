"use client";

import { useState, useRef, useEffect } from "react";

export interface ColumnDef {
  key: string;
  label: string;
  defaultVisible?: boolean;
  /** 必选列，不可隐藏。如科目编码、凭证号。 */
  required?: boolean;
}

interface Props {
  columns: ColumnDef[];
  visible: string[];
  onChange: (visible: string[]) => void;
}

export default function ColumnToggle({ columns, visible, onChange }: Props) {
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
        onClick={() => setOpen(!open)}
        className="rounded border border-gray-200 px-1.5 py-1 text-xs hover:bg-gray-50"
      >
        字段 ({visibleOptional.length}/{optional.length})
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 rounded border border-gray-200 bg-white p-1 shadow-lg min-w-[150px]">
          {columns.map((c) => {
            const checked = c.required || visible.includes(c.key);
            return (
              <label
                key={c.key}
                className={`flex items-center gap-1.5 rounded px-2 py-1 text-xs cursor-pointer ${
                  c.required ? "text-gray-400" : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={c.required}
                  onChange={() => toggle(c.key, c.required)}
                  className="h-3 w-3 accent-emerald-600"
                />
                {c.label}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
