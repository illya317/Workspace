"use client";

import { useState } from "react";
import type { ReclassResultRow } from "@/server/services/finance/ledger/reclass-results/types";

interface Props {
  item: ReclassResultRow | null;
  open: boolean;
  onClose: () => void;
  onSubmit: (id: number, targetAccount: string, amount: number, note: string) => Promise<void>;
}

export default function ReclassReviewModal({ item, open, onClose, onSubmit }: Props) {
  const [targetAccount, setTargetAccount] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  if (!open || !item) return null;

  function handleOpen() {
    setTargetAccount(item!.targetAccount);
    setAmount(String(item!.amount));
    setNote("");
  }

  // Initialize when opening
  if (targetAccount === "" && amount === "") {
    handleOpen();
  }

  async function handleSubmit() {
    const amt = parseFloat(amount);
    if (!targetAccount.trim() || !amt || amt <= 0) return;
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
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-4 text-sm font-semibold text-gray-800">调整重分类</h3>

        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-500 mb-0.5">原科目</label>
            <p className="text-sm font-mono text-gray-700">{item.sourceAccount}</p>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-0.5">目标科目</label>
            <input type="text" value={targetAccount}
              onChange={(e) => setTargetAccount(e.target.value)}
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm font-mono focus:border-emerald-400 focus:outline-none" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-0.5">重分类金额</label>
            <input type="number" step="0.01" value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-emerald-400 focus:outline-none" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-0.5">审核备注</label>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-emerald-400 focus:outline-none resize-none" />
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={handleClose} className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50">取消</button>
          <button onClick={handleSubmit} disabled={saving}
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm text-white hover:bg-emerald-700 disabled:opacity-50">
            {saving ? "提交中..." : "确认调整"}
          </button>
        </div>
      </div>
    </div>
  );
}
