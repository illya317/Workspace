"use client";

import { PageSurface, createFieldsBlock, createPageModalBlock } from "@workspace/core/ui";
import type { FormSurfaceFieldSpec } from "@workspace/core/ui";
import type { Contract, ModalMode } from "@workspace/administration/types";
import { CONTRACT_FORM_FIELD_CONFIGS } from "./contract-modal-config";

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
    ...CONTRACT_FORM_FIELD_CONFIGS.map<FormSurfaceFieldSpec>((f) => ({
      key: String(f.key),
      label: f.label,
      required: f.required,
      spec: {
        valueType: f.type === "number" ? "number" : "string",
        control: f.type === "number" ? "number" : "text",
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
      spec: { valueType: "date", control: "temporal", precision: "date" },
      value: editing.signDate,
      onChange: (value: unknown) => onChange("signDate", value ? String(value) : null),
    },
    {
      key: "endDate",
      label: "结束日期",
      spec: { valueType: "date", control: "temporal", precision: "date" },
      value: editing.endDate,
      onChange: (value: unknown) => onChange("endDate", value ? String(value) : null),
    },
    {
      key: "content",
      label: "合同内容",
      span: 2,
      spec: { valueType: "string", control: "text", multiline: true },
      value: editing.content ?? "",
      onChange: (value: unknown) => onChange("content", String(value ?? "")),
      rows: 2,
    },
    {
      key: "remark",
      label: "备注",
      span: 2,
      spec: { valueType: "string", control: "text", multiline: true },
      value: editing.remark ?? "",
      onChange: (value: unknown) => onChange("remark", String(value ?? "")),
      rows: 2,
    },
  ];

  return (
    <PageSurface
      kind="list"
      embedded
      blocks={[
        createPageModalBlock("contract", {
          open: Boolean(mode),
          title: mode === "create" ? "新增合同" : "编辑合同",
          maxWidth: "max-w-2xl",
          onClose,
          blocks: [
            createFieldsBlock("contract-form", fields, {
              onSubmit: onSave,
              columns: 2,
              actions: [
                { key: "cancel", label: "取消", onClick: onClose },
                { key: "save", label: saving ? "保存中..." : "保存", type: "submit", variant: "primary", disabled: saving },
              ],
            }),
          ],
        }),
      ]}
    />
  );
}
