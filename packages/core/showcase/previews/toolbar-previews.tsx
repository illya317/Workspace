"use client";

import { useState, type FC } from "react";
import { ActionGlyph } from "@workspace/core/ui";
import {
  ActionButton,
  CommandButton,
  FieldValueFilter,
  RefreshActionButton,
  ToolbarOptionGroup,
} from "../internal-ui";
import {
  ACTION_GLYPH_GROUPS,
  ACTION_GLYPH_ORDER,
  ACTION_GLYPH_TOOLBAR_GROUPS,
} from "@workspace/core/ui/ActionGlyphs";
import ToolbarPreview from "./ToolbarPreview";

function ActionButtonPreview() {
  const items: Array<{ label: string; variant: "primary" | "secondary" | "danger"; kind: Parameters<typeof ActionGlyph>[0]["kind"]; disabled?: boolean; size?: "sm" | "md" }> = [
    { label: "新增", variant: "primary", kind: "add" },
    { label: "编辑", variant: "secondary", kind: "edit" },
    { label: "删除", variant: "danger", kind: "delete-bin" },
    { label: "禁用", variant: "secondary", kind: "download", disabled: true },
    { label: "确认", variant: "primary", kind: "check", size: "sm" },
    { label: "取消", variant: "secondary", kind: "cancel", size: "sm" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-2">
      {items.map((item) => <ActionButton key={item.label} kind={item.kind} label={item.label} variant={item.variant} size={item.size} disabled={item.disabled} />)}
    </div>
  );
}

function ActionGlyphPreview() {
  const groupByKey = new Map(ACTION_GLYPH_GROUPS.map((group) => [group.key, group]));
  const orderedIconsBySubgroup = new Map(
    ACTION_GLYPH_GROUPS.map((group) => [
      group.key,
      ACTION_GLYPH_ORDER
        .filter((item) => item.subgroup === group.key)
        .sort((a, b) => a.order - b.order)
        .map((item) => item.icon),
    ]),
  );
  return (
    <div className="space-y-3">
      {ACTION_GLYPH_TOOLBAR_GROUPS.map((toolbarGroup) => (
        <div key={toolbarGroup.key} className="rounded-md border border-slate-200 bg-white p-3 text-slate-700">
          <div className="mb-3 text-sm font-semibold text-slate-700">{toolbarGroup.label}</div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {toolbarGroup.groupKeys.map((groupKey) => {
              const group = groupByKey.get(groupKey);
              if (!group) return null;
              return (
                <div key={group.key} className="rounded-md bg-slate-50 px-3 py-2">
                  <div className="mb-2 min-h-6 text-xs font-semibold text-slate-500">{group.label}</div>
                  <div className="flex flex-wrap items-center gap-2">
                    {(orderedIconsBySubgroup.get(group.key) ?? group.kinds).map((kind) => (
                      <span key={kind} className="flex h-8 w-8 items-center justify-center rounded-md bg-white text-slate-700">
                        <ActionGlyph kind={kind} className="h-4 w-4" />
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function RefreshActionButtonPreview() {
  return <RefreshActionButton onClick={() => {}} />;
}

function CommandButtonPreview() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <CommandButton variant="primary" size="md">主按钮</CommandButton>
      <CommandButton variant="secondary" size="md">次按钮</CommandButton>
      <CommandButton variant="danger" size="md">危险按钮</CommandButton>
      <CommandButton variant="secondary" size="sm">小按钮</CommandButton>
      <CommandButton variant="primary" size="sm" disabled>禁用</CommandButton>
    </div>
  );
}

function FieldValueFilterPreview() {
  const [fieldKey, setFieldKey] = useState("status");
  const [value, setValue] = useState("active");
  return (
    <FieldValueFilter
      fields={[
        { value: "status", label: "状态" },
        { value: "type", label: "类型" },
        { value: "keyword", label: "关键词", valueKind: "text" },
      ]}
      valueOptions={{
        status: [{ value: "active", label: "进行中" }, { value: "done", label: "已完成" }, { value: "archived", label: "已归档" }],
        type: [{ value: "contract", label: "合同" }, { value: "project", label: "项目" }],
        keyword: [],
      }}
      fieldKey={fieldKey}
      onFieldKeyChange={setFieldKey}
      value={value}
      onValueChange={setValue}
    />
  );
}

function ToolbarOptionGroupPreview() {
  const [value, setValue] = useState<string | null>(null);
  return <ToolbarOptionGroup ariaLabel="预览选项" value={value ?? "all"} options={[{ value: "all", label: "全部" }, { value: "active", label: "进行中" }, { value: "done", label: "已完成" }]} onChange={(v) => setValue(v)} />;
}

function getToolbarActionClassNamePreview() {
  return <div className="text-xs text-slate-400"><p className="font-medium">getToolbarActionClassName</p><p>工具栏动作按钮样式 token，用于少量需要自定义按钮挂载点的场景。</p><p className="mt-1 text-slate-300">Foundation / 样式 recipe，无运行时组件预览。</p></div>;
}

export const toolbarPreviewByName: Record<string, FC> = {
  ActionButton: ActionButtonPreview,
  ActionGlyph: ActionGlyphPreview,
  CommandButton: CommandButtonPreview,
  RefreshActionButton: RefreshActionButtonPreview,
  Toolbar: ToolbarPreview,
  FieldValueFilter: FieldValueFilterPreview,
  ToolbarOptionGroup: ToolbarOptionGroupPreview,
  getToolbarActionClassName: getToolbarActionClassNamePreview,
};
