"use client";

import { useState } from "react";
import { Toolbar, type ToolbarItem } from "../Toolbar";
import type { ToolbarActionGroupAction } from "../Toolbar.types";

const fieldOptions = [
  { value: "status", label: "状态" },
  { value: "scope", label: "范围" },
];

const valueOptions = {
  status: [
    { value: "", label: "全部" },
    { value: "active", label: "现用" },
    { value: "archived", label: "归档" },
  ],
  scope: [
    { value: "", label: "全部" },
    { value: "internal", label: "内部" },
    { value: "public", label: "公开" },
  ],
};

const modeOptions = [
  { value: "all", label: "全部" },
  { value: "active", label: "在职" },
  { value: "inactive", label: "离职" },
];

const pageSizeOptions = [
  { value: "50", label: "50条/页" },
  { value: "100", label: "100条/页" },
];

export interface PreviewToolbarProps {
  onToggleList?: () => void;
  listVisible?: boolean;
  onCreate?: () => void;
  totalLabel?: string;
  showMeta?: boolean;
  showPreviewAction?: boolean;
}

export default function PreviewToolbar({
  onToggleList,
  listVisible = true,
  onCreate,
  totalLabel = "共 343 人",
  showMeta = true,
  showPreviewAction = false,
}: PreviewToolbarProps) {
  const [keyword, setKeyword] = useState("");
  const [mode, setMode] = useState("all");
  const [field, setField] = useState("status");
  const [fieldValue, setFieldValue] = useState("");
  const [editMode, setEditMode] = useState(false);

  const viewActions: ToolbarActionGroupAction[] = [];
  if (onToggleList) {
    viewActions.push({
      key: "toggle-list",
      kind: listVisible ? "panel-open" : "panel-close",
      label: listVisible ? "隐藏" : "显示",
      variant: listVisible ? "primary" : "secondary",
      onClick: onToggleList,
    });
  }
  if (onCreate) {
    viewActions.push({ key: "create", kind: "add", label: "新建", variant: "primary", onClick: onCreate });
  }

  const editActions: ToolbarActionGroupAction[] = [];
  if (showPreviewAction) {
    editActions.push({ key: "preview", kind: "view", label: "预览", variant: "secondary" });
  }
  editActions.push({ key: "download", kind: "download", label: "导出", variant: "secondary" });

  const items: ToolbarItem[] = [];
  if (viewActions.length > 0) {
    items.push({ kind: "action-group", key: "view-actions", section: "view", actions: viewActions });
  }
  items.push({
    kind: "search",
    key: "search",
    section: "search",
    value: keyword,
    onChange: setKeyword,
    placeholder: "搜索",
  });
  items.push({
    kind: "option-group",
    key: "mode",
    section: "filter",
    value: mode,
    options: modeOptions,
    onChange: setMode,
    ariaLabel: "模式",
  });
  items.push({
    kind: "field-filter",
    key: "field-filter",
    section: "filter",
    fieldKey: field,
    onFieldKeyChange: setField,
    value: fieldValue,
    onValueChange: setFieldValue,
    fields: fieldOptions,
    valueOptions,
  });
  if (editActions.length > 0) {
    items.push({ kind: "action-group", key: "actions", section: "edit", actions: editActions });
  }
  items.push({
    kind: "edit-group",
    key: "edit",
    section: "edit",
    editMode,
    onStartEdit: () => setEditMode(true),
    onSave: async () => setEditMode(false),
    onCancel: () => setEditMode(false),
    onShowHistory: () => {},
  });
  if (showMeta) {
    items.push({ kind: "text", key: "meta", section: "meta", content: <span>{totalLabel}</span> });
    items.push({
      kind: "select",
      key: "page-size",
      section: "meta",
      value: "50",
      options: pageSizeOptions,
      onChange: () => {},
    });
  }

  return <Toolbar items={items} />;
}
