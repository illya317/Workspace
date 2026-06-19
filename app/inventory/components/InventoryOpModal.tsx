"use client";

import { DetailModal, SelectField } from "@workspace/core/ui";

interface OpTypeOption {
  value: string;
  label: string;
}

interface InventoryOpModalProps {
  open: boolean;
  opTypes: OpTypeOption[];
  opForm: { opType: string; quantity: string; reason: string };
  onFieldChange: (key: "opType" | "quantity" | "reason", value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function InventoryOpModal({
  open, opTypes, opForm, onFieldChange, onConfirm, onCancel,
}: InventoryOpModalProps) {
  if (!open) return null;
  return (
    <DetailModal open title="库存操作" onClose={onCancel} maxWidth="max-w-sm">
        <div className="space-y-3">
          <div>
            <SelectField
              label="操作类型"
              value={opForm.opType}
              onChange={(value) => onFieldChange("opType", value)}
              options={opTypes}
              className="block"
              selectClassName="min-h-8"
            />
          </div>
          <div>
            <label className="text-xs text-gray-600">数量</label>
            <input
              type="number"
              value={opForm.quantity}
              onChange={(e) => onFieldChange("quantity", e.target.value)}
              className="w-full rounded border border-gray-300 px-2 py-1 text-xs"
            />
          </div>
          <div>
            <label className="text-xs text-gray-600">原因/备注</label>
            <input
              value={opForm.reason}
              onChange={(e) => onFieldChange("reason", e.target.value)}
              className="w-full rounded border border-gray-300 px-2 py-1 text-xs"
            />
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <button onClick={onConfirm} className="rounded-md bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700">
            确认
          </button>
          <button onClick={onCancel} className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
            取消
          </button>
        </div>
    </DetailModal>
  );
}
