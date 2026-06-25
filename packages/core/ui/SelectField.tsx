"use client";

import type { CSSProperties, ReactNode, RefObject } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { matchText } from "../search";
import DropdownSurface, { getDropdownItemClassName } from "./DropdownSurface";
import SearchInput from "./SearchInput";

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
  /** 直接应用到触发框的额外 className */
  triggerClassName?: string;
}

function SelectFieldDropdown({
  open,
  shouldSearch,
  searchRef,
  onQueryChange,
  children,
}: {
  open: boolean;
  shouldSearch: boolean;
  searchRef: RefObject<HTMLInputElement | null>;
  onQueryChange: (value: string) => void;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    if (shouldSearch) setTimeout(() => searchRef.current?.focus(), 0);
    return () => onQueryChange("");
  }, [open, shouldSearch, onQueryChange, searchRef]);

  return children;
}

/**
 * 通用下拉选择器。业务层禁止手写原生 <select>：
 * - 视觉和交互统一
 * - 选项多时自动支持文本/拼音/首字母搜索
 * - 只负责 label + option list，不包含业务含义
 *
 * 下拉浮层行为复用内部 DropdownSurface primitive。
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
  triggerClassName,
}: SelectFieldProps) {
  const [query, setQuery] = useState("");
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

  function choose(nextValue: string) {
    onChange(nextValue);
  }

  const labelClassName = "inline-flex h-10 shrink-0 items-center whitespace-nowrap text-xs font-semibold leading-none text-slate-500";
  const baseTriggerClassName = "inline-flex h-10 min-w-24 items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-0 text-left text-xs font-semibold leading-none text-slate-900 transition hover:border-slate-300 hover:bg-white focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500";

  const rootClassName = toolbarFieldLabel
    ? "inline-flex h-10 items-center gap-1.5 align-middle"
    : "inline-block h-10 min-w-32 align-middle";

  const dropdownRootClassName = toolbarFieldLabel
    ? "inline-flex items-center gap-1.5"
    : "inline-block";

  return (
    <label style={style} className={`${rootClassName} relative text-xs ${className ?? ""}`}>
      <DropdownSurface
        align="left"
        className={dropdownRootClassName}
        surfaceClassName="mt-0 top-[calc(100%+0.25rem)] min-w-full py-1"
        trigger={({ open, toggle }) => (
          <>
            {toolbarFieldLabel && <span className={labelClassName}>{toolbarFieldLabel}</span>}
            <button
              type="button"
              disabled={disabled}
              aria-label={ariaLabel}
              aria-haspopup="listbox"
              aria-expanded={open}
              data-field-key={dataFieldKey}
              onClick={toggle}
              className={`${baseTriggerClassName} ${triggerClassName ?? ""}`}
            >
              <span className="flex min-w-0 flex-1 items-center justify-center truncate">
                <span className="truncate">{selected?.label ?? placeholder ?? "未设置"}</span>
              </span>
              <span className="ml-2 inline-flex h-full items-center text-slate-500">⌄</span>
            </button>
          </>
        )}
      >
        {({ open, close }) => (
          <SelectFieldDropdown
            open={open}
            shouldSearch={shouldSearch}
            searchRef={searchRef}
            onQueryChange={setQuery}
          >
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
                    onClick={() => {
                      close();
                      choose(option.value);
                    }}
                    className={getDropdownItemClassName()}
                  >
                    <span className="block truncate">{option.label}</span>
                  </button>
                );
              })}
              {filteredOptions.length === 0 && (
                <div className="px-4 py-2 text-sm text-gray-400">无匹配选项</div>
              )}
            </div>
          </SelectFieldDropdown>
        )}
      </DropdownSurface>
    </label>
  );
}
