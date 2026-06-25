"use client";

import { useState, useEffect } from "react";
import { Toolbar, type ToolbarItem, DetailModal, FormField, TextareaField, TextField, getReadOnlyFieldClassName } from "@workspace/core/ui";
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
          <FormField label="凭证号">
            <p className={getReadOnlyFieldClassName("font-mono text-gray-700")}>{item.voucherNo}</p>
          </FormField>
          {item.description && (
            <FormField label="摘要">
              <p className={getReadOnlyFieldClassName("text-gray-700")}>{item.description}</p>
            </FormField>
          )}
          <FormField label="调整科目" required>
            <AccountCodeInput companyCode={companyCode} year={year} value={targetAccount} onChange={setTargetAccount} placeholder="搜索科目编码..." className="w-full" />
          </FormField>
          <FormField label="重分类金额" required>
            <TextField
              type="number"
              step="0.01"
              value={amount}
              {...(item.amount > 0 ? { max: item.amount } : {})}
              onChange={setAmount}
            />
          </FormField>
          <FormField label="审核备注">
            <TextareaField value={note} onChange={setNote} rows={2} className="resize-none" />
          </FormField>
        </div>

        <Toolbar
          className="mt-5 justify-end border-0 p-0 shadow-none"
          items={[
            { kind: "icon-button", key: "cancel", section: "action", icon: "cancel", label: "取消", onClick: handleClose },
            { kind: "icon-button", key: "submit", section: "action", icon: "check", label: saving ? "提交中..." : "确认调整", variant: "primary", disabled: saving, onClick: handleSubmit },
          ] satisfies ToolbarItem[]}
        />
    </DetailModal>
  );
}
