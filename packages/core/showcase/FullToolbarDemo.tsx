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

  const fullToolbarItems: ToolbarItem[] = useMemo(
    () => [
      {
        kind: "button",
        key: "full-primary",
        section: "action",
        label: "主要按钮",
        variant: "primary",
        onClick: noop,
      },
      {
        kind: "button",
        key: "full-secondary",
        section: "action",
        label: "次要按钮",
        variant: "secondary",
        onClick: noop,
      },
      {
        kind: "icon-button",
        key: "full-icon",
        section: "action",
        icon: "add",
        label: "新增",
        variant: "primary",
        onClick: noop,
      },
      {
        kind: "option-group",
        key: "full-option-group",
        section: "filter",
        value: "a",
        options: [
          { value: "a", label: "选项 A" },
          { value: "b", label: "选项 B" },
        ],
        onChange: noop,
        ariaLabel: "示例选项",
      },
      {
        kind: "select",
        key: "full-select",
        section: "filter",
        value: "all",
        options: [
          { value: "all", label: "全部" },
          { value: "one", label: "选项 1" },
        ],
        onChange: noop,
        placeholder: "请选择",
        triggerClassName: "!w-32",
      },
      {
        kind: "search",
        key: "full-search",
        section: "filter",
        value: "",
        onChange: noop,
        placeholder: "搜索...",
        ariaLabel: "示例搜索",
        className: "w-48",
      },
      {
        kind: "column-toggle",
        key: "full-columns",
        section: "meta",
        columns: demoColumns,
        visible: demoVisibleColumns,
        onChange: setDemoVisibleColumns,
      },
      {
        kind: "text",
        key: "full-meta",
        section: "meta",
        content: "共 0 项",
      },
      {
        kind: "custom",
        key: "full-custom-meta",
        section: "meta",
        content: <span className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-600">自定义插槽</span>,
      },
    ],
    [demoVisibleColumns],
  );

  return <Toolbar items={fullToolbarItems} className="mb-5" />;
}
