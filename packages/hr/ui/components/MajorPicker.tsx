"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { SearchInput } from "@workspace/core/ui";
import {
  HR_MAJOR_OPTIONS,
  normalizeHrMajorItems,
  type HRMajorItem,
} from "@workspace/hr/constants/field-options";
import type { HrPickerProps } from "./HrPicker";

function currentMajor(value: unknown): HRMajorItem | undefined {
  return normalizeHrMajorItems(value)[0];
}

function matchMajor(option: HRMajorItem, keyword: string) {
  const text = keyword.trim().toLowerCase();
  if (!text) return false;
  return option.specialty.toLowerCase().includes(text) || option.category.toLowerCase().includes(text);
}

export default function MajorPicker({
  value,
  disabled,
  onChange,
  className,
}: HrPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const current = useMemo(() => currentMajor(value), [value]);
  const [searching, setSearching] = useState(false);
  const [keyword, setKeyword] = useState("");
  const display = searching ? keyword : current?.specialty ?? "";

  const options = useMemo(() => {
    if (!keyword.trim()) return [];
    return HR_MAJOR_OPTIONS.filter((option) => matchMajor(option, keyword)).slice(0, 24);
  }, [keyword]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current?.contains(event.target as Node)) return;
      setSearching(false);
      setKeyword("");
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function choose(option: HRMajorItem) {
    onChange(option.specialty);
    setSearching(false);
    setKeyword("");
  }

  return (
    <div ref={containerRef} className={`relative min-w-0 flex-1 ${className ?? ""}`}>
      <SearchInput
        value={display}
        onChange={(next) => {
          setSearching(true);
          setKeyword(next);
          if (!next.trim()) onChange(null);
        }}
        onFocus={() => {
          setSearching(true);
          setKeyword("");
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && options[0]) {
            event.preventDefault();
            choose(options[0]);
          }
          if (event.key === "Escape") {
            setSearching(false);
            setKeyword("");
          }
        }}
        disabled={disabled}
        placeholder={current?.specialty || "搜索专业"}
        size="compact"
      />
      {searching && !disabled && (
        <div className="absolute left-0 top-[calc(100%+0.35rem)] z-50 max-h-64 w-max min-w-full max-w-[min(34rem,calc(100vw-2rem))] overflow-auto rounded-lg border border-slate-200 bg-white p-2 shadow-xl">
          {!keyword.trim() ? (
            <div className="px-2 py-1.5 text-xs text-slate-400">输入专业名称搜索</div>
          ) : options.length === 0 ? (
            <div className="px-2 py-1.5 text-xs text-slate-400">无匹配专业</div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {options.map((option) => {
                const selected = current?.specialty === option.specialty;
                return (
                  <button
                    key={`${option.category}-${option.specialty}`}
                    type="button"
                    onClick={() => choose(option)}
                    className={`min-w-28 rounded-md border px-2.5 py-1.5 text-left text-xs transition ${
                      selected
                        ? "border-sky-400 bg-sky-50 text-sky-800"
                        : "border-slate-200 bg-white text-slate-700 hover:border-sky-200 hover:bg-sky-50"
                    }`}
                  >
                    <span className="block truncate font-semibold">{option.specialty}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
