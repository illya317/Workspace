"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { matchText } from "../../../search";
import FloatingPortalSurface from "../common/FloatingPortalSurface";
import type { FloatingPortalAlign } from "../common/FloatingPortalSurface";
import { getFieldInputClassName } from "../form/FormStyles";
import {
  AUTOCOMPLETE_EMPTY_CLASS_NAME,
  AUTOCOMPLETE_INLINE_LIST_CLASS_NAME,
  AUTOCOMPLETE_LIST_BODY_CLASS_NAME,
  AUTOCOMPLETE_LIST_CLASS_NAME,
  getAutocompleteOptionClassName,
} from "./autocomplete-list-styles";
import { getAutocompleteOptionDisplay } from "./autocomplete-option-display";

export interface SearchableOption {
  value: string;
  label?: string;
  searchText?: string;
  subtitle?: string;
  disabled?: boolean;
}

interface SearchableOptionInputBaseProps {
  value: unknown;
  options: SearchableOption[];
  presentation?: "popover" | "inline";
  disabled?: boolean;
  onQueryChange?: (query: string) => void;
  loading?: boolean;
  placeholder?: string;
  displayValue?: string;
  emptyText?: string;
  clearLabel?: string;
  clearOnFocus?: boolean;
  closeOnSelect?: boolean;
  autoFocus?: boolean;
  maxResults?: number;
  visibleCount?: number;
  className?: string;
  inputClassName?: string;
  dropdownAlign?: FloatingPortalAlign;
  dropdownMatchTriggerWidth?: boolean;
  dropdownMinWidth?: number;
  dropdownHeader?: ReactNode;
  dropdownFooter?: ReactNode;
  onOpenChange?: (open: boolean) => void;
}

type SearchableOptionInputSingleProps = SearchableOptionInputBaseProps & {
  multiple?: false;
  onChange: (value: string | null, option?: SearchableOption) => void;
};

type SearchableOptionInputMultipleProps = SearchableOptionInputBaseProps & {
  multiple: true;
  value: unknown[];
  summaryMode?: "count";
  onChange: (value: string[], option?: SearchableOption) => void;
};

export type SearchableOptionInputProps = SearchableOptionInputSingleProps | SearchableOptionInputMultipleProps;

function normalizeValue(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value);
}

function optionLabel(option: SearchableOption) {
  return option.label ?? option.value;
}

export default function SearchableOptionInput({
  value,
  options,
  presentation = "popover",
  disabled,
  onQueryChange,
  loading = false,
  placeholder = "未设置",
  displayValue,
  emptyText = "无匹配选项",
  clearLabel = "清空",
  clearOnFocus = false,
  closeOnSelect = true,
  autoFocus = false,
  maxResults,
  visibleCount = 5,
  className,
  inputClassName,
  dropdownAlign,
  dropdownMatchTriggerWidth = true,
  dropdownMinWidth,
  dropdownHeader,
  dropdownFooter,
  onOpenChange,
  ...choiceProps
}: SearchableOptionInputProps) {
  const multiple = choiceProps.multiple === true;
  const current = normalizeValue(value);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(current);
  const [queryActive, setQueryActive] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const selectedValues = useMemo(
    () => (multiple && Array.isArray(value) ? value.map(String) : current ? [current] : []),
    [current, multiple, value],
  );
  const selectedSet = useMemo(() => new Set(selectedValues), [selectedValues]);
  const currentOption = useMemo(
    () => options.find((option) => option.value === current),
    [current, options],
  );
  const currentOptionDisplay = useMemo(
    () => currentOption ? getAutocompleteOptionDisplay(optionLabel(currentOption), currentOption.subtitle) : null,
    [currentOption],
  );
  const selectedLabels = useMemo(
    () => selectedValues
      .map((selected) => {
        const option: SearchableOption = options.find((item) => item.value === selected) ?? { value: selected };
        return getAutocompleteOptionDisplay(optionLabel(option), option.subtitle).primaryText;
      })
      .filter(Boolean),
    [options, selectedValues],
  );
  const currentLabel = multiple
    ? choiceProps.summaryMode === "count"
      ? `${selectedValues.length}/${options.length}`
      : selectedLabels.length === 0
        ? ""
        : selectedLabels.length === 1
          ? selectedLabels[0]
          : `${selectedLabels[0]} +`
    : currentOptionDisplay
      ? currentOptionDisplay.primaryText
      : current;
  const displayLabel = currentOptionDisplay ? currentLabel : displayValue ?? currentLabel;
  const listVisible = presentation === "inline" || open;
  const filterQuery = queryActive ? query : "";

  const setListOpen = useCallback((next: boolean) => {
    setOpen(next);
    onOpenChange?.(next);
  }, [onOpenChange]);

  const filteredOptions = useMemo(() => {
    const keyword = filterQuery.trim();
    const limit = maxResults ?? visibleCount;
    if (!keyword) return options.slice(0, limit);
    const directHits: SearchableOption[] = [];
    const fuzzyHits: SearchableOption[] = [];
    for (const option of options) {
      const label = optionLabel(option);
      const haystack = `${option.value} ${label} ${option.searchText ?? ""}`;
      if (matchText(label, keyword) || matchText(option.value, keyword)) directHits.push(option);
      else if (matchText(haystack, keyword)) fuzzyHits.push(option);
      if (directHits.length + fuzzyHits.length >= limit) break;
    }
    return [...directHits, ...fuzzyHits].slice(0, limit);
  }, [filterQuery, maxResults, options, visibleCount]);

  useEffect(() => {
    if (open && (multiple || queryActive)) return;
    setQuery(displayLabel);
  }, [displayLabel, multiple, open, queryActive]);

  useEffect(() => {
    setActiveIndex(0);
  }, [filterQuery]);

  useEffect(() => {
    if (!autoFocus || disabled) return;
    inputRef.current?.focus({ preventScroll: true });
    setListOpen(true);
    setQueryActive(false);
    if (multiple || clearOnFocus) setQuery("");
  }, [autoFocus, clearOnFocus, disabled, multiple, setListOpen]);

  useEffect(() => {
    if (!open || presentation === "inline") return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !panelRef.current?.contains(target)) {
        setListOpen(false);
        setQueryActive(false);
        setQuery(displayLabel);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setListOpen(false);
        setQueryActive(false);
        setQuery(displayLabel);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [displayLabel, open, presentation, setListOpen]);

  function choose(option?: SearchableOption | null) {
    if (option?.disabled) return;
    if (multiple) {
      if (!option) {
        choiceProps.onChange([]);
        setQuery("");
        setQueryActive(false);
        setListOpen(false);
        return;
      }
      const next = new Set(selectedValues);
      if (next.has(option.value)) next.delete(option.value);
      else next.add(option.value);
      choiceProps.onChange(Array.from(next), option);
      setQuery("");
      setQueryActive(false);
      setListOpen(true);
      return;
    }
    choiceProps.onChange(option?.value ?? null, option ?? undefined);
    setQuery(closeOnSelect && option ? optionLabel(option) : "");
    setQueryActive(false);
    setListOpen(!closeOnSelect);
    if (!closeOnSelect) inputRef.current?.focus({ preventScroll: true });
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!listVisible && ["ArrowDown", "Enter"].includes(event.key)) {
      setListOpen(true);
      setQueryActive(false);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, filteredOptions.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const activeOption = filteredOptions[activeIndex];
      if (activeOption) choose(activeOption);
    } else if (event.key === "Tab") {
      const trimmed = query.trim();
      const exact = filteredOptions.find((option) => option.value === trimmed || optionLabel(option) === trimmed);
      if (exact) choose(exact);
    }
  }

  const listContent = listVisible && !disabled ? (
    <>
      {dropdownHeader}
      <div className={AUTOCOMPLETE_LIST_BODY_CLASS_NAME}>
        {filteredOptions.map((option, index) => {
          const selected = selectedSet.has(option.value);
          const active = index === activeIndex;
          const optionDisplay = getAutocompleteOptionDisplay(optionLabel(option), option.subtitle);
          return (
            <button
              key={option.value}
              type="button"
              disabled={option.disabled}
              title={optionDisplay.hoverText}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => choose(option)}
              className={`${getAutocompleteOptionClassName({ active, selected })} ${option.disabled ? "cursor-not-allowed opacity-50" : ""}`}
            >
              {multiple && (
                <span
                  aria-hidden="true"
                  className={`grid size-4 shrink-0 place-items-center rounded border text-[10px] font-bold ${selected ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-300 bg-white text-transparent"}`}
                >
                  ✓
                </span>
              )}
              <span className="min-w-0 flex-1 truncate font-medium">{optionDisplay.primaryText}</span>
            </button>
          );
        })}
        {(filteredOptions.length === 0 || loading) && (
          <div className={AUTOCOMPLETE_EMPTY_CLASS_NAME}>
            {loading ? "加载中..." : emptyText}
          </div>
        )}
      </div>
      {dropdownFooter}
    </>
  ) : null;

  return (
    <div ref={rootRef} className={`relative ${className || ""}`}>
      <div className="relative">
        <input
          ref={inputRef}
          disabled={disabled}
          value={query}
          title={!multiple ? currentOptionDisplay?.hoverText : undefined}
          placeholder={placeholder}
          onFocus={() => {
            setListOpen(true);
            setQueryActive(false);
            if (multiple || clearOnFocus) setQuery("");
          }}
          onChange={(event) => {
            const next = event.target.value;
            setQuery(next);
            setQueryActive(true);
            setListOpen(true);
            onQueryChange?.(next);
          }}
          onKeyDown={handleKeyDown}
          className={
            inputClassName ||
            getFieldInputClassName("pr-9")
          }
        />
        {query && !disabled && (
          <button
            type="button"
            aria-label={clearLabel}
            onClick={() => {
              choose(null);
              inputRef.current?.focus({ preventScroll: true });
            }}
            className="absolute right-2 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            ×
          </button>
        )}
      </div>

      {presentation === "inline" && listContent ? (
        <div className={AUTOCOMPLETE_INLINE_LIST_CLASS_NAME}>{listContent}</div>
      ) : (
        <FloatingPortalSurface
          open={Boolean(listContent)}
          triggerRef={rootRef}
          surfaceRef={panelRef}
          align={dropdownAlign}
          minWidth={dropdownMinWidth}
          matchTriggerWidth={dropdownMatchTriggerWidth}
          className={AUTOCOMPLETE_LIST_CLASS_NAME}
        >
          {listContent}
        </FloatingPortalSurface>
      )}
    </div>
  );
}
