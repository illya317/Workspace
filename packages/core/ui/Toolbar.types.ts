import type { ReactNode } from "react";
import type { ActionGlyphKind } from "./ActionGlyphs";
import type { ColumnDef } from "./DataTable";
import type { FieldValueFilterField } from "./FieldValueFilter";
import type { SelectFieldOption } from "./SelectField";
import type { ToolbarOption } from "./ToolbarOptionGroup";

export type ToolbarSection = "search" | "view" | "filter" | "action" | "edit" | "meta";

export interface ToolbarItemBase {
  section?: ToolbarSection;
}

export interface ToolbarIconButtonItem extends ToolbarItemBase {
  kind: "icon-button";
  key: string;
  icon: ActionGlyphKind;
  label: string;
  variant?: "primary" | "secondary" | "danger";
  type?: "button" | "submit";
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
  iconClassName?: string;
}

export interface ToolbarSearchItem extends ToolbarItemBase {
  kind: "search";
  key: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  scope?: "full" | readonly string[];
  className?: string;
}

export interface ToolbarSelectItem extends ToolbarItemBase {
  kind: "select";
  key: string;
  value: string;
  options: SelectFieldOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  triggerClassName?: string;
}

export interface ToolbarOptionGroupItem extends ToolbarItemBase {
  kind: "option-group";
  key: string;
  value: string;
  options: ToolbarOption[];
  onChange: (value: string) => void;
  ariaLabel?: string;
}

export interface ToolbarFieldFilterItem extends ToolbarItemBase {
  kind: "field-filter";
  key: string;
  fieldKey: string;
  onFieldKeyChange: (key: string) => void;
  value: string;
  onValueChange: (value: string) => void;
  fields: FieldValueFilterField[];
  valueOptions: Record<string, SelectFieldOption[]>;
  placeholder?: string;
  disabled?: boolean;
  referenceEndpoint?: string;
}

export interface ToolbarColumnToggleItem extends ToolbarItemBase {
  kind: "column-toggle";
  key: string;
  columns: ColumnDef[];
  visible: string[];
  onChange: (visible: string[]) => void;
}

export interface ToolbarTextItem extends ToolbarItemBase {
  kind: "text";
  key: string;
  content: ReactNode;
}

export interface ToolbarCustomItem extends ToolbarItemBase {
  kind: "custom";
  key: string;
  content: ReactNode;
}

export interface ToolbarActionGroupAction {
  key?: string;
  label: string;
  kind: ActionGlyphKind;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "danger";
  type?: "button" | "submit";
}

export interface ToolbarActionGroupItem extends ToolbarItemBase {
  kind: "action-group";
  key: string;
  actions: ToolbarActionGroupAction[];
}

export interface ToolbarEditGroupItem extends ToolbarItemBase {
  kind: "edit-group";
  key: string;
  editMode: boolean;
  canEdit?: boolean;
  editLabel?: string;
  saveLabel?: string;
  saving?: boolean;
  downloading?: boolean;
  onStartEdit: () => void;
  onSave: () => Promise<void> | void;
  onCancel: () => void;
  onDownload?: () => void;
  onShowHistory?: () => void;
}

export interface ToolbarCreateItem extends ToolbarItemBase {
  kind: "create";
  key: string;
  label?: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

export type ToolbarItem =
  | ToolbarIconButtonItem
  | ToolbarSearchItem
  | ToolbarSelectItem
  | ToolbarOptionGroupItem
  | ToolbarFieldFilterItem
  | ToolbarColumnToggleItem
  | ToolbarTextItem
  | ToolbarCustomItem
  | ToolbarActionGroupItem
  | ToolbarEditGroupItem
  | ToolbarCreateItem;

export interface ToolbarProps {
  items: ToolbarItem[];
  className?: string;
  onSubmit?: () => void;
  variant?: "bar" | "inline";
}
