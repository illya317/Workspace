"use client";

import type { CSSProperties, ReactNode, RefObject } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { matchText } from "../search";
import CheckboxField from "./CheckboxField";
import DropdownSurface, { getDropdownItemClassName } from "./DropdownSurface";
import SearchInput from "./SearchInput";

export type SelectFieldOption = { value: string; label: string; disabled?: boolean };

interface SelectFieldBaseProps {
  /** 标签文字，不传则不显示 label */
  label?: string;
  /** 下拉选项 */
  options?: SelectFieldOption[];
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
  /** 下拉面板顶部插槽 */
  dropdownHeader?: ReactNode;
  /** 下拉面板底部插槽 */
  dropdownFooter?: ReactNode;
  summaryMode?: "names" | "count";
}

export interface SingleSelectFieldProps extends SelectFieldBaseProps {
  multiple?: false;
  value: string;
  onChange: (value: string) => void;
}

export interface MultiSelectFieldProps extends SelectFieldBaseProps {
  multiple: true;
  value: string[];
  onChange: (value: string[]) => void;
}

export type SelectFieldProps = SingleSelectFieldProps | MultiSelectFieldProps;

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

function getSelectedLabel(options: SelectFieldOption[], value: string) {
  return options.find((option) => option.value === value)?.label;
}

/**
 * 通用下拉选择器。业务层禁止手写原生 <select>：
 * - 视觉和交互统一
 * - 选项多时自动支持文本/拼音/首字母搜索
 * - 只负责 label + option list，不包含业务含义
 * - 支持单选（默认）和多选（multiple=true）两种模式
 *
 * 下拉浮层行为复用内部 DropdownSurface primitive。
 */
export default function SelectField(props: SingleSelectFieldProps): React.ReactElement;
export default function SelectField(props: MultiSelectFieldProps): React.ReactElement;
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
  multiple,
  dropdownHeader,
  dropdownFooter,
  summaryMode = "names",
}: SelectFieldProps) {
  const isMulti = multiple === true;
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement | null>(null);
  const shouldSearch = searchable ?? options.length > 6;
  const normalizedPlaceholder = placeholder?.startsWith("全部") ? "全部" : placeholder;
  const toolbarFieldLabel = label ?? (placeholder?.startsWith("全部") ? placeholder.slice(2) : undefined);
  const valueOptions = useMemo<SelectFieldOption[]>(() => {
    if (isMulti || !normalizedPlaceholder) return options;
    const placeholderOption: SelectFieldOption = { value: "", label: normalizedPlaceholder };
    // 固定语义："请选择" 置顶，"全部" 置底
    if (normalizedPlaceholder === "全部") return [...options, placeholderOption];
    return [placeholderOption, ...options];
  }, [options, normalizedPlaceholder, isMulti]);

  const selectedLabel = useMemo(() => {
    if (isMulti) {
      const selected = (value as string[])
        .map((key) => getSelectedLabel(options, key))
        .filter(Boolean);
      if (summaryMode === "count") return `${selected.length}/${options.length}`;
      if (selected.length === 0) return placeholder ?? "未设置";
      if (selected.length === 1) return selected[0];
      return `${selected[0]} +`;
    }
    return getSelectedLabel(valueOptions, value as string) ?? placeholder ?? "未设置";
  }, [isMulti, options, value, valueOptions, placeholder, summaryMode]);

  const filteredOptions = useMemo(() => {
    const q = query.trim();
    if (!shouldSearch || !q) return valueOptions;
    return valueOptions.filter((option) => matchText(option.label, q) || matchText(option.value, q));
  }, [query, shouldSearch, valueOptions]);

  function chooseSingle(nextValue: string) {
    (onChange as (value: string) => void)(nextValue);
  }

  function toggleMulti(optionValue: string) {
    const current = new Set(value as string[]);
    if (current.has(optionValue)) current.delete(optionValue);
    else current.add(optionValue);
    (onChange as (value: string[]) => void)(Array.from(current));
  }

  const baseTriggerClassName = "inline-flex h-9 w-full min-w-24 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500";

  return (
    <div style={style} className={`inline-block h-9 align-middle text-xs ${className ?? ""}`}>
      <DropdownSurface
        align="right"
        className="inline-block align-middle"
        surfaceClassName="mt-0 top-[calc(100%+0.25rem)] w-max py-1"
        trigger={({ open, toggle }) => (
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
            {toolbarFieldLabel && <span className="shrink-0 text-slate-400">{toolbarFieldLabel}</span>}
            <span className="min-w-0 flex-1 truncate">{selectedLabel}</span>
            <svg
              className={`ml-auto h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        )}
      >
        {({ open, close }) => (
          <SelectFieldDropdown
            open={open}
            shouldSearch={shouldSearch}
            searchRef={searchRef}
            onQueryChange={setQuery}
          >
            {dropdownHeader}
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
                if (isMulti) {
                  const checked = (value as string[]).includes(option.value);
                  return (
                    <label
                      key={option.value || "__empty__"}
                      className={`${getDropdownItemClassName({ layout: "flex" })} text-xs ${option.disabled ? "cursor-not-allowed text-slate-400" : "cursor-pointer"}`}
                    >
                      <CheckboxField
                        checked={checked}
                        disabled={option.disabled}
                        size="sm"
                        onChange={() => {
                          if (!option.disabled) toggleMulti(option.value);
                        }}
                        className="accent-emerald-600"
                      />
                      <span className="ml-2 block whitespace-nowrap">{option.label}</span>
                    </label>
                  );
                }
                const active = option.value === value;
                return (
                  <button
                    key={option.value || "__empty__"}
                    type="button"
                    role="option"
                    aria-selected={active}
                    disabled={option.disabled}
                    onClick={() => {
                      if (option.disabled) return;
                      close();
                      chooseSingle(option.value);
                    }}
                    className={`${getDropdownItemClassName()} text-xs disabled:cursor-not-allowed disabled:text-slate-400`}
                  >
                    <span className="block whitespace-nowrap">{option.label}</span>
                  </button>
                );
              })}
              {filteredOptions.length === 0 && (
                <div className="px-4 py-2 text-xs text-gray-400">无匹配选项</div>
              )}
            </div>
            {dropdownFooter}
          </SelectFieldDropdown>
        )}
      </DropdownSurface>
    </div>
  );
}
