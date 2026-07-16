"use client";

import { useMemo } from "react";
import {
  type DataSurfaceColumnSpec,
  type DataSurfaceCellSpec,
  type DataSurfaceRowActionSpec,
  createPageBody,
  BodySurface,
} from "@workspace/core/ui";
import type { BodySurfaceSectionSpec } from "@workspace/core/ui";
import type { TabConfig, FieldConfig } from "@workspace/hr/types";
import {
  formatHrMajorItems,
  HR_VIRTUAL_EMPLOYEE_PERSONNEL_TYPE,
} from "@workspace/hr/constants/field-options";

export function isEditableHrTableCell(
  item: Record<string, unknown>,
  field: FieldConfig,
  config: TabConfig,
) {
  return !(
    config.entityType === "Employment"
    && field.key === "personnelType"
    && item.personnelType === HR_VIRTUAL_EMPLOYEE_PERSONNEL_TYPE
  );
}

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
  renderEditInput: (fieldKey: string) => DataSurfaceCellSpec | null;
  onStartEdit: (item: Record<string, unknown>, field: FieldConfig) => void;
  rowActions?: (item: Record<string, unknown>) => DataSurfaceRowActionSpec[];
  framed?: boolean;
  loading?: boolean;
  emptyText?: string;
  bodyClassName?: string;
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
  rowActions,
  loading,
  emptyText,
}: EditableTableProps) {
  const section = useEditableTableSection({
    items,
    fields,
    visibleColumns,
    config,
    editingCell,
    editMode,
    canEdit,
    renderEditInput,
    onStartEdit,
    rowActions,
    loading,
    emptyText,
  });
  return <BodySurface {...createPageBody([section], { layout: "stack" })} />;
}

export function useEditableTableSection({
  items,
  fields,
  visibleColumns,
  config,
  editingCell,
  editMode,
  canEdit,
  renderEditInput,
  onStartEdit,
  rowActions,
  loading,
  emptyText,
}: EditableTableProps): BodySurfaceSectionSpec {
  const columns = useMemo<DataSurfaceColumnSpec<Record<string, unknown>>[]>(
    () => fields.map((field) => {
      const editableCell = editMode && field.editable && canEdit;
      return {
        key: field.key,
        label: field.label,
        required: field.required,
        defaultVisible: field.defaultVisible,


        cell: (item) => {
          const rowEditable = editableCell && isEditableHrTableCell(item, field, config);
          const isEditing = rowEditable && editingCell?.id === item.id && editingCell?.field === field.key;
          if (isEditing) return renderEditInput(field.key);
          const content: DataSurfaceCellSpec = { kind: "text", value: formatEditableTableCell(item, field, config), wrap: "nowrap" };
          return rowEditable
            ? { kind: "interactive", content, ariaLabel: `编辑${field.label}`, onClick: () => onStartEdit(item, field) }
            : content;
        },
      };
    }),
    [canEdit, config, editMode, editingCell, fields, onStartEdit, renderEditInput],
  );

  return {
    key: "editable-table",
    body: { kind: "data", data: {
      kind: "table",
      rows: items,
      columns,
      visibleColumns,
      rowKey: (item) => String(item.id),
      rowActions,
      actionsColumn: rowActions ? { label: "操作", align: "center" } : undefined,
      presentation: { density: "compact",
 },
      loading,
      emptyText,
    } },
  };
}
