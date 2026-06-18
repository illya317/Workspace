"use client";

import type { TabConfig, FieldConfig } from "../types";
import { formatHrMajorItems } from "@/lib/hr-field-options";

export function getVal(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((o, k) => {
    if (o !== null && typeof o === "object") {
      return (o as Record<string, unknown>)[k];
    }
    return undefined;
  }, obj);
}

function renderCell(item: Record<string, unknown>, field: FieldConfig, config: TabConfig): string {
  if (config.entityType === "Employee" && field.key === "alias") {
    const value = item.alias;
    if (!value) return "-";
    try {
      const parsed = JSON.parse(String(value));
      return Array.isArray(parsed) ? parsed.map((entry) => String(entry)).join("、") || "-" : String(value);
    } catch {
      return String(value);
    }
  }
  if (config.entityType === "Employee" && field.key === "major") {
    return formatHrMajorItems(item.major) || "-";
  }
  if (field.key === "gender") return item.gender === true ? "男" : item.gender === false ? "女" : "-";
  if (field.key === "level") {
    const map: Record<number, string> = { 1: "事业部", 2: "部门", 3: "子部门" };
    const level = item.level as number;
    return map[level] ?? String(level);
  }
  if (field.type === "boolean") {
    const labels = field.booleanLabels;
    if (item[field.key] === true) return labels?.true ?? "是";
    if (item[field.key] === false) return labels?.false ?? "否";
    return "-";
  }
  if (field.type === "select" && field.options) {
    const v = item[field.key];
    const found = field.options.find((o) => o.value === String(v ?? ""));
    return found?.label ?? String(v ?? "-");
  }
  if (field.type === "fk" && config.fkFields?.[field.key]) {
    const v = field.displayField
      ? getVal(item, field.displayField)
      : getVal(item, field.key + "Name") ?? getVal(item, config.fkFields[field.key].displayField) ?? "";
    return String(v || "-");
  }
  const v = field.displayField ? getVal(item, field.displayField) : item[field.key];
  return (v === null || v === undefined || v === "") ? "-" : String(v);
}

interface EditableTableProps {
  items: Record<string, unknown>[];
  visibleFields: FieldConfig[];
  config: TabConfig;
  editingCell: { id: number; field: string } | null;
  editMode: boolean;
  canEdit: boolean;
  renderEditInput: (fieldKey: string) => React.ReactNode;
  onStartEdit: (item: Record<string, unknown>, field: FieldConfig) => void;
}

export default function EditableTable({
  items,
  visibleFields,
  config,
  editingCell,
  editMode,
  canEdit,
  renderEditInput,
  onStartEdit,
}: EditableTableProps) {
  return (
    <table className="w-full text-xs">
      <thead className="border-b bg-gray-50">
        <tr>
          {visibleFields.map((f) => (
            <th key={f.key} className="whitespace-nowrap px-3 py-2 text-left font-medium text-gray-600" style={{ width: f.width }}>
              {f.label}
            </th>
          ))}

        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr key={item.id as React.Key} className="border-b last:border-0 hover:bg-gray-50">
            {visibleFields.map((f) => {
              const isEditing = editingCell?.id === item.id && editingCell?.field === f.key;
              return (
                <td
                  key={f.key}
                  onClick={() => onStartEdit(item, f)}
                  className={`whitespace-nowrap px-3 py-2 text-gray-700 ${editMode && f.editable && canEdit ? "cursor-pointer hover:bg-emerald-50" : ""}`}
                >
                  {isEditing ? renderEditInput(f.key) : renderCell(item, f, config)}
                </td>
              );
            })}

          </tr>
        ))}
      </tbody>
    </table>
  );
}
