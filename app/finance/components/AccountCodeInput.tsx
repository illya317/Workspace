"use client";

import { useState, useRef, useEffect, useCallback } from "react";

interface AccountOption { code: string; name: string; }

interface Props {
  companyCode: string;
  year: string;
  value: string;
  onChange: (code: string) => void;
  placeholder?: string;
  className?: string;
}

export default function AccountCodeInput({ companyCode, year, value, onChange, placeholder, className }: Props) {
  const [query, setQuery] = useState(value);
  const [options, setOptions] = useState<AccountOption[]>([]);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => { setQuery(value); }, [value]);

  // API now supports pinyin via matchText on server side
  const search = useCallback(async (q: string) => {
    if (q.length < 2) { setOptions([]); setOpen(false); return; }
    try {
      const params = new URLSearchParams({ keyword: q, companyCode, year, scope: "all", pageSize: "10" });
      const res = await fetch(`/workspace/api/finance/accounts?${params}`);
      if (res.ok) {
        const data = await res.json();
        const items: AccountOption[] = (data.data || data.accounts || []).map(
          (a: { code: string; name: string }) => ({ code: a.code, name: a.name }),
        );
        setOptions(items);
        setOpen(items.length > 0);
        setHighlight(-1);
      }
    } catch { /* ignore */ }
  }, [companyCode, year]);

  function onInput(v: string) {
    setQuery(v);
    // 不调用 onChange — 只有 select 时才算选中有效科目
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => search(v), 300);
  }

  function select(opt: AccountOption) {
    setQuery(opt.code);
    onChange(opt.code);
    setOpen(false);
    inputRef.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setHighlight((h) => Math.min(h + 1, options.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHighlight((h) => Math.max(h - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); if (highlight >= 0) select(options[highlight]); }
    else if (e.key === "Escape") { setOpen(false); }
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        value={query}
        placeholder={placeholder || "输入科目编码搜索..."}
        onChange={(e) => onInput(e.target.value)}
        onFocus={() => { if (options.length > 0) setOpen(true); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={onKeyDown}
        className={className || "w-24 rounded border border-emerald-400 px-2 py-0.5 text-xs focus:outline-none"}
      />
      {open && (
        <div className="absolute left-0 top-full z-20 mt-0.5 max-h-40 w-56 overflow-auto rounded border border-gray-200 bg-white shadow-lg">
          {options.length === 0 ? (
            <div className="px-3 py-2 text-xs text-gray-400">无匹配科目</div>
          ) : (
            options.map((opt, i) => (
              <button
                key={opt.code}
                type="button"
                onMouseDown={() => select(opt)}
                onMouseEnter={() => setHighlight(i)}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs ${
                  i === highlight ? "bg-emerald-50 text-emerald-800" : "text-gray-700 hover:bg-gray-50"
                }`}
              >
                <span className="font-mono text-gray-500">{opt.code}</span>
                <span className="truncate">{opt.name}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
