"use client";

import { useState, useEffect, useRef, useCallback } from "react";

export interface SearchOption {
  id: number;
  name: string;
  subtitle?: string;
}

interface Props {
  value: string;
  displayValue?: string;
  onChange: (value: string, option?: SearchOption) => void;
  entity: string;
  placeholder?: string;
  disabled?: boolean;
}

export default function EntitySearchInput({
  value,
  displayValue,
  onChange,
  entity,
  placeholder = "输入搜索...",
  disabled,
}: Props) {
  const [keyword, setKeyword] = useState("");
  const [options, setOptions] = useState<SearchOption[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectedName = value ? displayValue || value : "";

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const search = useCallback(async (q: string) => {
    if (!q.trim()) {
      setOptions([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/workspace/api/hr/autocomplete?entity=${entity}&keyword=${encodeURIComponent(q)}`);
      if (res.ok) {
        const data = await res.json();
        setOptions(data.items || []);
      }
    } finally {
      setLoading(false);
    }
  }, [entity]);

  function handleInputChange(v: string) {
    setKeyword(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      search(v);
    }, 250);
    setShowDropdown(true);
  }

  function handleSelect(opt: SearchOption) {
    onChange(opt.name, opt);
    setKeyword("");
    setOptions([]);
    setShowDropdown(false);
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange("");
    setKeyword("");
    setOptions([]);
  }

  const display = value ? selectedName : keyword;

  return (
    <div ref={containerRef} className="relative flex-1">
      <div className="flex items-center gap-1">
        <input
          type="text"
          value={display}
          onChange={(e) => {
            if (value) {
              onChange("");
              setKeyword(e.target.value);
              if (debounceRef.current) clearTimeout(debounceRef.current);
              debounceRef.current = setTimeout(() => search(e.target.value), 250);
              setShowDropdown(true);
            } else {
              handleInputChange(e.target.value);
            }
          }}
          onFocus={() => {
            if (!value) setShowDropdown(true);
          }}
          disabled={disabled}
          placeholder={value ? undefined : placeholder}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:bg-gray-100"
        />
        {value && (
          <button
            onClick={handleClear}
            className="shrink-0 text-gray-400 hover:text-red-500 text-xs"
            type="button"
          >
            ✕
          </button>
        )}
      </div>
      {showDropdown && !value && (
        <div className="absolute z-50 mt-1 max-h-48 min-w-[160px] w-full overflow-auto rounded border border-gray-200 bg-white shadow-lg">
          {loading ? (
            <div className="px-3 py-2 text-xs text-gray-400">搜索中...</div>
          ) : options.length === 0 ? (
            <div className="px-3 py-2 text-xs text-gray-400">
              {keyword ? "无匹配结果" : "输入关键词搜索"}
            </div>
          ) : (
            options.map((opt) => (
              <button
                key={opt.id}
                onClick={() => handleSelect(opt)}
                className="block w-full px-3 py-2 text-left text-xs hover:bg-emerald-50"
                type="button"
              >
                <span className="font-medium text-gray-700">{opt.name}</span>
                {opt.subtitle && (
                  <span className="ml-2 text-gray-400">{opt.subtitle}</span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
