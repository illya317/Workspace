"use client";

import { useState, useEffect } from "react";
import { DetailModal, getFieldInputClassName, getReadOnlyFieldClassName, getToolbarActionClassName } from "@workspace/core/ui";
import type { ReclassResultRow } from "@workspace/finance/server/ledger/reclass-results/types";
import AccountCodeInput from "./AccountCodeInput";

interface Props {
  item: ReclassResultRow | null;
  open: boolean;
  onClose: () => void;
  onSubmit: (id: number, targetAccount: string, amount: number, note: string) => Promise<void>;
  companyCode?: string;
  year?: string;
}

export default function ReclassReviewModal({ item, open, onClose, onSubmit, companyCode = "", year = "" }: Props) {
  const [targetAccount, setTargetAccount] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && item) {
      const st = item.suggestedTarget as string | undefined;
      setTargetAccount(item.targetAccount || st || "");
      setAmount(String(item.amount > 0 ? item.amount : (item.itemDebit || item.itemCredit || 0)));
      setNote("");
    }
  }, [open, item]);

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
    <DetailModal open title="调整重分类" onClose={handleClose} maxWidth="max-w-sm">
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-400 mb-0.5">凭证号</label>
            <p className={getReadOnlyFieldClassName("font-mono text-gray-700")}>{item.voucherNo}</p>
          </div>
          {item.description && (
            <div>
              <label className="block text-xs text-gray-400 mb-0.5">摘要</label>
              <p className={getReadOnlyFieldClassName("text-gray-700")}>{item.description}</p>
            </div>
          )}
          <div>
            <label className="block text-xs text-gray-400 mb-0.5">调整科目</label>
            <AccountCodeInput companyCode={companyCode} year={year} value={targetAccount} onChange={setTargetAccount} placeholder="搜索科目编码..." className="w-full" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-0.5">重分类金额</label>
            <input type="number" step="0.01" value={amount} {...(item.amount > 0 ? { max: item.amount } : {})}
              onChange={(e) => setAmount(e.target.value)}
              className={getFieldInputClassName()} />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-0.5">审核备注</label>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
              className={getFieldInputClassName("resize-none")} />
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={handleClose} className={getToolbarActionClassName("secondary")}>取消</button>
          <button onClick={handleSubmit} disabled={saving}
            className={getToolbarActionClassName("primary")}>
            {saving ? "提交中..." : "确认调整"}
          </button>
        </div>
    </DetailModal>
  );
}
