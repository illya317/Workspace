"use client";

import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { matchText } from "../search";
import SearchInput from "./SearchInput";

export type SelectFieldSize = "toolbar" | "compact";
export type SelectFieldOption = { value: string; label: string };

export interface SelectFieldProps {
  /** 标签文字，不传则不显示 label */
  label?: string;
  /** 下拉选项 */
  options?: SelectFieldOption[];
  value: string;
  onChange: (value: string) => void;
  /** 占位选项（value=""），不传则不显示 */
  placeholder?: string;
  disabled?: boolean;
  ariaLabel?: string;
  dataFieldKey?: string;
  /** 选项较多时显示搜索框；默认超过 6 项自动启用。搜索支持中文、拼音、首字母。 */
  searchable?: boolean;
  className?: string;
  style?: CSSProperties;
  /** 直接应用到触发框的额外 className；兼容旧 selectClassName 命名 */
  selectClassName?: string;
  size?: SelectFieldSize;
}

/**
 * 通用下拉选择器。业务层禁止手写原生 <select>：
 * - 视觉和交互统一
 * - 选项多时自动支持文本/拼音/首字母搜索
 * - 只负责 label + option list，不包含业务含义
 */
export default function SelectField({
  label,
  options = [],
  value,
  onChange,
  placeholder,
  disabled = false,
  ariaLabel,
  dataFieldKey,
  searchable,
  className,
  style,
  selectClassName,
  size = "compact",
}: SelectFieldProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLLabelElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const shouldSearch = searchable ?? options.length > 6;
  const normalizedPlaceholder = placeholder?.startsWith("全部") ? "全部" : placeholder;
  const toolbarFieldLabel = label ?? (placeholder?.startsWith("全部") ? placeholder.slice(2) : undefined);
  const valueOptions = useMemo(
    () => (normalizedPlaceholder ? [{ value: "", label: normalizedPlaceholder }, ...options] : options),
    [options, normalizedPlaceholder],
  );
  const selected = valueOptions.find((option) => option.value === value);
  const filteredOptions = useMemo(() => {
    const q = query.trim();
    if (!shouldSearch || !q) return valueOptions;
    return valueOptions.filter((option) => matchText(option.label, q) || matchText(option.value, q));
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
    if (!open) setQuery("");
    else if (shouldSearch) setTimeout(() => searchRef.current?.focus(), 0);
  }, [open, shouldSearch]);

  function choose(nextValue: string) {
    onChange(nextValue);
    setOpen(false);
  }

  const toolbarMode = size === "toolbar";
  const labelClassName = toolbarMode
    ? "inline-flex h-10 shrink-0 items-center whitespace-nowrap text-xs font-semibold leading-none text-slate-500"
    : "inline-flex h-10 shrink-0 items-center whitespace-nowrap text-gray-500";
  const triggerClassName = toolbarMode
    ? "inline-flex h-10 min-w-24 items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-0 text-left text-xs font-semibold leading-none text-slate-900 transition hover:border-slate-300 hover:bg-white focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
    : "inline-flex h-10 min-w-32 items-center justify-between rounded-lg border border-gray-200 bg-white px-2 py-0 text-left text-xs font-semibold leading-none text-slate-900 shadow-sm transition focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500";

  const rootClassName = toolbarFieldLabel
    ? "inline-flex h-10 items-center gap-1.5 align-middle"
    : "inline-block h-10 min-w-32 align-middle";

  return (
    <label ref={rootRef} style={style} className={`${rootClassName} relative text-xs ${className ?? ""}`}>
      {toolbarFieldLabel && <span className={labelClassName}>{toolbarFieldLabel}</span>}
      <span className="relative inline-block">
        <button
          type="button"
          disabled={disabled}
          aria-label={ariaLabel}
          aria-haspopup="listbox"
          aria-expanded={open}
          data-field-key={dataFieldKey}
          onClick={() => setOpen((current) => !current)}
          className={`${triggerClassName} ${selectClassName ?? ""}`}
        >
          <span className="flex min-w-0 flex-1 items-center justify-center truncate">
            <span className="truncate">{selected?.label ?? placeholder ?? "未设置"}</span>
          </span>
          <span className="ml-2 inline-flex h-full items-center text-slate-500">⌄</span>
        </button>
        {open && !disabled && (
          <div className="absolute left-0 top-[calc(100%+0.25rem)] z-50 min-w-full rounded-lg border border-slate-200 bg-white p-1 shadow-xl">
            {shouldSearch && (
              <SearchInput
                ref={searchRef}
                value={query}
                onChange={setQuery}
                placeholder="搜索..."
                size="compact"
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
                    className={`flex w-full items-center rounded-md px-2 py-1.5 text-left text-xs transition ${active ? "bg-emerald-50 font-semibold text-emerald-700" : "text-slate-700 hover:bg-slate-50"}`}
                  >
                    <span className="mr-1.5 inline-block w-3 text-center">{active ? "✓" : ""}</span>
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
    </label>
  );
}
