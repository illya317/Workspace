import type { ReactNode } from "react";
import type { ActionGlyphKind } from "../action/ActionGlyphs";
import type { ColumnDef } from "../data/DataTable";
import type { FieldValueFilterField } from "../input/FieldValueFilter";
import type { InputOption } from "../input/InputSurfaceTypes";
import type { ToolbarOption } from "./ToolbarOptionGroup";

export type ToolbarSection = "primary" | "search" | "filter" | "edit" | "action" | "meta" | "view";

export type ToolbarZoneKey = "lead" | "search" | "filter" | "actions" | "trailing";

export type ToolbarLayoutMode = "auto" | "compact" | "split";

export type ToolbarActionGlyphKind = Exclude<ActionGlyphKind, "add">;
export type ToolbarActionSemanticKey =
  | "access"
  | "admin"
  | "approve"
  | "back"
  | "close"
  | "confirm"
  | "export"
  | "import"
  | "open"
  | "reject"
  | "remove"
  | "retry"
  | "revise"
  | "submit"
  | "withdraw"
  | "write";
export type ToolbarActionKind = ToolbarActionGlyphKind | ToolbarActionSemanticKey;

export interface ToolbarIconButtonItem {
  kind: "icon-button";
  key: string;
  icon: ToolbarActionGlyphKind;
  label: string;
  variant?: "primary" | "secondary" | "danger";
  type?: "button" | "submit";
  disabled?: boolean;
  onClick?: () => void;
}

export interface ToolbarPanelToggleItem {
  kind: "panel-toggle";
  key: string;
  icon: Extract<ActionGlyphKind, "panel-open" | "panel-close">;
  label: string;
  variant?: "primary" | "secondary";
  disabled?: boolean;
  visibility?: "always" | "mobile" | "desktop";
  onClick?: () => void;
}

export interface ToolbarSearchItem {
  kind: "search";
  key: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  scope?: "full" | readonly string[];
}

export interface ToolbarSelectItem {
  kind: "select";
  key: string;
  value: string;
  options: InputOption[];
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  searchable?: boolean;
  visibleCount?: number;
}

export interface ToolbarAutocompleteItem {
  kind: "autocomplete";
  key: string;
  value: string;
  options: InputOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  visibleCount?: number;
}

export interface ToolbarOptionGroupItem {
  kind: "option-group";
  key: string;
  value: string;
  options: ToolbarOption[];
  onChange: (value: string) => void;
  label?: ReactNode;
  ariaLabel?: string;
  presentation?: "segmented" | "accordion";
}

export interface ToolbarFieldFilterItem {
  kind: "field-filter";
  key: string;
  fieldKey: string;
  onFieldKeyChange: (key: string) => void;
  value: string;
  onValueChange: (value: string, fieldKey?: string) => void;
  fields: FieldValueFilterField[];
  valueOptions: Record<string, InputOption[]>;
  placeholder?: string;
  disabled?: boolean;
  referenceEndpoint?: string;
}

export interface ToolbarColumnToggleItem {
  kind: "column-toggle";
  key: string;
  columns: ColumnDef[];
  visible: string[];
  onChange: (visible: string[]) => void;
}

export interface ToolbarPageSizeItem {
  kind: "page-size";
  key: string;
  value: string;
  options: InputOption[];
  onChange: (value: string) => void;
  label?: string;
}

export interface ToolbarPeriodDateItem {
  kind: "period";
  key: string;
  mode: "date";
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
}

export interface ToolbarPeriodMonthItem {
  kind: "period";
  key: string;
  mode: "month";
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
}

export interface ToolbarPeriodNavItem {
  kind: "period";
  key: string;
  mode: "nav";
  label: ReactNode;
  previousLabel?: string;
  nextLabel?: string;
  onPrevious: () => void;
  onNext: () => void;
  disabled?: boolean;
}

export type ToolbarPeriodItem = ToolbarPeriodDateItem | ToolbarPeriodMonthItem | ToolbarPeriodNavItem;

export interface ToolbarTextItem {
  kind: "text";
  key: string;
  content: ReactNode;
}

export interface ToolbarMenuTriggerSpec {
  label: string;
  avatarUrl?: string | null;
  initials?: string;
  ariaLabel?: string;
}

export interface ToolbarMenuActionItem {
  key: string;
  label: string;
  tone?: "default" | "danger";
  href?: string;
  onSelect?: () => void | Promise<void>;
  disabled?: boolean;
  separatorBefore?: boolean;
}

export interface ToolbarMenuItem {
  kind: "menu";
  key: string;
  trigger: ToolbarMenuTriggerSpec;
  items: ToolbarMenuActionItem[];
  align?: "left" | "right";
  disabled?: boolean;
}

export interface ToolbarActionGroupAction {
  key?: string;
  label: string;
  kind: ToolbarActionKind;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "danger";
  type?: "button" | "submit";
}

export interface ToolbarActionGroupItem {
  kind: "action-group";
  key: string;
  actions: ToolbarActionGroupAction[];
}

export interface ToolbarEditGroupItem {
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

export interface ToolbarCreateItem {
  kind: "create";
  key: string;
  label?: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

export type ToolbarItem =
  | ToolbarIconButtonItem
  | ToolbarPanelToggleItem
  | ToolbarSearchItem
  | ToolbarSelectItem
  | ToolbarAutocompleteItem
  | ToolbarOptionGroupItem
  | ToolbarFieldFilterItem
  | ToolbarColumnToggleItem
  | ToolbarPageSizeItem
  | ToolbarPeriodItem
  | ToolbarTextItem
  | ToolbarMenuItem
  | ToolbarActionGroupItem
  | ToolbarEditGroupItem
  | ToolbarCreateItem;

export interface ToolbarProps {
  items: ToolbarItem[];
  onSubmit?: () => void;
}
