"use client";

import { createFieldsSection, createPageBody, createPageModalSection, BodySurface } from "@workspace/core/ui";
import type { CreateSurfaceSectionSpec, FormSurfaceFieldSpec } from "@workspace/core/ui";
import type { Contract, ModalMode } from "@workspace/administration/types";
import { CONTRACT_FORM_FIELD_CONFIGS, CONTRACT_STATUS_OPTIONS } from "./contract-modal-config";

interface ContractModalProps {
  mode: ModalMode;
  editing: Partial<Contract>;
  onChange: (field: keyof Contract, value: string | number | null) => void;
  onSave: () => void;
  onClose: () => void;
  saving: boolean;
  locations: string[];
  categories: string[];
}

export default function ContractModal({ mode, editing, onChange, onSave, onClose, saving, locations, categories }: ContractModalProps) {
  if (mode !== "edit") return null;

  const fields = contractFormFields(editing, onChange, { locations, categories });

  return (
    <BodySurface {...createPageBody([
        createPageModalSection("contract", {
          open: true,
          title: "编辑合同",
          size: "md",
          onClose,
          sections: [
            createFieldsSection("contract-form", fields, {
              submit: { onSubmit: onSave },
              layout: { columns: 2 },
              actions: [
                { key: "cancel", action: "cancel", label: "取消", onClick: onClose },
                { key: "save", action: "save", label: saving ? "保存中..." : "保存", disabled: saving },
              ],
            }),
          ],
        }),
      ])} />
  );
}

export function contractFormFields(
  editing: Partial<Contract>,
  onChange: (field: keyof Contract, value: string | number | null) => void,
  choices: ContractFormChoices,
): FormSurfaceFieldSpec[] {
  return [
    ...CONTRACT_FORM_FIELD_CONFIGS.map<FormSurfaceFieldSpec>((f) => ({
      key: String(f.key),
      label: f.label,
      required: f.required,
      spec: {
        valueType: f.type === "number" ? "number" : "string",
        control: f.type === "number" ? "number" : f.choice ? "choice" : "text",
        options: f.choice ? {
          source: "static",
          items: (f.choice === "status"
            ? [...CONTRACT_STATUS_OPTIONS]
            : choiceValues(f.choice === "category" ? choices.categories : choices.locations, editing[f.key]))
            .map((value) => ({ value, label: value })),
        } : undefined,
        validation: f.required ? { required: true } : undefined,
      },
      value: f.choice === "status" && editing[f.key] === "已失效"
        ? "已结束"
        : editing[f.key] === null || editing[f.key] === undefined ? "" : String(editing[f.key]),
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
}

const CONTRACT_FORM_SECTION_KEYS = [
  { key: "identity", title: "基本信息", fields: ["contractNo", "name", "category", "status"] },
  { key: "parties", title: "签约主体", fields: ["partyA", "partyB", "shareholder", "handler"] },
  { key: "execution", title: "履行与归档", fields: ["amount", "executedAmount", "signDate", "endDate", "location"] },
  { key: "notes", title: "内容与备注", fields: ["content", "remark"] },
] as const;

export function contractFormSections(
  editing: Partial<Contract>,
  onChange: (field: keyof Contract, value: string | number | null) => void,
  choices: ContractFormChoices,
): CreateSurfaceSectionSpec<FormSurfaceFieldSpec>[] {
  const fieldsByKey = new Map(contractFormFields(editing, onChange, choices).map((field) => [field.key, field]));
  return CONTRACT_FORM_SECTION_KEYS.map((section) => ({
    key: section.key,
    title: section.title,
    layout: { columns: 2, density: "compact" },
    items: section.fields.map((key) => {
      const field = fieldsByKey.get(key);
      if (!field) throw new Error(`合同字段声明缺失: ${key}`);
      return key === "location" ? { ...field, span: 2 } : field;
    }),
  }));
}

export interface ContractFormChoices {
  locations: string[];
  categories: string[];
}

function choiceValues(values: string[], current: unknown) {
  return [...new Set([String(current ?? "").trim(), ...values.map((value) => value.trim())])]
    .filter(Boolean);
}
