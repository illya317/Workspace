import type { KeyboardEvent, RefObject } from "react";
import { type DataSurfaceCellInputSpec, type ReferenceOption } from "@workspace/core/ui";
import type { FieldConfig } from "@workspace/hr/types";
import { formatPhoneNumber, normalizeChineseIdNumber, normalizePhoneValue } from "@workspace/hr/utils/identity";
import { HR_REFERENCE_OPTIONS_ENDPOINT, fkKeyForEntity } from "../fk-keys";

interface GenericEditInputSpecInput {
  field: FieldConfig;
  value: unknown;
  onChange: (value: unknown) => void;
  onKeyDown?: (event: KeyboardEvent) => void;
  inputRef?: RefObject<HTMLInputElement | null>;
  fkConfig?: { entity: string; fkKey?: string; displayField?: string };
}

export function createGenericEditInputSpec({
  field,
  value,
  onChange,
  onKeyDown,
  inputRef,
  fkConfig,
}: GenericEditInputSpecInput): DataSurfaceCellInputSpec {
  if (field.type === "fk" && fkConfig) {
    const selected = value && typeof value === "object" && "id" in value ? value as { id?: number; name?: string } : null;
    return {
      kind: "input",
      spec: { valueType: "reference", control: "reference", options: { source: "remote", fkKey: fkKeyForEntity(fkConfig.entity, fkConfig.fkKey), endpoint: HR_REFERENCE_OPTIONS_ENDPOINT, returnField: "id" } },
      value: selected?.id ? String(selected.id) : typeof value === "number" ? String(value) : "",
      displayValue: selected?.name ?? (typeof value === "string" ? value : ""),
      onChange: (_label, option) => {
        const selectedOption = option as ReferenceOption | undefined;
        onChange(selectedOption ? { id: selectedOption.id, name: selectedOption.name, subtitle: selectedOption.subtitle } : null);
      },
      placeholder: "输入搜索...",
      onKeyDown,
      inputRef,
      density: "compact",
    };
  }
  if (field.key === "gender") return { kind: "input", spec: { valueType: "string", control: "choice", options: { source: "static", items: [{ label: "男", value: "男" }, { label: "女", value: "女" }] } }, value: value === true || value === "男" ? "男" : "女", onChange, onKeyDown, inputRef, density: "compact" };
  if (field.type === "select" && field.options?.length) return { kind: "input", spec: { valueType: "string", control: "choice", options: { source: "static", items: field.options, visibleCount: 5 } }, value: String(value ?? ""), onChange, onKeyDown, inputRef, density: "compact" };
  if (field.type === "boolean") return { kind: "input", spec: { valueType: "boolean", control: "boolean", presentation: "switch" }, value: Boolean(value), onChange, onKeyDown, inputRef, density: "compact" };
  if (field.type === "date") return { kind: "input", spec: { valueType: "date", control: "temporal", precision: "date" }, value: String(value ?? ""), onChange, onKeyDown, inputRef, density: "compact" };
  if (field.type === "textarea") return { kind: "input", spec: { valueType: "string", control: "text", multiline: true }, value: String(value ?? ""), onChange, onKeyDown, rows: 3, density: "compact" };
  if (field.type === "phone") return { kind: "input", spec: { valueType: "string", control: "text" }, type: "tel", value: formatPhoneNumber(value), onChange: next => onChange(normalizePhoneValue(String(next ?? ""))), onKeyDown, inputRef, density: "compact" };
  if (field.type === "chineseId") return { kind: "input", spec: { valueType: "string", control: "text" }, value: normalizeChineseIdNumber(value) ?? "", maxLength: 18, onChange: next => onChange(normalizeChineseIdNumber(String(next ?? ""))?.slice(0, 18) ?? null), onKeyDown, inputRef, density: "compact" };
  return { kind: "input", spec: { valueType: field.type === "number" ? "number" : "string", control: field.type === "number" ? "number" : "text" }, type: field.type === "number" ? "number" : "text", value: String(value ?? ""), onChange, onKeyDown, inputRef, density: "compact" };
}
