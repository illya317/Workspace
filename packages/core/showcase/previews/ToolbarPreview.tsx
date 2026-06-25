"use client";

import { useState } from "react";
import { Toolbar } from "@workspace/core/ui";
import { SECTION_ORDER } from "@workspace/core/ui/Toolbar";
import type { ColumnDef, ToolbarItem } from "@workspace/core/ui";

function usePreviewStates() {
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("all");
  const [fieldKey, setFieldKey] = useState("type");
  const [fieldValue, setFieldValue] = useState("project");
  const [visibleColumns, setVisibleColumns] = useState<string[]>(["name", "status", "amount"]);
  const [editMode, setEditMode] = useState(false);
  const [selected, setSelected] = useState(0);
  return {
    keyword, setKeyword,
    status, setStatus,
    fieldKey, setFieldKey,
    fieldValue, setFieldValue,
    visibleColumns, setVisibleColumns,
    editMode, setEditMode,
    selected, setSelected,
  };
}

export default function ToolbarPreview() {
  const s = usePreviewStates();
  const statusOptions = [
    { value: "all", label: "全部" },
    { value: "active", label: "进行中" },
    { value: "done", label: "已完成" },
  ];
  const columns: ColumnDef[] = [
    { key: "name", label: "名称", required: true },
    { key: "status", label: "状态", defaultVisible: true },
    { key: "amount", label: "金额", defaultVisible: true },
    { key: "owner", label: "负责人" },
  ];

  const items: ToolbarItem[] = [
    { kind: "icon-button", key: "panel", section: "view", icon: "panel-open", label: "显示列表", onClick: () => {} },
    { kind: "create", key: "create", section: "view", onClick: () => {} },
    { kind: "search", key: "search", section: "search", value: s.keyword, onChange: s.setKeyword, placeholder: "搜索..." },
    { kind: "select", key: "select", section: "filter", value: s.status, options: statusOptions, onChange: s.setStatus, placeholder: "状态" },
    { kind: "option-group", key: "status", section: "filter", value: s.status, options: statusOptions, onChange: s.setStatus, ariaLabel: "状态" },
    {
      kind: "field-filter",
      key: "field-filter",
      section: "filter",
      fieldKey: s.fieldKey,
      onFieldKeyChange: s.setFieldKey,
      value: s.fieldValue,
      onValueChange: s.setFieldValue,
      fields: [
        { value: "status", label: "状态" },
        { value: "type", label: "类型" },
        { value: "keyword", label: "关键词", valueKind: "text" },
      ],
      valueOptions: {
        status: statusOptions,
        type: [{ value: "contract", label: "合同" }, { value: "project", label: "项目" }],
        keyword: [],
      },
      placeholder: "字段",
    },
    { kind: "column-toggle", key: "columns", columns, visible: s.visibleColumns, onChange: s.setVisibleColumns },
    {
      kind: "action-group",
      key: "actions",
      section: "edit",
      actions: [
        { kind: "print", label: "打印" },
        { kind: "delete-bin", label: "删除", variant: "danger" },
        { kind: "download", label: "下载" },
        { kind: "refresh", label: "刷新" },
        { kind: "copy", label: "复制" },
      ],
    },
    { kind: "edit-group", key: "edit", section: "edit", editMode: s.editMode, onStartEdit: () => s.setEditMode(true), onSave: async () => { s.setEditMode(false); }, onCancel: () => s.setEditMode(false) },
    { kind: "text", key: "meta", section: "meta", content: <>已选择 {s.selected} 条 / 共 24 条</> },
  ];

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-400">
        Toolbar section 顺序由 <code>SECTION_ORDER</code> 决定：{SECTION_ORDER.join(" / ")}
      </p>
      <Toolbar items={items} />
      <p className="text-xs text-slate-400">
        当前 item 类型（按 section 聚合）：{items.map((item) => item.kind).join(" / ")}
      </p>
    </div>
  );
}
