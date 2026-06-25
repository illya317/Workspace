"use client";

import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { matchText } from "../search";
import SearchInput from "./SearchInput";
import type { SelectFieldOption } from "./SelectField";
import { joinClassNames } from "./card-utils";

export interface ToolbarSelectFilterProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options?: SelectFieldOption[];
  placeholder?: string;
  disabled?: boolean;
  searchable?: boolean;
  className?: string;
  triggerClassName?: string;
  style?: CSSProperties;
}

export default function ToolbarSelectFilter({
  label,
  value,
  onChange,
  options = [],
  placeholder = "全部",
  disabled = false,
  searchable,
  className = "",
  triggerClassName = "",
  style,
}: ToolbarSelectFilterProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLSpanElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const shouldSearch = searchable ?? options.length > 6;
  const valueOptions = useMemo(
    () => [{ value: "", label: placeholder }, ...options],
    [options, placeholder],
  );
  const selected = valueOptions.find((option) => option.value === value);
  const filteredOptions = useMemo(() => {
    const key = query.trim();
    if (!shouldSearch || !key) return valueOptions;
    return valueOptions.filter((option) => matchText(option.label, key) || matchText(option.value, key));
  }, [query, shouldSearch, valueOptions]);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }
    if (shouldSearch) setTimeout(() => searchRef.current?.focus(), 0);
  }, [open, shouldSearch]);

  function choose(nextValue: string) {
    onChange(nextValue);
    setOpen(false);
  }

  return (
    <span
      ref={rootRef}
      style={style}
      className={joinClassNames("relative inline-flex h-9 items-center gap-1.5 align-middle text-xs", className)}
    >
      <span className="shrink-0 whitespace-nowrap font-semibold leading-none text-slate-500">{label}</span>
      <button
        type="button"
        disabled={disabled}
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={joinClassNames(
          "inline-flex h-9 min-w-24 max-w-40 items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-2.5 text-left text-xs font-semibold leading-none text-slate-900 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500",
          triggerClassName,
        )}
      >
        <span className="min-w-0 truncate">{selected?.label ?? placeholder}</span>
        <span aria-hidden="true" className="shrink-0 text-slate-400">⌄</span>
      </button>
      {open && !disabled && (
        <div className="absolute left-0 top-[calc(100%+0.25rem)] z-50 min-w-full rounded-lg border border-slate-200 bg-white p-1 shadow-xl">
          {shouldSearch && (
            <SearchInput
              ref={searchRef}
              value={query}
              onChange={setQuery}
              placeholder="搜索..."
              className="mb-1"
            />
          )}
          <div role="listbox" className="max-h-64 overflow-auto">
            {filteredOptions.map((option) => {
              const active = option.value === value;
              return (
                <button
                  key={option.value || "__empty__"}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => choose(option.value)}
                  className={joinClassNames(
                    "flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs transition",
                    active ? "bg-emerald-50 font-semibold text-emerald-700" : "text-slate-700 hover:bg-slate-50",
                  )}
                >
                  <span className="inline-block w-3 shrink-0 text-center">{active ? "✓" : ""}</span>
                  <span className="truncate">{option.label}</span>
                </button>
              );
            })}
            {filteredOptions.length === 0 && (
              <div className="px-3 py-2 text-xs text-slate-400">无匹配选项</div>
            )}
          </div>
        </div>
      )}
    </span>
  );
}
