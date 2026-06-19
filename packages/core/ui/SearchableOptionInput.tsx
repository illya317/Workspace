"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { matchText } from "../search";

export interface SearchableOption {
  value: string;
  label?: string;
  searchText?: string;
  subtitle?: string;
}

export interface SearchableOptionInputProps {
  value: unknown;
  options: SearchableOption[];
  disabled?: boolean;
  onChange: (value: string | null, option?: SearchableOption) => void;
  placeholder?: string;
  emptyText?: string;
  clearLabel?: string;
  maxResults?: number;
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
  disabled,
  onChange,
  placeholder = "未设置",
  emptyText = "无匹配选项",
  clearLabel = "清空",
  maxResults = 80,
  className,
  inputClassName,
}: SearchableOptionInputProps) {
  const current = normalizeValue(value);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(current);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const filteredOptions = useMemo(() => {
    const keyword = query.trim();
    if (!keyword) return options.slice(0, maxResults);
    const directHits: SearchableOption[] = [];
    const fuzzyHits: SearchableOption[] = [];
    for (const option of options) {
      const label = optionLabel(option);
      const haystack = `${option.value} ${label} ${option.searchText ?? ""}`;
      if (matchText(label, keyword) || matchText(option.value, keyword)) directHits.push(option);
      else if (matchText(haystack, keyword)) fuzzyHits.push(option);
      if (directHits.length + fuzzyHits.length >= maxResults) break;
    }
    return [...directHits, ...fuzzyHits].slice(0, maxResults);
  }, [maxResults, options, query]);

  useEffect(() => {
    setQuery(current);
  }, [current]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery(current);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        setQuery(current);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [current, open]);

  function choose(option?: SearchableOption | null) {
    onChange(option?.value ?? null, option ?? undefined);
    setQuery(option?.value ?? "");
    setOpen(false);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!open && ["ArrowDown", "Enter"].includes(event.key)) {
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
      choose(filteredOptions[activeIndex]);
    } else if (event.key === "Tab") {
      const exact = filteredOptions.find((option) => option.value === query.trim());
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
            setQuery(event.target.value);
            setOpen(true);
          }}
          onKeyDown={handleKeyDown}
          className={
            inputClassName ||
            "w-full rounded-md border border-slate-300 bg-white px-3 py-2 pr-9 text-sm text-slate-800 shadow-sm outline-none placeholder:text-slate-400 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 disabled:bg-slate-100 disabled:text-slate-500"
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

      {open && !disabled && (
        <div className="absolute left-0 top-[calc(100%+0.35rem)] z-50 w-full rounded-lg border border-slate-200 bg-white p-2 shadow-xl">
          <div className="max-h-80 overflow-auto">
            {filteredOptions.map((option, index) => {
              const selected = option.value === current;
              const active = index === activeIndex;
              return (
                <button
                  key={option.value}
                  type="button"
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => choose(option)}
                  className={`flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm transition ${
                    active
                      ? "bg-emerald-50 text-emerald-800"
                      : "text-slate-800 hover:bg-slate-50"
                  }`}
                >
                  <span className="min-w-0 truncate">{optionLabel(option)}</span>
                  {option.subtitle && <span className="shrink-0 text-xs text-slate-400">{option.subtitle}</span>}
                  {selected && <span className="shrink-0 text-xs font-medium text-emerald-600">已选</span>}
                </button>
              );
            })}
            {filteredOptions.length === 0 && (
              <div className="rounded-md border border-dashed border-slate-200 px-3 py-8 text-center text-sm text-slate-400">
                {emptyText}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
