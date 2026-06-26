"use client";

import type { ReactNode } from "react";
import {
  type ColumnDef,
  type FieldValueFilterField,
  type SelectFieldOption,
  type ToolbarActionGroupAction,
  type ToolbarItem,
} from "@workspace/core/ui";
import type { FilterConfig } from "@workspace/hr/types";
import { buildInlineFilterItems } from "./generic-filter-toolbar-items";

export interface HRToolbarItemsCreateAction {
  label?: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

export interface HRToolbarItemsSearch {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
}

export interface HRToolbarItemsFilters {
  configs: FilterConfig[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
}

export interface HRToolbarItemsAdvancedFilter {
  fields: FieldValueFilterField[];
  valueOptions?: Record<string, SelectFieldOption[]>;
  fieldKey: string;
  value: string;
  onFieldKeyChange: (key: string) => void;
  onValueChange: (value: string, fieldKey?: string) => void;
  placeholder?: string;
  referenceEndpoint?: string;
}

export interface HRToolbarItemsColumnToggle {
  columns: ColumnDef[];
  visible: string[];
  onChange: (visible: string[]) => void;
}

export interface HRToolbarItemsAction {
  label?: string;
  disabled?: boolean;
  onClick: () => void;
}

export interface HRToolbarItemsEditGroup {
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

export interface HRToolbarItemsPageSize {
  value: string;
  options: SelectFieldOption[];
  onChange: (value: string) => void;
  label?: string;
}

export interface HRToolbarItemsOptions {
  create?: HRToolbarItemsCreateAction;
  search?: HRToolbarItemsSearch;
  filters?: HRToolbarItemsFilters;
  advancedFilter?: HRToolbarItemsAdvancedFilter;
  columnToggle?: HRToolbarItemsColumnToggle;
  refresh?: HRToolbarItemsAction;
  reset?: HRToolbarItemsAction;
  editGroup?: HRToolbarItemsEditGroup;
  pageSize?: HRToolbarItemsPageSize;
  meta?: ReactNode;
}

export function buildHRToolbarItems({
  create,
  search,
  filters,
  advancedFilter,
  columnToggle,
  refresh,
  reset,
  editGroup,
  pageSize,
  meta,
}: HRToolbarItemsOptions): ToolbarItem[] {
  const items: ToolbarItem[] = [];

  if (create) {
    items.push({
      kind: "create",
      key: "create",
      label: create.label,
      active: create.active,
      disabled: create.disabled,
      onClick: create.onClick,
    });
  }

  if (search) {
    items.push({
      kind: "search",
      key: "search",
      section: "filter",
      value: search.value,
      onChange: search.onChange,
      placeholder: search.placeholder,
      ariaLabel: search.ariaLabel,
    });
  }

  if (filters?.configs.length) {
    items.push(...buildInlineFilterItems(filters.configs, filters.values, filters.onChange));
  }

  if (advancedFilter?.fields.length) {
    items.push({
      kind: "field-filter",
      key: "advanced-filter",
      section: "filter",
      fields: advancedFilter.fields,
      valueOptions: advancedFilter.valueOptions ?? {},
      referenceEndpoint: advancedFilter.referenceEndpoint,
      fieldKey: advancedFilter.fieldKey,
      onFieldKeyChange: advancedFilter.onFieldKeyChange,
      value: advancedFilter.value,
      onValueChange: advancedFilter.onValueChange,
      placeholder: advancedFilter.placeholder ?? "高级筛选",
    });
  }

  if (columnToggle) {
    items.push({
      kind: "column-toggle",
      key: "columns",
      columns: columnToggle.columns,
      visible: columnToggle.visible,
      onChange: columnToggle.onChange,
    });
  }

  const actionGroupActions: ToolbarActionGroupAction[] = [];

  if (refresh) {
    actionGroupActions.push({
      key: "refresh",
      kind: "refresh",
      label: refresh.label ?? "刷新",
      disabled: refresh.disabled,
      onClick: refresh.onClick,
    });
  }

  if (reset) {
    actionGroupActions.push({
      key: "reset",
      kind: "reset",
      label: reset.label ?? "重置",
      disabled: reset.disabled,
      onClick: reset.onClick,
    });
  }

  if (actionGroupActions.length > 0) {
    items.push({
      kind: "action-group",
      key: "actions",
      actions: actionGroupActions,
    });
  }

  if (editGroup) {
    items.push({
      kind: "edit-group",
      key: "edit",
      section: "edit",
      editMode: editGroup.editMode,
      canEdit: editGroup.canEdit,
      editLabel: editGroup.editLabel,
      saveLabel: editGroup.saveLabel,
      saving: editGroup.saving,
      downloading: editGroup.downloading,
      onStartEdit: editGroup.onStartEdit,
      onSave: editGroup.onSave,
      onCancel: editGroup.onCancel,
      onDownload: editGroup.onDownload,
      onShowHistory: editGroup.onShowHistory,
    });
  }

  if (meta !== undefined && meta !== null) {
    items.push({
      kind: "text",
      key: "meta",
      section: "meta",
      content: meta,
    });
  }

  if (pageSize) {
    items.push({
      kind: "page-size",
      key: "page-size",
      value: pageSize.value,
      options: pageSize.options,
      onChange: pageSize.onChange,
      label: pageSize.label,
    });
  }

  return items;
}
