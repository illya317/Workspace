import type { DataTableRowAction, DataTableRowEditActionConfig } from "./DataTable.types";

export function createDataTableEditActions<T>({
  row,
  editing,
  canEdit,
  canSave = true,
  disabled,
  saving,
  editLabel,
  saveLabel,
  cancelLabel,
  initial,
  current,
  onEdit,
  onSave,
  onCancel,
}: DataTableRowEditActionConfig<T> & { row: T }): DataTableRowAction[] {
  if (!canEdit) return [];
  const dirty = initial !== undefined ? isDataTableEditDirty(initial, current) : true;
  if (editing) {
    return [
      {
        key: "save",
        kind: "save",
        label: saveLabel,
        onClick: onSave,
        disabled: disabled || saving || !canSave || !dirty,
      },
      {
        key: "cancel",
        kind: "cancel",
        label: cancelLabel,
        onClick: onCancel,
        disabled: disabled || saving,
      },
    ];
  }
  return [{
    key: "edit",
    kind: "edit",
    label: editLabel,
    onClick: () => onEdit(row),
    disabled: disabled || saving,
  }];
}

function isDataTableEditDirty<T>(initial: T, current: T | null | undefined) {
  if (!current) return false;
  return stableSnapshot(initial) !== stableSnapshot(current);
}

function stableSnapshot(value: unknown): string {
  return JSON.stringify(stabilize(value));
}

function stabilize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stabilize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, stabilize(item)]),
  );
}
