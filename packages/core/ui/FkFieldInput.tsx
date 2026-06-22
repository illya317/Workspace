"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { workspacePath } from "@workspace/core/routing";
import SearchInput, { type SearchInputSize } from "./SearchInput";

export type LifecycleScope = "active" | "all" | "archived";

export interface FkFieldOption {
  id: number;
  name: string;
  subtitle?: string;
  departmentId?: number | null;
  departmentPath?: string | null;
  lifecycleStatus?: "active" | "archived" | "inactive";
}

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
  size?: SearchInputSize;
  className?: string;
}

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
  size = "compact",
  className,
}: FkFieldInputProps) {
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

  return (
    <div ref={containerRef} className="relative flex-1">
      <SearchInput
        value={display}
        onChange={(nextValue) => {
          setSearching(true);
          handleInputChange(nextValue);
        }}
        onFocus={() => {
          setSearching(true);
          setKeyword("");
          setOptions([]);
          setShowDropdown(true);
        }}
        disabled={disabled}
        placeholder={selectedName || placeholder}
        size={size}
        className={className}
      />
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
