"use client";

import type { CSSProperties, ReactNode } from "react";
import { useId, useMemo, useRef, useState } from "react";
import { matchText } from "../search";
import CheckboxField from "./CheckboxField";
import DropdownSurface, { getDropdownItemClassName } from "./DropdownSurface";
import FieldInputShell from "./FieldInputShell";
import { FIELD_CONTROL_SIZE_TOKENS } from "./FormStyles";
import { CONTROL_SIZES, type ControlSize } from "./interactionTokens";
import SearchInput from "./SearchInput";
import { joinClassNames } from "./card-utils";
import { useFieldContext } from "./field-context";
import { SelectFieldChevron, SelectFieldDropdown } from "./select-field-parts";

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
  visibleCount?: number;
  size?: ControlSize;
  density?: "normal" | "compact";
  appearance?: "field" | "toolbar";
  textAlign?: "left" | "center" | "right";
  visualVariant?: "default" | "paperUnderline" | "muted";
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

function getSelectedLabel(options: SelectFieldOption[], value: string) {
  return options.find((option) => option.value === value)?.label;
}

function getOptionKey(option: SelectFieldOption, index: number) {
  return `${option.value}:${option.label}:${index}`;
}

function getFieldValuePaddingClassName(size: "sm" | "md" | "lg", density: "normal" | "compact") {
  if (density === "compact") {
    if (size === "sm") return "px-2";
    if (size === "lg") return "px-3";
    return "px-2.5";
  }
  if (size === "sm") return "px-2.5";
  if (size === "lg") return "px-4";
  return "px-3";
}

const OPTION_ROW_HEIGHT_REM = 2.5;
const OPTION_ROW_CLASS_NAME = "h-10";

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
  visibleCount = 5,
  size,
  density,
  appearance = "field",
  textAlign = "left",
  visualVariant = "default",
}: SelectFieldProps) {
  const fieldContext = useFieldContext();
  const resolvedSize = size ?? (fieldContext?.size === "sm" ? "sm" : fieldContext?.size === "lg" ? "lg" : "md");
  const resolvedDensity = density ?? fieldContext?.density ?? "normal";
  const shellSize = resolvedSize === "sm" ? "sm" : resolvedSize === "lg" || resolvedSize === "xl" ? "lg" : "md";
  const toolbarMode = appearance === "toolbar";
  const labelTextClass = toolbarMode ? CONTROL_SIZES[resolvedSize].text : FIELD_CONTROL_SIZE_TOKENS[shellSize].text;
  const valueTextClass = toolbarMode ? CONTROL_SIZES[resolvedSize].text : FIELD_CONTROL_SIZE_TOKENS[shellSize].text;
  const valueLeadingClass = toolbarMode ? CONTROL_SIZES[resolvedSize].leading : FIELD_CONTROL_SIZE_TOKENS[shellSize].leading;
  const searchSize = toolbarMode ? resolvedSize : shellSize;
  const isMulti = multiple === true;
  const alignClass = textAlign === "center" ? "text-center" : textAlign === "right" ? "text-right" : "text-left";
  const paperTriggerClassName = visualVariant === "paperUnderline"
    ? "h-8 min-h-8 rounded-none border-0 border-b border-slate-950 bg-transparent px-1 text-center shadow-none disabled:opacity-100"
    : "";
  const wrapperVariantClassName = visualVariant === "paperUnderline" ? "inline-block min-w-16" : "";
  const dropdownClassName = joinClassNames(
    "inline-block align-middle",
    toolbarMode ? "" : "w-full",
    wrapperVariantClassName,
    className,
  );
  const toolbarButtonClassName = joinClassNames(
    "inline-flex min-w-24 items-center gap-2 border border-slate-200 bg-white font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500",
    CONTROL_SIZES[resolvedSize].height,
    CONTROL_SIZES[resolvedSize].radius,
    CONTROL_SIZES[resolvedSize].paddingX,
    CONTROL_SIZES[resolvedSize].text,
    CONTROL_SIZES[resolvedSize].leading,
    paperTriggerClassName,
    triggerClassName,
  );
  const fieldTriggerClassName = joinClassNames(paperTriggerClassName, triggerClassName);
  const fieldValuePaddingClassName = visualVariant === "paperUnderline"
    ? "px-1"
    : getFieldValuePaddingClassName(shellSize, resolvedDensity);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement | null>(null);
  const listboxId = useId();
  const shouldSearch = searchable === true;
  const listMaxHeight = `${Math.max(1, visibleCount) * OPTION_ROW_HEIGHT_REM}rem`;
  const normalizedPlaceholder = placeholder?.startsWith("全部") ? "全部" : placeholder;
  const toolbarFieldLabel = label ?? (placeholder?.startsWith("全部") ? placeholder.slice(2) : undefined);
  const valueOptions = useMemo<SelectFieldOption[]>(() => {
    if (isMulti || !normalizedPlaceholder) return options;
    if (options.some((option) => option.value === "")) return options;
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
      className={dropdownClassName}
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
            className={toolbarButtonClassName}
          >
            {toolbarFieldLabel && <span className={`shrink-0 ${labelTextClass} text-slate-400`}>{toolbarFieldLabel}</span>}
            <span className="min-w-0 flex-1 truncate text-left">{selectedLabel}</span>
            <span className="ml-auto"><SelectFieldChevron open={open} /></span>
          </button>
        ) : (
          <FieldInputShell
            disabled={disabled}
            size={shellSize}
            density={resolvedDensity}
            className={fieldTriggerClassName}
            style={style}
            suffix={(
              <SelectFieldChevron open={open} />
            )}
          >
            <div className={`flex h-full min-w-0 flex-1 items-center gap-2 ${fieldValuePaddingClassName}`}>
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
                className={`h-full min-w-0 flex-1 cursor-pointer caret-transparent border-0 bg-transparent p-0 ${valueTextClass} ${valueLeadingClass} ${alignClass} text-current outline-none placeholder:text-slate-400 disabled:bg-transparent disabled:text-slate-500`}
              />
            </div>
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
            <div id={listboxId} role="listbox" className="overflow-auto" style={{ maxHeight: listMaxHeight }}>
              {filteredOptions.map((option, index) => {
                if (isMulti) {
                  const checked = (value as string[]).includes(option.value);
                  return (
                    <label
                      key={getOptionKey(option, index)}
                      className={`${getDropdownItemClassName({ layout: "flex", textClassName: valueTextClass })} ${OPTION_ROW_CLASS_NAME} ${option.disabled ? "cursor-not-allowed text-slate-400" : "cursor-pointer"}`}
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
                    key={getOptionKey(option, index)}
                    type="button"
                    role="option"
                    aria-selected={active}
                    disabled={option.disabled}
                    onClick={() => {
                      if (option.disabled) return;
                      close();
                      chooseSingle(option.value);
                    }}
                    className={`${getDropdownItemClassName({ textClassName: valueTextClass })} ${OPTION_ROW_CLASS_NAME} disabled:cursor-not-allowed disabled:text-slate-400`}
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
