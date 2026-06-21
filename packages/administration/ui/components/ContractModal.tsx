"use client";

import { ActionToolbar, CalendarDateInput, DetailModal, FormField, TextareaField, TextField } from "@workspace/core/ui";
import type { Contract, ModalMode } from "@workspace/administration/types";

const FORM_FIELDS = [
  { label: "合同编号", key: "contractNo" as keyof Contract },
  { label: "合同名称", key: "name" as keyof Contract, required: true },
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
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {FORM_FIELDS.map((f) => (
            <FormField key={f.key} label={f.label} required={f.required}>
              <TextField
                type={f.type === "number" ? "number" : "text"}
                value={editing[f.key] === null || editing[f.key] === undefined ? "" : String(editing[f.key])}
                onChange={(value) =>
                  onChange(
                    f.key,
                    f.type === "number"
                      ? value
                        ? parseFloat(value)
                        : null
                      : value,
                  )
                }
              />
            </FormField>
          ))}
          <FormField label="签订日期">
            <CalendarDateInput
              value={editing.signDate}
              onChange={(value) => onChange("signDate", value)}
            />
          </FormField>
          <FormField label="结束日期">
            <CalendarDateInput
              value={editing.endDate}
              onChange={(value) => onChange("endDate", value)}
            />
          </FormField>
          <FormField label="合同内容" className="md:col-span-2">
            <TextareaField
              value={editing.content ?? ""}
              onChange={(value) => onChange("content", value)}
              rows={2}
            />
          </FormField>
          <FormField label="备注" className="md:col-span-2">
            <TextareaField
              value={editing.remark ?? ""}
              onChange={(value) => onChange("remark", value)}
              rows={2}
            />
          </FormField>
        </div>
        <ActionToolbar
          className="mt-6 justify-end"
          secondaryActions={[{ label: "取消", onClick: onClose }]}
          primaryActions={[{ label: saving ? "保存中..." : "保存", onClick: onSave, disabled: saving }]}
        />
    </DetailModal>
  );
}
