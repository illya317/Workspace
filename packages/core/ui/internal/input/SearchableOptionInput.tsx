"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { matchText } from "../../../search";
import { getFieldInputClassName } from "../form/FormStyles";
import {
  AUTOCOMPLETE_EMPTY_CLASS_NAME,
  AUTOCOMPLETE_INLINE_LIST_CLASS_NAME,
  AUTOCOMPLETE_LIST_BODY_CLASS_NAME,
  AUTOCOMPLETE_LIST_CLASS_NAME,
  getAutocompleteOptionClassName,
} from "./autocomplete-list-styles";

export interface SearchableOption {
  value: string;
  label?: string;
  searchText?: string;
  subtitle?: string;
}

export interface SearchableOptionInputProps {
  value: unknown;
  options: SearchableOption[];
  presentation?: "popover" | "inline";
  disabled?: boolean;
  onChange: (value: string | null, option?: SearchableOption) => void;
  onQueryChange?: (query: string) => void;
  loading?: boolean;
  placeholder?: string;
  emptyText?: string;
  clearLabel?: string;
  maxResults?: number;
  visibleCount?: number;
  className?: string;
  inputClassName?: string;
}

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
  onChange,
  onQueryChange,
  loading = false,
  placeholder = "未设置",
  emptyText = "无匹配选项",
  clearLabel = "清空",
  maxResults,
  visibleCount = 5,
  className,
  inputClassName,
}: SearchableOptionInputProps) {
  const current = normalizeValue(value);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(current);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const currentOption = useMemo(
    () => options.find((option) => option.value === current),
    [current, options],
  );
  const currentLabel = currentOption ? optionLabel(currentOption) : current;
  const listVisible = presentation === "inline" || open;

  const filteredOptions = useMemo(() => {
    const keyword = query.trim();
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
  }, [maxResults, options, query, visibleCount]);

  useEffect(() => {
    setQuery(currentLabel);
  }, [currentLabel]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (!open || presentation === "inline") return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery(currentLabel);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        setQuery(currentLabel);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [currentLabel, open, presentation]);

  function choose(option?: SearchableOption | null) {
    onChange(option?.value ?? null, option ?? undefined);
    setQuery(option ? optionLabel(option) : "");
    setOpen(false);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!listVisible && ["ArrowDown", "Enter"].includes(event.key)) {
      setOpen(true);
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

  return (
    <div ref={rootRef} className={`relative ${className || ""}`}>
      <div className="relative">
        <input
          ref={inputRef}
          disabled={disabled}
          value={query}
          placeholder={placeholder}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            const next = event.target.value;
            setQuery(next);
            setOpen(true);
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
              inputRef.current?.focus();
            }}
            className="absolute right-2 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            ×
          </button>
        )}
      </div>

      {listVisible && !disabled && (
        <div className={presentation === "inline" ? AUTOCOMPLETE_INLINE_LIST_CLASS_NAME : AUTOCOMPLETE_LIST_CLASS_NAME}>
          <div className={AUTOCOMPLETE_LIST_BODY_CLASS_NAME}>
            {filteredOptions.map((option, index) => {
              const selected = option.value === current;
              const active = index === activeIndex;
              return (
                <button
                  key={option.value}
                  type="button"
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => choose(option)}
                  className={getAutocompleteOptionClassName({ active, selected })}
                >
                  <span className="min-w-0 truncate">{optionLabel(option)}</span>
                  {option.subtitle && <span className="shrink-0 text-xs text-slate-400">{option.subtitle}</span>}
                  {selected && <span className="shrink-0 text-xs font-medium text-emerald-600">已选</span>}
                </button>
              );
            })}
            {(filteredOptions.length === 0 || loading) && (
              <div className={AUTOCOMPLETE_EMPTY_CLASS_NAME}>
                {loading ? "加载中..." : emptyText}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
