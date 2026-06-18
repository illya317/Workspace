"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export interface PickerOption {
  label: string;
  value: string;
}

interface OptionPickerProps {
  value: unknown;
  options: PickerOption[];
  disabled?: boolean;
  onChange: (value: string | null) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  commonValues?: string[];
  visibleCount?: number;
  className?: string;
  buttonClassName?: string;
  popoverClassName?: string;
}

function normalizeValue(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value);
}

function uniqOptions(options: PickerOption[]) {
  const seen = new Set<string>();
  const next: PickerOption[] = [];
  for (const option of options) {
    if (seen.has(option.value)) continue;
    seen.add(option.value);
    next.push(option);
  }
  return next;
}

export default function OptionPicker({
  value,
  options,
  disabled,
  onChange,
  placeholder = "未设置",
  searchPlaceholder = "搜索选项",
  commonValues,
  visibleCount = 6,
  className,
  buttonClassName,
  popoverClassName,
}: OptionPickerProps) {
  const current = normalizeValue(value);
  const [open, setOpen] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);

  const normalizedOptions = useMemo(() => uniqOptions(options), [options]);
  const valueToLabel = useMemo(() => {
    const map = new Map<string, string>();
    for (const option of normalizedOptions) map.set(option.value, option.label);
    return map;
  }, [normalizedOptions]);
  const hasExplicitEmptyOption = valueToLabel.has("");

  const visibleOptions = useMemo(() => {
    if (commonValues?.length) {
      const commonSet = new Set(commonValues);
      return normalizedOptions.filter((option) => commonSet.has(option.value));
    }
    return normalizedOptions.slice(0, visibleCount);
  }, [commonValues, normalizedOptions, visibleCount]);

  const moreOptions = useMemo(() => {
    const visibleSet = new Set(visibleOptions.map((option) => option.value));
    return normalizedOptions.filter((option) => !visibleSet.has(option.value));
  }, [normalizedOptions, visibleOptions]);

  const filteredMore = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return moreOptions;
    return moreOptions.filter((option) => {
      return option.label.toLowerCase().includes(keyword) || option.value.toLowerCase().includes(keyword);
    });
  }, [moreOptions, query]);

  const isUnset = current === "" && !hasExplicitEmptyOption;
  const currentLabel = isUnset ? "" : (valueToLabel.get(current) ?? current);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function choose(next: string | null) {
    onChange(next);
    setOpen(false);
    setShowMore(false);
    setQuery("");
  }

  return (
    <div ref={rootRef} className={`relative ${className || ""}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((next) => !next)}
        className={buttonClassName || "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-left text-sm text-slate-800 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:bg-slate-100 disabled:text-slate-500"}
      >
        <span className={currentLabel ? "text-slate-900" : "text-slate-400"}>{currentLabel || placeholder}</span>
      </button>

      {open && !disabled && (
        <div className={popoverClassName || "absolute left-0 top-[calc(100%+0.35rem)] z-50 w-full min-w-80 rounded-lg border border-slate-200 bg-white p-3 shadow-xl"}>
          <div className="mb-3 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => choose(null)}
              className={`rounded-md border px-3 py-1.5 text-xs font-medium transition ${isUnset ? "border-slate-300 bg-slate-100 text-slate-900" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
            >
              {placeholder}
            </button>
            {moreOptions.length > 0 && (
              <button
                type="button"
                onClick={() => setShowMore((next) => !next)}
                className={`rounded-md border px-3 py-1.5 text-xs font-medium transition ${
                  showMore
                    ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                更多
              </button>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2">
            {visibleOptions.map((option) => {
              const selected = !isUnset && option.value === current;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => choose(option.value)}
                  className={`rounded-md border px-3 py-2 text-sm font-medium transition ${
                    selected
                      ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                      : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>

          {showMore && moreOptions.length > 0 && (
            <div className="mt-3 border-t border-slate-100 pt-3">
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={searchPlaceholder}
                className="mb-3 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
              />
              <div className="max-h-64 overflow-auto pr-1">
                <div className="grid grid-cols-3 gap-2">
                  {filteredMore.map((option) => {
                    const selected = !isUnset && option.value === current;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => choose(option.value)}
                        className={`rounded-md border px-2 py-2 text-sm transition ${
                          selected
                            ? "border-emerald-500 bg-emerald-50 font-medium text-emerald-700"
                            : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                        }`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
                {filteredMore.length === 0 && (
                  <div className="rounded-md border border-dashed border-slate-200 px-3 py-6 text-center text-sm text-slate-400">
                    没有匹配项
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
