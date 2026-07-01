import type { ReactNode } from "react";
import type { ActionGlyphKind } from "./internal/action/ActionGlyphs";

export type SurfaceLifecycleScope = "active" | "all" | "archived";

export interface ReferenceOption {
  id: number;
  name: string;
  subtitle?: string;
  departmentId?: number | null;
  departmentPath?: string | null;
  lifecycleStatus?: "active" | "archived" | "inactive";
}

export interface SurfaceSelectOptionSpec {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SurfacePickerOptionSpec {
  label: string;
  value: string;
  description?: string;
}

export interface SurfaceColumnOptionSpec {
  key: string;
  label: ReactNode;
  defaultVisible?: boolean;
  required?: boolean;
}

export type SurfaceDataRowActionKind = "view" | "add" | "edit" | "save" | "cancel" | "delete";

export interface SurfaceDataRowActionSpec {
  key: string;
  label: string;
  kind: SurfaceDataRowActionKind;
  onClick: () => void;
  disabled?: boolean;
}

export interface SurfaceDataRowEditActionSpec<T> {
  editing: boolean;
  canEdit: boolean;
  canSave?: boolean;
  disabled?: boolean;
  saving?: boolean;
  editLabel: string;
  saveLabel: string;
  cancelLabel: string;
  initial?: unknown;
  current?: unknown | null | undefined;
  onEdit: (row: T) => void;
  onSave: () => void;
  onCancel: () => void;
}

export type SurfaceFilterValueKind = "text" | "fk";

export interface SurfaceFilterFieldSpec extends SurfaceSelectOptionSpec {
  valueKind?: SurfaceFilterValueKind;
  fkKey?: string;
  fkReturnField?: "id" | "name";
  referenceEndpoint?: string;
  lifecycleScope?: SurfaceLifecycleScope;
  placeholder?: string;
}

export interface SurfaceNavigationTabSpec {
  key: string;
  label: ReactNode;
  children?: SurfaceNavigationTabSpec[];
}

export type SurfaceToolbarActionGlyphKind = Exclude<ActionGlyphKind, "add">;

export interface SurfaceToolbarIconButtonItem {
  kind: "icon-button";
  key: string;
  icon: SurfaceToolbarActionGlyphKind;
  label: string;
  variant?: "primary" | "secondary" | "danger";
  type?: "button" | "submit";
  disabled?: boolean;
  onClick?: () => void;
}

export interface SurfaceToolbarPanelToggleItem {
  kind: "panel-toggle";
  key: string;
  icon: Extract<ActionGlyphKind, "panel-open" | "panel-close">;
  label: string;
  variant?: "primary" | "secondary";
  disabled?: boolean;
  visibility?: "always" | "mobile" | "desktop";
  onClick?: () => void;
}

export interface SurfaceToolbarSearchItem {
  kind: "search";
  key: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  scope?: "full" | readonly string[];
}

export interface SurfaceToolbarSelectItem {
  kind: "select";
  key: string;
  value: string;
  options: SurfaceSelectOptionSpec[];
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  searchable?: boolean;
  visibleCount?: number;
}

export interface SurfaceToolbarAutocompleteItem {
  kind: "autocomplete";
  key: string;
  value: string;
  options: SurfaceSelectOptionSpec[];
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  visibleCount?: number;
}

export interface SurfaceToolbarOption {
  value: string;
  label: ReactNode;
  disabled?: boolean;
}

export interface SurfaceToolbarOptionGroupItem {
  kind: "option-group";
  key: string;
  value: string;
  options: SurfaceToolbarOption[];
  onChange: (value: string) => void;
  label?: ReactNode;
  ariaLabel?: string;
  presentation?: "segmented" | "accordion";
}

export interface SurfaceToolbarFieldFilterItem {
  kind: "field-filter";
  key: string;
  fieldKey: string;
  onFieldKeyChange: (key: string) => void;
  value: string;
  onValueChange: (value: string, fieldKey?: string) => void;
  fields: SurfaceFilterFieldSpec[];
  valueOptions: Record<string, SurfaceSelectOptionSpec[]>;
  placeholder?: string;
  disabled?: boolean;
  referenceEndpoint?: string;
}

export interface SurfaceToolbarColumnToggleItem {
  kind: "column-toggle";
  key: string;
  columns: SurfaceColumnOptionSpec[];
  visible: string[];
  onChange: (visible: string[]) => void;
}

export interface SurfaceToolbarPageSizeItem {
  kind: "page-size";
  key: string;
  value: string;
  options: SurfaceSelectOptionSpec[];
  onChange: (value: string) => void;
  label?: string;
}

export interface SurfaceToolbarPeriodDateItem {
  kind: "period";
  key: string;
  mode: "date";
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
}

export interface SurfaceToolbarPeriodMonthItem {
  kind: "period";
  key: string;
  mode: "month";
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
}

export interface SurfaceToolbarPeriodNavItem {
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

export type SurfaceToolbarPeriodItem = SurfaceToolbarPeriodDateItem | SurfaceToolbarPeriodMonthItem | SurfaceToolbarPeriodNavItem;

export interface SurfaceToolbarTextItem {
  kind: "text";
  key: string;
  content: ReactNode;
}

export interface SurfaceToolbarMenuTriggerSpec {
  label: string;
  avatarUrl?: string | null;
  initials?: string;
  ariaLabel?: string;
}

export interface SurfaceToolbarMenuActionItem {
  key: string;
  label: string;
  tone?: "default" | "danger";
  href?: string;
  onSelect?: () => void | Promise<void>;
  disabled?: boolean;
  separatorBefore?: boolean;
}

export interface SurfaceToolbarMenuItem {
  kind: "menu";
  key: string;
  trigger: SurfaceToolbarMenuTriggerSpec;
  items: SurfaceToolbarMenuActionItem[];
  align?: "left" | "right";
  disabled?: boolean;
}

export interface SurfaceToolbarActionGroupActionSpec {
  key?: string;
  label: string;
  kind: SurfaceToolbarActionGlyphKind;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "danger";
  type?: "button" | "submit";
}

export interface SurfaceToolbarActionGroupItem {
  kind: "action-group";
  key: string;
  actions: SurfaceToolbarActionGroupActionSpec[];
}

export interface SurfaceToolbarEditGroupItem {
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

export interface SurfaceToolbarCreateItem {
  kind: "create";
  key: string;
  label?: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

export type SurfaceToolbarItem =
  | SurfaceToolbarIconButtonItem
  | SurfaceToolbarPanelToggleItem
  | SurfaceToolbarSearchItem
  | SurfaceToolbarSelectItem
  | SurfaceToolbarAutocompleteItem
  | SurfaceToolbarOptionGroupItem
  | SurfaceToolbarFieldFilterItem
  | SurfaceToolbarColumnToggleItem
  | SurfaceToolbarPageSizeItem
  | SurfaceToolbarPeriodItem
  | SurfaceToolbarTextItem
  | SurfaceToolbarMenuItem
  | SurfaceToolbarActionGroupItem
  | SurfaceToolbarEditGroupItem
  | SurfaceToolbarCreateItem;

export type SurfaceToolbarItems = SurfaceToolbarItem[];
