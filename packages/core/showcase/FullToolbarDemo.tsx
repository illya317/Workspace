"use client";

import { useMemo, useState } from "react";
import { Toolbar, type ColumnDef, type ToolbarItem } from "@workspace/core/ui";

const noop = () => undefined;

const demoColumns: ColumnDef[] = [
  { key: "name", label: "名称", required: true },
  { key: "status", label: "状态", defaultVisible: true },
  { key: "amount", label: "金额" },
];

export default function FullToolbarDemo() {
  const [demoVisibleColumns, setDemoVisibleColumns] = useState<string[]>(["name", "status"]);
  const [demoFieldKey, setDemoFieldKey] = useState<string>("education");
  const [demoFieldValue, setDemoFieldValue] = useState<string>("bachelor");
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("all");
  const [scope, setScope] = useState("all");
  const [editMode, setEditMode] = useState(false);

  const fullToolbarItems: ToolbarItem[] = useMemo(
    () => [
      {
        kind: "action-group",
        key: "full-demo-actions",
        section: "edit",
        actions: [
          { kind: "print", label: "打印" },
          { kind: "delete-bin", label: "删除", variant: "danger" },
          { kind: "download", label: "下载" },
          { kind: "refresh", label: "刷新" },
          { kind: "copy", label: "复制" },
        ],
      },
      { kind: "panel-toggle", key: "full-toggle-list", icon: "panel-open", label: "显示列表", onClick: noop },
      { kind: "create", key: "full-create", section: "view", onClick: noop },
      { kind: "search", key: "full-search", section: "search", value: keyword, onChange: setKeyword, placeholder: "搜索..." },
      { kind: "select", key: "full-status", section: "filter", value: status, options: [{ value: "all", label: "全部" }, { value: "active", label: "进行中" }, { value: "done", label: "已完成" }], onChange: setStatus, placeholder: "状态" },
      { kind: "option-group", key: "full-scope", section: "filter", value: scope, options: [{ value: "all", label: "全部" }, { value: "mine", label: "我的" }], onChange: setScope, ariaLabel: "范围" },
      {
        kind: "field-filter",
        key: "full-field-filter",
        section: "filter",
        fieldKey: demoFieldKey,
        onFieldKeyChange: setDemoFieldKey,
        value: demoFieldValue,
        onValueChange: setDemoFieldValue,
        fields: [{ value: "gender", label: "性别" }, { value: "education", label: "学历" }, { value: "position", label: "岗位" }, { value: "department", label: "直属部门" }],
        valueOptions: {
          gender: [{ value: "female", label: "女" }, { value: "male", label: "男" }],
          education: [{ value: "bachelor", label: "本科" }, { value: "master", label: "硕士" }],
          position: [{ value: "manager", label: "经理" }, { value: "engineer", label: "工程师" }],
          department: [{ value: "hr", label: "人事" }, { value: "finance", label: "财务" }],
        },
        placeholder: "字段",
      },
      { kind: "edit-group", key: "full-edit", section: "edit", editMode, onStartEdit: () => setEditMode(true), onSave: async () => { setEditMode(false); }, onCancel: () => setEditMode(false) },
      { kind: "column-toggle", key: "full-columns", section: "meta", columns: demoColumns, visible: demoVisibleColumns, onChange: setDemoVisibleColumns },
      { kind: "text", key: "full-meta", section: "meta", content: "共 0 项" },
    ],
    [demoVisibleColumns, demoFieldKey, demoFieldValue, keyword, status, scope, editMode],
  );

  return <Toolbar items={fullToolbarItems} />;
}
