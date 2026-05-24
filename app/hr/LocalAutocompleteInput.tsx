"use client";

import { useState, useRef, useEffect } from "react";

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
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filtered = options
    .filter((opt) => opt && opt.toLowerCase().includes(keyword.toLowerCase()))
    .slice(0, 20);

  function handleSelect(opt: string) {
    onChange(opt);
    setKeyword(opt);
    setShowDropdown(false);
  }

  return (
    <div ref={containerRef} className="relative flex-1">
      <input
        type="text"
        value={keyword}
        onChange={(e) => {
          setKeyword(e.target.value);
          onChange(e.target.value);
          setShowDropdown(true);
        }}
        onFocus={() => setShowDropdown(true)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-700 placeholder-gray-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
      />
      {showDropdown && filtered.length > 0 && (
        <div className="absolute z-50 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg">
          {filtered.map((opt) => (
            <button
              key={opt}
              onClick={() => handleSelect(opt)}
              className="block w-full px-4 py-2 text-left text-sm hover:bg-emerald-50"
              type="button"
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
