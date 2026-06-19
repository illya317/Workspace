"use client";

import { CalendarDateInput, DetailModal } from "@workspace/core/ui";
import type { Contract, ModalMode } from "@workspace/administration/types";

const FORM_FIELDS = [
  { label: "合同编号", key: "contractNo" as keyof Contract },
  { label: "合同名称 *", key: "name" as keyof Contract, required: true },
  { label: "签署方", key: "partyA" as keyof Contract },
  { label: "签署对方", key: "partyB" as keyof Contract },
  { label: "股东方", key: "shareholder" as keyof Contract },
  { label: "合同类型", key: "category" as keyof Contract },
  { label: "经办人", key: "handler" as keyof Contract },
  { label: "状态", key: "status" as keyof Contract },
  { label: "合同金额", key: "amount" as keyof Contract, type: "number" },
  { label: "已执行金额", key: "executedAmount" as keyof Contract, type: "number" },
  { label: "文件位置", key: "location" as keyof Contract },
];

interface ContractModalProps {
  mode: ModalMode;
  editing: Partial<Contract>;
  onChange: (field: keyof Contract, value: string | number | null) => void;
  onSave: () => void;
  onClose: () => void;
  saving: boolean;
}

export default function ContractModal({ mode, editing, onChange, onSave, onClose, saving }: ContractModalProps) {
  if (!mode) return null;

  return (
    <DetailModal
      open={Boolean(mode)}
      title={mode === "create" ? "新增合同" : "编辑合同"}
      onClose={onClose}
      maxWidth="max-w-2xl"
    >
        <div className="grid grid-cols-2 gap-4">
          {FORM_FIELDS.map((f) => (
            <div key={f.key}>
              <label className="mb-1 block text-xs font-medium text-gray-600">{f.label}</label>
              <input
                type={f.type || "text"}
                value={editing[f.key] ?? ""}
                onChange={(e) =>
                  onChange(
                    f.key,
                    f.type === "number"
                      ? e.target.value
                        ? parseFloat(e.target.value)
                        : null
                      : e.target.value,
                  )
                }
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
              />
            </div>
          ))}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">签订日期</label>
            <CalendarDateInput
              value={editing.signDate}
              onChange={(value) => onChange("signDate", value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">结束日期</label>
            <CalendarDateInput
              value={editing.endDate}
              onChange={(value) => onChange("endDate", value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
            />
          </div>
          <div className="col-span-2">
            <label className="mb-1 block text-xs font-medium text-gray-600">合同内容</label>
            <textarea
              value={editing.content ?? ""}
              onChange={(e) => onChange("content", e.target.value)}
              rows={2}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
            />
          </div>
          <div className="col-span-2">
            <label className="mb-1 block text-xs font-medium text-gray-600">备注</label>
            <textarea
              value={editing.remark ?? ""}
              onChange={(e) => onChange("remark", e.target.value)}
              rows={2}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
            />
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button onClick={onClose} className="rounded-md border px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">
            取消
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {saving ? "保存中..." : "保存"}
          </button>
        </div>
    </DetailModal>
  );
}
