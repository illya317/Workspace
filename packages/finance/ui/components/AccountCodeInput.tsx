"use client";

import { workspacePath } from "@workspace/core/routing";
import { useState, useCallback, useEffect, useMemo } from "react";
import { createPageBody, PageSurface, createInlineFieldsBlock } from "@workspace/core/ui";

interface AccountOption { code: string; name: string; }

class AccountSearchDebouncer {
  private searchTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly search: (query: string) => void,
    private readonly onShortQuery: () => void,
  ) {}

  readonly handleQueryChange = (query: string) => {
    this.cancel();
    if (query.length < 2) {
      this.onShortQuery();
      return;
    }
    this.searchTimer = setTimeout(() => this.search(query), 300);
  };

  cancel() {
    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
      this.searchTimer = undefined;
    }
  }
}

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

  const debouncedSearch = useMemo(
    () => new AccountSearchDebouncer(search, () => {
        setOptions([]);
        setLoading(false);
      }),
    [search],
  );

  useEffect(() => () => debouncedSearch.cancel(), [debouncedSearch]);

  return (
    <PageSurface
      kind="list"
      embedded
      body={createPageBody([
        createInlineFieldsBlock("account-code", [{
          key: "accountCode",
          label: "",
          spec: {
            valueType: "string",
            control: "choice",
            options: { source: "static", mode: "autocomplete", items: searchableOptions, visibleCount: 5 },
          },
          value,
          onChange: (code) => onChange(String(code ?? "")),
          onQueryChange: debouncedSearch.handleQueryChange,
          loading,
          placeholder: placeholder || "输入科目编码搜索...",
          emptyText: "无匹配科目",
          className: className || "w-32",
        }]),
      ])}
    />
  );
}
