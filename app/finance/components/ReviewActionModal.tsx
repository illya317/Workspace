"use client";

import { useState, useEffect } from "react";
import { DetailModal, getFieldInputClassName, getToolbarActionClassName } from "@workspace/core/ui";

interface ReviewActionModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: {
    targetAccount: string;
    amount: number;
    note: string;
  }) => Promise<void> | void;
  /** 初始目标科目 */
  defaultTargetAccount?: string;
  /** 初始金额 */
  defaultAmount?: number;
  /** 来源科目（只读展示） */
  sourceAccount?: string;
  /** 弹窗标题 */
  title?: string;
}

/**
 * 重分类审核调整弹窗。
 * 替代 reclassItemColumns / ReclassReviewView 里的 prompt()。
 *
 * 使用：
 *   <ReviewActionModal
 *     open={showModal}
 *     onClose={() => setShowModal(false)}
 *     onSubmit={async (d) => { await onReview(id, "adjust", d); }}
 *     defaultTargetAccount={rr.targetAccount}
 *     defaultAmount={rr.amount}
 *     sourceAccount={rr.sourceAccount}
 *   />
 */
export default function ReviewActionModal({
  open,
  onClose,
  onSubmit,
  defaultTargetAccount = "",
  defaultAmount,
  sourceAccount,
  title = "调整重分类",
}: ReviewActionModalProps) {
  const [targetAccount, setTargetAccount] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setTargetAccount(defaultTargetAccount);
      setAmount(defaultAmount != null ? String(defaultAmount) : "");
      setNote("");
      setError("");
    }
  }, [open, defaultTargetAccount, defaultAmount]);

  if (!open) return null;

  const amt = parseFloat(amount);

  async function handleSubmit() {
    setError("");
    if (!targetAccount.trim()) {
      setError("请输入目标科目");
      return;
    }
    if (!amt || amt <= 0) {
      setError("请输入有效金额");
      return;
    }
    setSaving(true);
    try {
      await onSubmit({
        targetAccount: targetAccount.trim(),
        amount: amt,
        note: note.trim(),
      });
      onClose();
    } catch {
      setError("提交失败，请重试");
    } finally {
      setSaving(false);
    }
  }

  function handleClose() {
    if (!saving) {
      setTargetAccount("");
      setAmount("");
      setNote("");
      setError("");
      onClose();
    }
  }

  return (
    <DetailModal open title={title} onClose={handleClose} maxWidth="max-w-md">
        <div className="space-y-3">
          {sourceAccount && (
            <div>
              <label className="block text-xs text-gray-500 mb-0.5">
                原科目
              </label>
              <p className="text-sm font-mono text-gray-700">
                {sourceAccount}
              </p>
            </div>
          )}
          <div>
            <label className="block text-xs text-gray-500 mb-0.5">
              目标科目
            </label>
            <input
              type="text"
              value={targetAccount}
              onChange={(e) => setTargetAccount(e.target.value)}
              className={getFieldInputClassName("font-mono")}
              placeholder="科目编码"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-0.5">
              重分类金额
            </label>
            <input
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={getFieldInputClassName()}
              placeholder="0.00"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-0.5">
              审核备注
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className={getFieldInputClassName("resize-none")}
            />
          </div>
          {error && (
            <p className="text-xs text-red-500">{error}</p>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={handleClose}
            disabled={saving}
            className={getToolbarActionClassName("secondary")}
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className={getToolbarActionClassName("primary")}
          >
            {saving ? "提交中..." : "确认调整"}
          </button>
        </div>
    </DetailModal>
  );
}
