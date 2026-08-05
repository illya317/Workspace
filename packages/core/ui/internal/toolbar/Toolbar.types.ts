import type { ReactNode } from "react";
import type { SurfaceAutocompleteOptionSpec, SurfaceSelectOptionGroupSpec } from "../../SurfaceContractTypes";
import type { ActionGlyphKind } from "../action/ActionGlyphs";
import type { ColumnDef } from "../data/DataTable.types";
import type { FieldValueFilterField } from "../input/FieldValueFilter";
import type { InputOption } from "../input/InputSurfaceTypes";

export interface ToolbarOption {
  value: string;
  label: ReactNode;
  disabled?: boolean;
}

export type ToolbarSection = "primary" | "search" | "filter" | "edit" | "action" | "meta" | "view";

export type ToolbarZoneKey = "lead" | "search" | "filter" | "actions" | "trailing";

export type ToolbarLayoutMode = "auto" | "compact" | "split";
export type ToolbarVisibility = "always" | "mobile" | "desktop";

export type ToolbarActionGlyphKind = Exclude<ActionGlyphKind, "add">;
export type ToolbarActionSemanticKey =
  | "apiUse"
  | "approve"
  | "back"
  | "close"
  | "confirm"
  | "configure"
  | "audit"
  | "entry"
  | "export"
  | "grant"
  | "import"
  | "open"
  | "read"
  | "reject"
  | "remove"
  | "reverse"
  | "retry"
  | "submit"
  | "update";
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

export interface ToolbarGroupedSelectItem {
  kind: "grouped-select";
  key: string;
  value: string;
  groups: SurfaceSelectOptionGroupSpec[];
  onChange: (value: string) => void;
  placeholder?: string;
  groupLabel?: string;
  optionLabel?: string;
  visibleCount?: number;
  disabled?: boolean;
}

export interface ToolbarAutocompleteItem {
  kind: "autocomplete";
  key: string;
  value: string;
  options: SurfaceAutocompleteOptionSpec[];
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  visibleCount?: number;
}

export interface ToolbarLabelItem {
  kind: "label";
  key: string;
  label: ReactNode;
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
  accordionTrigger?: "default" | "active";
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

export interface ToolbarFilterPanelFieldSpec {
  key: string;
  label: string;
  value: string;
  options: InputOption[];
  onChange: (value: string) => void;
  allLabel?: string;
}

export interface ToolbarFilterPanelItem {
  kind: "filter-panel";
  key: string;
  label?: string;
  fields: ToolbarFilterPanelFieldSpec[];
  onReset?: () => void;
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

export interface ToolbarPeriodNavPickerSpec {
  precision: "year" | "quarter" | "month" | "week";
  value: string;
  onChange: (value: string) => void;
  ariaLabel?: string;
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
  picker?: ToolbarPeriodNavPickerSpec;
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
  joined?: boolean;
}

export interface ToolbarEditGroupItem {
  kind: "edit-group";
  key: string;
  editMode: boolean;
  dirty?: boolean;
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
  scrollOnCreate?: boolean;
  onClick: () => void;
}

export type ToolbarItem = {
  visibility?: ToolbarVisibility;
} & (
  | ToolbarIconButtonItem
  | ToolbarPanelToggleItem
  | ToolbarSearchItem
  | ToolbarSelectItem
  | ToolbarGroupedSelectItem
  | ToolbarAutocompleteItem
  | ToolbarLabelItem
  | ToolbarOptionGroupItem
  | ToolbarFieldFilterItem
  | ToolbarFilterPanelItem
  | ToolbarColumnToggleItem
  | ToolbarPageSizeItem
  | ToolbarPeriodItem
  | ToolbarTextItem
  | ToolbarMenuItem
  | ToolbarActionGroupItem
  | ToolbarEditGroupItem
  | ToolbarCreateItem
);

export interface ToolbarProps {
  items: ToolbarItem[];
  onSubmit?: () => void;
  defaultAssistant?: false | {
    contextLabel?: string;
    sourceContext?: {
      navigationLabel?: string;
      activeKey?: string;
      activeLabel?: string;
      activeChildKey?: string;
      activeChildLabel?: string;
    };
  };
}
