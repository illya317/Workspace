"use client";

import { workspacePath } from "@workspace/core/routing";
import { useState, useRef, useCallback, useMemo } from "react";
import { InputControl } from "@workspace/core/ui";

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
  const [options, setOptions] = useState<AccountOption[]>([]);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const searchableOptions = useMemo(
    () => options.map((opt) => ({ value: opt.code, label: `${opt.code} ${opt.name}`, searchText: opt.name })),
    [options],
  );

  const search = useCallback(async (q: string) => {
    if (q.length < 2) { setOptions([]); setLoading(false); return; }
    setLoading(true);
    try {
      const params = new URLSearchParams({ keyword: q, companyCode, year, scope: "all", pageSize: "10" });
      const res = await fetch(workspacePath(`/api/modules/finance/ledger/accounts?${params}`));
      if (res.ok) {
        const data = await res.json();
        const items: AccountOption[] = (data.data || data.accounts || []).map(
          (a: { code: string; name: string }) => ({ code: a.code, name: a.name }),
        );
        setOptions(items);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [companyCode, year]);

  return (
    <InputControl
      spec={{
        valueType: "string",
        editor: "autocomplete",
        options: { source: "static", mode: "autocomplete", items: searchableOptions, visibleCount: 5 },
      }}
      value={value}
      onChange={(code) => onChange(String(code ?? ""))}
      onQueryChange={(q) => {
        clearTimeout(timerRef.current);
        if (q.length < 2) {
          setOptions([]);
          setLoading(false);
          return;
        }
        timerRef.current = setTimeout(() => search(q), 300);
      }}
      loading={loading}
      placeholder={placeholder || "输入科目编码搜索..."}
      emptyText="无匹配科目"
      className={className || "w-32"}
    />
  );
}
