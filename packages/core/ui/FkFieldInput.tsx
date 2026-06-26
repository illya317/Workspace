"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { workspacePath } from "@workspace/core/routing";
import { CONTROL_SIZES, type ControlSize } from "./interactionTokens";
import FieldInputShell, { type FieldInputShellProps } from "./FieldInputShell";
import type { FieldControlSize } from "./FormStyles";

export type LifecycleScope = "active" | "all" | "archived";

export interface FkFieldOption {
  id: number;
  name: string;
  subtitle?: string;
  departmentId?: number | null;
  departmentPath?: string | null;
  lifecycleStatus?: "active" | "archived" | "inactive";
}

export type FkFieldInputAppearance = "field" | "toolbar" | "inline";

export interface FkFieldInputProps {
  fkKey: string;
  endpoint: string;
  value: string;
  displayValue?: string;
  onChange: (value: string, option?: FkFieldOption) => void;
  placeholder?: string;
  disabled?: boolean;
  lifecycleScope?: LifecycleScope;
  queryParams?: Record<string, string | number | boolean | null | undefined>;
  appearance?: FkFieldInputAppearance;
  size?: FieldControlSize;
  density?: FieldInputShellProps["density"];
  className?: string;
}

function getFkInputClassName(
  appearance: FkFieldInputAppearance,
  size: ControlSize,
  extra?: string,
): string {
  const tokens = CONTROL_SIZES[size];
  const sizeBase = [tokens.height, tokens.paddingX, tokens.radius].filter(Boolean).join(" ");
  switch (appearance) {
    case "toolbar":
      return [
        sizeBase,
        "min-w-0 border border-slate-200 bg-white font-semibold text-slate-700 shadow-sm placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:bg-slate-100 disabled:text-slate-500",
        tokens.text,
        extra,
      ].filter(Boolean).join(" ");
    case "inline":
      return [
        "min-w-0 border-b border-transparent bg-transparent px-1 py-0 text-sm text-slate-700 placeholder:text-slate-400 hover:border-slate-300 focus:border-sky-500 focus:outline-none disabled:text-slate-400",
        extra,
      ].filter(Boolean).join(" ");
    default:
      return [
        sizeBase,
        "w-full min-w-0 border border-slate-200 bg-white py-0 font-sans text-sm text-slate-800 shadow-sm tabular-nums placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:bg-slate-100 disabled:text-slate-500",
        extra,
      ].filter(Boolean).join(" ");
  }
}

const UNSTYLED_INPUT_CLASS_NAME =
  "h-full w-full min-w-0 border-0 bg-transparent p-0 text-sm leading-none text-current outline-none placeholder:text-slate-400 disabled:bg-transparent disabled:text-slate-500";

export default function FkFieldInput({
  fkKey,
  endpoint,
  value,
  displayValue,
  onChange,
  placeholder = "输入搜索...",
  disabled,
  lifecycleScope = "active",
  queryParams,
  appearance = "field",
  size = "md",
  density = "normal",
  className,
}: FkFieldInputProps) {
  const controlSize: ControlSize = size;
  const [keyword, setKeyword] = useState("");
  const [options, setOptions] = useState<FkFieldOption[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectedName = value ? displayValue || value : "";

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
        setSearching(false);
        setKeyword("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const search = useCallback(
    async (q: string) => {
      if (!q.trim()) {
        setOptions([]);
        return;
      }
      setLoading(true);
      try {
        const params = new URLSearchParams({
          fkKey,
          keyword: q,
          lifecycleScope,
        });
        for (const [key, item] of Object.entries(queryParams ?? {})) {
          if (item === null || item === undefined || item === "") continue;
          params.set(key, String(item));
        }
        const response = await fetch(workspacePath(`${endpoint}?${params.toString()}`));
        if (response.ok) {
          const data = (await response.json()) as { items?: FkFieldOption[] };
          setOptions(data.items || []);
        } else {
          setOptions([]);
        }
      } finally {
        setLoading(false);
      }
    },
    [endpoint, fkKey, lifecycleScope, queryParams],
  );

  function handleInputChange(nextValue: string) {
    if (!nextValue && selectedName) {
      onChange("");
    }
    setKeyword(nextValue);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(nextValue), 250);
    setShowDropdown(true);
  }

  function handleSelect(option: FkFieldOption) {
    onChange(option.name, option);
    setKeyword("");
    setSearching(false);
    setOptions([]);
    setShowDropdown(false);
  }

  const display = searching ? keyword : selectedName;

  const containerClassName = appearance === "inline" ? "relative inline-block min-w-0" : "relative w-full min-w-0";
  const isField = appearance === "field";
  const inputClassName = isField
    ? [UNSTYLED_INPUT_CLASS_NAME, className].filter(Boolean).join(" ")
    : getFkInputClassName(appearance, controlSize, className);
  const input = (
    <input
      type="text"
      value={display}
      onChange={(event) => {
        setSearching(true);
        handleInputChange(event.target.value);
      }}
      onFocus={() => {
        setSearching(true);
        setKeyword("");
        setOptions([]);
        setShowDropdown(true);
      }}
      disabled={disabled}
      placeholder={selectedName || placeholder}
      className={inputClassName}
    />
  );

  return (
    <div ref={containerRef} className={containerClassName}>
      {isField ? (
        <FieldInputShell disabled={disabled} size={size} density={density}>
          {input}
        </FieldInputShell>
      ) : (
        input
      )}
      {showDropdown && searching && (
        <div className="absolute z-50 mt-1 max-h-48 min-w-[160px] w-full overflow-auto rounded border border-gray-200 bg-white shadow-lg">
          {loading ? (
            <div className="px-3 py-2 text-xs text-gray-400">搜索中...</div>
          ) : options.length === 0 ? (
            <div className="px-3 py-2 text-xs text-gray-400">{keyword ? "无匹配结果" : "输入关键词搜索"}</div>
          ) : (
            options.map((option) => (
              <button
                key={option.id}
                onClick={() => handleSelect(option)}
                className="block w-full px-3 py-2 text-left text-xs hover:bg-emerald-50"
                type="button"
              >
                <span className="font-medium text-gray-700">{option.name}</span>
                {option.subtitle ? <span className="ml-2 text-gray-400">{option.subtitle}</span> : null}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
