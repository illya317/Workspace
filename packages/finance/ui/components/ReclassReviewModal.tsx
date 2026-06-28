"use client";

import { workspacePath } from "@workspace/core/routing";
import { useState, useEffect, useMemo, useCallback } from "react";
import { createPageBody, PageSurface, createFieldsBlock, createPageModalBlock } from "@workspace/core/ui";
import type { ReclassResultRow } from "@workspace/finance/server/ledger/reclass-results/types";

interface Props {
  item: ReclassResultRow | null;
  open: boolean;
  onClose: () => void;
  onSubmit: (id: number, targetAccount: string, amount: number, note: string) => Promise<void>;
  companyCode?: string;
  year?: string;
}

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

export default function ReclassReviewModal({ item, open, onClose, onSubmit, companyCode = "", year = "" }: Props) {
  const [targetAccount, setTargetAccount] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [accountOptions, setAccountOptions] = useState<Array<{ code: string; name: string }>>([]);
  const [accountLoading, setAccountLoading] = useState(false);

  const searchableAccountOptions = useMemo(
    () => accountOptions.map((option) => ({ value: option.code, label: `${option.code} ${option.name}`, searchText: option.name })),
    [accountOptions],
  );

  const searchAccounts = useCallback(async (query: string) => {
    if (query.length < 2) {
      setAccountOptions([]);
      setAccountLoading(false);
      return;
    }
    setAccountLoading(true);
    try {
      const params = new URLSearchParams({ keyword: query, companyCode, year, scope: "all", pageSize: "10" });
      const response = await fetch(workspacePath(`/api/modules/finance/ledger/accounts?${params}`));
      if (response.ok) {
        const data = await response.json();
        setAccountOptions((data.data || data.accounts || []).map((account: { code: string; name: string }) => ({
          code: account.code,
          name: account.name,
        })));
      }
    } catch {
      // Search failures should not block manual entry.
    } finally {
      setAccountLoading(false);
    }
  }, [companyCode, year]);

  useEffect(() => {
    if (open && item) {
      const st = item.suggestedTarget as string | undefined;
      setTargetAccount(item.targetAccount || st || "");
      setAmount(String(item.amount > 0 ? item.amount : (item.itemDebit || item.itemCredit || 0)));
      setNote("");
    }
  }, [open, item]);

  const debouncedAccountSearch = useMemo(
    () => new AccountSearchDebouncer(searchAccounts, () => {
        setAccountOptions([]);
        setAccountLoading(false);
      }),
    [searchAccounts],
  );

  useEffect(() => () => debouncedAccountSearch.cancel(), [debouncedAccountSearch]);

  if (!open || !item) return null;

  async function handleSubmit() {
    const amt = parseFloat(amount);
    if (!targetAccount.trim() || !amt || amt <= 0) return;
    if (item!.amount > 0 && amt > item!.amount) return;
    setSaving(true);
    try {
      await onSubmit(item!.id, targetAccount.trim(), amt, note.trim());
      onClose();
    } finally {
      setSaving(false);
    }
  }

  function handleClose() {
    setTargetAccount("");
    setAmount("");
    setNote("");
    onClose();
  }

  return (
    <PageSurface
      kind="list"
      embedded
      body={createPageBody([
        createPageModalBlock("reclass-review", {
          open,
          title: "调整重分类",
          onClose: handleClose,
          maxWidth: "max-w-sm",
          blocks: [
            createFieldsBlock("reclass-review-form", [
              { kind: "readonly", key: "voucherNo", label: "凭证号", value: item.voucherNo, fontRole: "mono" },
              ...(item.description ? [{ kind: "readonly" as const, key: "description", label: "摘要", value: item.description }] : []),
              {
                key: "targetAccount",
                label: "调整科目",
                required: true,
                spec: {
                  valueType: "string",
                  control: "choice",
                  options: { source: "static", mode: "autocomplete", items: searchableAccountOptions, visibleCount: 5 },
                },
                value: targetAccount,
                onChange: (value) => setTargetAccount(String(value ?? "")),
                onQueryChange: debouncedAccountSearch.handleQueryChange,
                loading: accountLoading,
                placeholder: "搜索科目编码...",
                emptyText: "无匹配科目",
              },
              {
                key: "amount",
                label: "重分类金额",
                required: true,
                spec: { valueType: "number", control: "number", validation: item.amount > 0 ? { max: item.amount } : undefined },
                step: "0.01",
                value: amount,
                onChange: (value) => setAmount(String(value ?? "")),
              },
              {
                key: "note",
                label: "审核备注",
                spec: { valueType: "string", control: "text", multiline: true },
                value: note,
                onChange: (value) => setNote(String(value ?? "")),
                rows: 2,
              },
            ], {
              actions: [
                { key: "cancel", label: "取消", onClick: handleClose },
                { key: "submit", label: saving ? "提交中..." : "确认调整", variant: "primary", disabled: saving, onClick: handleSubmit },
              ],
            }),
          ],
        }),
      ])}
    />
  );
}
