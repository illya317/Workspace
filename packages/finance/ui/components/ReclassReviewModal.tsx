"use client";

import { useState, useEffect } from "react";
import { DetailModal, FormField, InputControl, ReadOnlyField, Toolbar, type ToolbarItem } from "@workspace/core/ui";
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
            <ReadOnlyField value={item.voucherNo} fontRole="mono" />
          </FormField>
          {item.description && (
            <FormField label="摘要">
              <ReadOnlyField value={item.description} />
            </FormField>
          )}
          <FormField label="调整科目" required>
            <AccountCodeInput companyCode={companyCode} year={year} value={targetAccount} onChange={setTargetAccount} placeholder="搜索科目编码..." />
          </FormField>
          <FormField label="重分类金额" required>
            <InputControl
              spec={{
                valueType: "number",
                editor: "number",
                validation: item.amount > 0 ? { max: item.amount } : undefined,
              }}
              step="0.01"
              value={amount}
              onChange={(value) => setAmount(String(value ?? ""))}
            />
          </FormField>
          <FormField label="审核备注">
            <InputControl spec={{ valueType: "string", editor: "textarea" }} value={note} onChange={(value) => setNote(String(value ?? ""))} rows={2} />
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
