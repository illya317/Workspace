"use client";

import { CreatePanel, FormField, InputControl } from "@workspace/core/ui";
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
    <CreatePanel
      variant="modal"
      open={Boolean(mode)}
      title={mode === "create" ? "新增合同" : "编辑合同"}
      onCancel={onClose}
      onSubmit={onSave}
      submitting={saving}
      submitLabel="保存"
      maxWidth="max-w-2xl"
    >
      {FORM_FIELDS.map((f) => (
        <FormField key={f.key} label={f.label} required={f.required}>
          <InputControl
            spec={{
              valueType: f.type === "number" ? "number" : "string",
              editor: f.type === "number" ? "number" : "input",
              validation: f.required ? { required: true } : undefined,
            }}
            value={editing[f.key] === null || editing[f.key] === undefined ? "" : String(editing[f.key])}
            onChange={(value) =>
              onChange(
                f.key,
                f.type === "number"
                  ? value
                    ? parseFloat(String(value))
                    : null
                  : String(value ?? ""),
              )
            }
          />
        </FormField>
      ))}
      <FormField label="签订日期">
        <InputControl
          spec={{ valueType: "date", editor: "datePicker" }}
          value={editing.signDate}
          onChange={(value) => onChange("signDate", value ? String(value) : null)}
        />
      </FormField>
      <FormField label="结束日期">
        <InputControl
          spec={{ valueType: "date", editor: "datePicker" }}
          value={editing.endDate}
          onChange={(value) => onChange("endDate", value ? String(value) : null)}
        />
      </FormField>
      <FormField label="合同内容" className="md:col-span-2">
        <InputControl
          spec={{ valueType: "string", editor: "textarea" }}
          value={editing.content ?? ""}
          onChange={(value) => onChange("content", String(value ?? ""))}
          rows={2}
        />
      </FormField>
      <FormField label="备注" className="md:col-span-2">
        <InputControl
          spec={{ valueType: "string", editor: "textarea" }}
          value={editing.remark ?? ""}
          onChange={(value) => onChange("remark", String(value ?? ""))}
          rows={2}
        />
      </FormField>
    </CreatePanel>
  );
}
