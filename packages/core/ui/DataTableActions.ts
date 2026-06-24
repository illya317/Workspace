import type { DataTableRowAction } from "./DataTable";

export interface DataTableEditActionsOptions<T> {
  row: T;
  editing: boolean;
  canEdit: boolean;
  canSave?: boolean;
  dirty?: boolean;
  disabled?: boolean;
  saving?: boolean;
  editLabel: string;
  saveLabel: string;
  cancelLabel: string;
  onEdit: (row: T) => void;
  onSave: () => void;
  onCancel: () => void;
}

export function createDataTableEditActions<T>({
  row,
  editing,
  canEdit,
  canSave = true,
  dirty = true,
  disabled,
  saving,
  editLabel,
  saveLabel,
  cancelLabel,
  onEdit,
  onSave,
  onCancel,
}: DataTableEditActionsOptions<T>): DataTableRowAction[] {
  if (!canEdit) return [];
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

export function isDataTableEditDirty<T>(initial: T, current: T | null | undefined) {
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
