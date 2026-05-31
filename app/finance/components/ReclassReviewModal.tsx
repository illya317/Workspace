"use client";

import { useState, useEffect } from "react";
import type { ReclassResultRow } from "@/server/services/finance/ledger/reclass-results/types";
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
      setTargetAccount(item.targetAccount);
      setAmount(String(item.amount));
      setNote("");
    }
  }, [open, item]);

  if (!open || !item) return null;

  async function handleSubmit() {
    const amt = parseFloat(amount);
    if (!targetAccount.trim() || !amt || amt <= 0) return;
    if (amt > item!.amount) return;
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={handleClose}>
      <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-4 text-sm font-semibold text-gray-800">调整重分类</h3>

        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-400 mb-0.5">凭证号</label>
            <p className="text-sm font-mono text-gray-700">{item.voucherNo}</p>
          </div>
          {item.description && (
            <div>
              <label className="block text-xs text-gray-400 mb-0.5">摘要</label>
              <p className="text-sm text-gray-700">{item.description}</p>
            </div>
          )}
          <div>
            <label className="block text-xs text-gray-400 mb-0.5">调整科目</label>
            <AccountCodeInput companyCode={companyCode} year={year} value={targetAccount} onChange={setTargetAccount} placeholder="搜索科目编码..." className="w-full rounded border border-gray-200 px-2.5 py-1.5 text-sm focus:border-emerald-400 focus:outline-none" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-0.5">重分类金额</label>
            <input type="number" step="0.01" value={amount} max={item.amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded border border-gray-200 px-2.5 py-1.5 text-sm focus:border-emerald-400 focus:outline-none" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-0.5">审核备注</label>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
              className="w-full rounded border border-gray-200 px-2.5 py-1.5 text-sm focus:border-emerald-400 focus:outline-none resize-none" />
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={handleClose} className="rounded-md border border-gray-200 px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-50">取消</button>
          <button onClick={handleSubmit} disabled={saving}
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm text-white hover:bg-emerald-700 disabled:opacity-50">
            {saving ? "提交中..." : "确认调整"}
          </button>
        </div>
      </div>
    </div>
  );
}
