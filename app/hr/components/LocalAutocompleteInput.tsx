"use client";

import { useState, useRef, useEffect } from "react";
import { matchText } from "@/lib/search";

interface Props {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
}

export default function LocalAutocompleteInput({ value, onChange, options, placeholder = "输入搜索..." }: Props) {
  const [keyword, setKeyword] = useState(value);
  const [showDropdown, setShowDropdown] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setKeyword(value);
  }, [value]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
        // 失去焦点时，如果输入不在选项里，回退到已选值
        if (!options.includes(keyword)) {
          setKeyword(value);
        }
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [keyword, value, options]);

  const filtered = keyword
    ? options.filter((opt) => opt && matchText(opt, keyword)).slice(0, 20)
    : [];

  function handleSelect(opt: string) {
    onChange(opt);
    setKeyword(opt);
    setShowDropdown(false);
  }

  function handleClear() {
    onChange("");
    setKeyword("");
    setShowDropdown(false);
  }

  return (
    <div ref={containerRef} className="relative flex-1">
      <div className="flex items-center gap-1">
        <input
          type="text"
          value={keyword}
          onChange={(e) => {
            setKeyword(e.target.value);
            setShowDropdown(true);
          }}
          onFocus={() => setShowDropdown(true)}
          placeholder={placeholder}
          className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-700 placeholder-gray-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
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
      {showDropdown && (
        <div className="absolute z-50 mt-1 max-h-48 min-w-[160px] w-full overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg">
          {options.length === 0 ? (
            <div className="px-3 py-2 text-xs text-gray-400">无可用选项</div>
          ) : filtered.length === 0 ? (
            <div className="px-3 py-2 text-xs text-gray-400">
              {keyword ? "无匹配结果" : "输入关键词搜索"}
            </div>
          ) : (
            filtered.map((opt) => (
              <button
                key={opt}
                onClick={() => handleSelect(opt)}
                className="block w-full px-3 py-2 text-left text-xs hover:bg-emerald-50"
                type="button"
              >
                <span className="font-medium text-gray-700">{opt}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
