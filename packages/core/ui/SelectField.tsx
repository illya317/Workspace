"use client";

import type { CSSProperties, ReactNode, RefObject } from "react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { matchText } from "../search";
import CheckboxField from "./CheckboxField";
import DropdownSurface, { getDropdownItemClassName } from "./DropdownSurface";
import FieldInputShell from "./FieldInputShell";
import { FIELD_CONTROL_SIZE_TOKENS } from "./FormStyles";
import { CONTROL_SIZES, type ControlSize } from "./interactionTokens";
import SearchInput from "./SearchInput";

export type SelectFieldOption = { value: string; label: string; disabled?: boolean };

interface SelectFieldBaseProps {
  label?: string;
  options?: SelectFieldOption[];
  placeholder?: string;
  disabled?: boolean;
  ariaLabel?: string;
  dataFieldKey?: string;
  searchable?: boolean;
  className?: string;
  style?: CSSProperties;
  triggerClassName?: string;
  dropdownHeader?: ReactNode;
  dropdownFooter?: ReactNode;
  summaryMode?: "names" | "count";
  size?: ControlSize;
  density?: "normal" | "compact";
  appearance?: "field" | "toolbar";
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
  size = "md",
  density = "normal",
  appearance = "field",
}: SelectFieldProps) {
  const shellSize = size === "sm" ? "sm" : size === "lg" || size === "xl" ? "lg" : "md";
  const toolbarMode = appearance === "toolbar";
  const labelTextClass = toolbarMode ? CONTROL_SIZES[size].text : FIELD_CONTROL_SIZE_TOKENS[shellSize].text;
  const valueTextClass = toolbarMode ? CONTROL_SIZES[size].text : FIELD_CONTROL_SIZE_TOKENS[shellSize].text;
  const valueLeadingClass = toolbarMode ? CONTROL_SIZES[size].leading : FIELD_CONTROL_SIZE_TOKENS[shellSize].leading;
  const searchSize = toolbarMode ? size : shellSize;
  const isMulti = multiple === true;
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement | null>(null);
  const listboxId = useId();
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

  return (
    <DropdownSurface
      align="right"
      className={`inline-block align-middle ${toolbarMode ? "" : "w-full"} ${className ?? ""}`}
      surfaceClassName={toolbarMode ? "mt-1 w-max min-w-full py-1" : "mt-1 w-full py-1"}
      trigger={({ open, toggle }) => (
        toolbarMode ? (
          <button
            type="button"
            disabled={disabled}
            aria-label={ariaLabel}
            role="combobox"
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-controls={listboxId}
            data-field-key={dataFieldKey}
            onClick={toggle}
            style={style}
            className={`inline-flex ${CONTROL_SIZES[size].height} min-w-24 items-center gap-2 ${CONTROL_SIZES[size].radius} border border-slate-200 bg-white ${CONTROL_SIZES[size].paddingX} ${CONTROL_SIZES[size].text} ${CONTROL_SIZES[size].leading} font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 ${triggerClassName ?? ""}`}
          >
            {toolbarFieldLabel && <span className={`shrink-0 ${labelTextClass} text-slate-400`}>{toolbarFieldLabel}</span>}
            <span className="min-w-0 flex-1 truncate text-left">{selectedLabel}</span>
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
        ) : (
          <FieldInputShell
            disabled={disabled}
            size={shellSize}
            density={density}
            className={triggerClassName}
            style={style}
            suffix={(
              <svg
                className={`h-4 w-4 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            )}
          >
            {toolbarFieldLabel && <span className={`shrink-0 ${labelTextClass} text-slate-400`}>{toolbarFieldLabel}</span>}
            <input
              type="text"
              readOnly
              value={selectedLabel}
              placeholder={placeholder}
              aria-label={ariaLabel}
              role="combobox"
              aria-haspopup="listbox"
              aria-expanded={open}
              aria-controls={listboxId}
              data-field-key={dataFieldKey}
              onClick={() => {
                if (!disabled) toggle();
              }}
              onKeyDown={(e) => {
                if (disabled) return;
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  toggle();
                }
              }}
              disabled={disabled}
              className={`h-full min-w-0 flex-1 cursor-pointer caret-transparent border-0 bg-transparent p-0 ${valueTextClass} ${valueLeadingClass} text-current outline-none placeholder:text-slate-400 disabled:bg-transparent disabled:text-slate-500`}
            />
          </FieldInputShell>
        )
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
                size={searchSize}
                className="mb-1"
              />
            )}
            <div id={listboxId} role="listbox" className="max-h-64 overflow-auto">
              {filteredOptions.map((option) => {
                if (isMulti) {
                  const checked = (value as string[]).includes(option.value);
                  return (
                    <label
                      key={option.value || "__empty__"}
                      className={`${getDropdownItemClassName({ layout: "flex", textClassName: valueTextClass })} ${option.disabled ? "cursor-not-allowed text-slate-400" : "cursor-pointer"}`}
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
                    className={`${getDropdownItemClassName({ textClassName: valueTextClass })} disabled:cursor-not-allowed disabled:text-slate-400`}
                  >
                    <span className="block whitespace-nowrap">{option.label}</span>
                  </button>
                );
              })}
              {filteredOptions.length === 0 && (
                <div className={`px-4 py-2 ${valueTextClass} text-gray-400`}>无匹配选项</div>
              )}
            </div>
            {dropdownFooter}
          </SelectFieldDropdown>
        )}
      </DropdownSurface>
  );
}
