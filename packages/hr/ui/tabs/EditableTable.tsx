"use client";

import { useMemo } from "react";
import { DataTable, type DataTableColumn } from "@workspace/core/ui";
import type { TabConfig, FieldConfig } from "@workspace/hr/types";
import { formatHrMajorItems } from "@workspace/hr/constants/field-options";

export function getVal(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((o, k) => {
    if (o !== null && typeof o === "object") {
      return (o as Record<string, unknown>)[k];
    }
    return undefined;
  }, obj);
}

export function formatEditableTableCell(item: Record<string, unknown>, field: FieldConfig, config: TabConfig): string {
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
  fields: FieldConfig[];
  visibleColumns: string[];
  config: TabConfig;
  editingCell: { id: number; field: string } | null;
  editMode: boolean;
  canEdit: boolean;
  renderEditInput: (fieldKey: string) => React.ReactNode;
  onStartEdit: (item: Record<string, unknown>, field: FieldConfig) => void;
}

export default function EditableTable({
  items,
  fields,
  visibleColumns,
  config,
  editingCell,
  editMode,
  canEdit,
  renderEditInput,
  onStartEdit,
}: EditableTableProps) {
  const columns = useMemo<DataTableColumn<Record<string, unknown>>[]>(
    () => fields.map((field) => {
      const editableCell = editMode && field.editable && field.type !== "fk" && canEdit;
      return {
        key: field.key,
        label: field.label,
        required: field.required,
        defaultVisible: field.defaultVisible,
        headerClassName: "text-left text-gray-600",
        cellClassName: `text-gray-700 ${editableCell ? "cursor-pointer hover:bg-emerald-50" : ""}`,
        render: (item) => {
          const isEditing = editingCell?.id === item.id && editingCell?.field === field.key;
          return (
            <span
              className="block min-w-max"
              style={{ width: field.width }}
              onClick={(event) => {
                event.stopPropagation();
                if (editableCell) onStartEdit(item, field);
              }}
            >
              {isEditing ? renderEditInput(field.key) : formatEditableTableCell(item, field, config)}
            </span>
          );
        },
      };
    }),
    [canEdit, config, editMode, editingCell, fields, onStartEdit, renderEditInput],
  );

  return (
    <DataTable
      rows={items}
      columns={columns}
      visibleColumns={visibleColumns}
      rowKey={(item) => String(item.id)}
      density="compact"
      tableClassName="w-full text-xs"
    />
  );
}
