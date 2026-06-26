"use client";

import { FormSurface } from "@workspace/core/ui";
import type { FormSurfaceFieldSpec } from "@workspace/core/ui";
import type { Contract, ModalMode } from "@workspace/administration/types";

interface ContractFormFieldConfig {
  label: string;
  key: keyof Contract;
  required?: boolean;
  type?: "number";
}

const FORM_FIELDS: ContractFormFieldConfig[] = [
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

  const fields: FormSurfaceFieldSpec[] = [
    ...FORM_FIELDS.map<FormSurfaceFieldSpec>((f) => ({
      key: String(f.key),
      label: f.label,
      required: f.required,
      spec: {
        valueType: f.type === "number" ? "number" : "string",
        editor: f.type === "number" ? "number" : "input",
        validation: f.required ? { required: true } : undefined,
      },
      value: editing[f.key] === null || editing[f.key] === undefined ? "" : String(editing[f.key]),
      onChange: (value: unknown) =>
        onChange(
          f.key,
          f.type === "number"
            ? value
              ? parseFloat(String(value))
              : null
            : String(value ?? ""),
        ),
    })),
    {
      key: "signDate",
      label: "签订日期",
      spec: { valueType: "date", editor: "datePicker" },
      value: editing.signDate,
      onChange: (value: unknown) => onChange("signDate", value ? String(value) : null),
    },
    {
      key: "endDate",
      label: "结束日期",
      spec: { valueType: "date", editor: "datePicker" },
      value: editing.endDate,
      onChange: (value: unknown) => onChange("endDate", value ? String(value) : null),
    },
    {
      key: "content",
      label: "合同内容",
      span: 2,
      spec: { valueType: "string", editor: "textarea" },
      value: editing.content ?? "",
      onChange: (value: unknown) => onChange("content", String(value ?? "")),
      rows: 2,
    },
    {
      key: "remark",
      label: "备注",
      span: 2,
      spec: { valueType: "string", editor: "textarea" },
      value: editing.remark ?? "",
      onChange: (value: unknown) => onChange("remark", String(value ?? "")),
      rows: 2,
    },
  ];

  return (
    <FormSurface
      kind="modal"
      open={Boolean(mode)}
      title={mode === "create" ? "新增合同" : "编辑合同"}
      maxWidth="max-w-2xl"
      onClose={onClose}
      onSubmit={onSave}
      columns={2}
      fields={fields}
      actions={[
        { key: "cancel", label: "取消", onClick: onClose },
        { key: "save", label: saving ? "保存中..." : "保存", type: "submit", variant: "primary", disabled: saving },
      ]}
    />
  );
}
