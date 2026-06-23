import type { DataTableRowAction } from "./DataTable";

export interface DataTableEditActionsOptions<T> {
  row: T;
  editing: boolean;
  canEdit: boolean;
  canSave?: boolean;
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
        disabled: disabled || saving || !canSave,
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
