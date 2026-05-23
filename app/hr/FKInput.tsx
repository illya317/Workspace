"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { FKOption } from "./types";

interface FKInputProps {
  value: number | null;
  displayValue: string;
  onChange: (option: FKOption | null) => void;
  entity: string;
  disabled?: boolean;
  placeholder?: string;
}

export default function FKInput({
  value,
  displayValue,
  onChange,
  entity,
  disabled,
  placeholder = "输入搜索...",
}: FKInputProps) {
  const [keyword, setKeyword] = useState("");
  const [options, setOptions] = useState<FKOption[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectedName = value ? displayValue : "";

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
      const res = await fetch(`/api/hr/autocomplete?entity=${entity}&keyword=${encodeURIComponent(q)}`);
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

  function handleSelect(opt: FKOption) {
    onChange(opt);
    setKeyword("");
    setOptions([]);
    setShowDropdown(false);
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange(null);
    setKeyword("");
    setOptions([]);
  }

  const display = value ? selectedName : keyword;

  return (
    <div ref={containerRef} className="relative inline-block w-full">
      <div className="flex items-center gap-1">
        <input
          ref={inputRef}
          type="text"
          value={display}
          onChange={(e) => {
            if (value) {
              onChange(null);
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
          className="w-full rounded border border-emerald-400 px-2 py-1 text-xs focus:outline-none disabled:bg-gray-100"
        />
        {value && (
          <button
            onClick={handleClear}
            className="text-gray-400 hover:text-red-500 text-xs"
            type="button"
          >
            ×
          </button>
        )}
      </div>
      {showDropdown && !value && (
        <div className="absolute z-50 mt-1 max-h-48 w-full overflow-auto rounded border border-gray-200 bg-white shadow-lg">
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
