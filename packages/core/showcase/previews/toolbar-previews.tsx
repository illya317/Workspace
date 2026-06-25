"use client";

import { useState, type FC } from "react";
import {
  ActionButton,
  ActionGlyph,
  FieldValueFilter,
  PageToolbar,
  RefreshActionButton,
  SplitWorkspaceToolbar,
  ToolbarOptionGroup,
} from "@workspace/core/ui";
import {
  ACTION_GLYPH_GROUPS,
  ACTION_GLYPH_ORDER,
  ACTION_GLYPH_TOOLBAR_GROUPS,
} from "@workspace/core/ui/ActionGlyphs";
import type { PageToolbarFeature } from "@workspace/core/ui";
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

const ALL_FEATURES: PageToolbarFeature[] = [
  "view", "search", "filter", "action", "edit", "meta", "columns", "pageSize",
];

function PageToolbarPreview() {
  const [features, setFeatures] = useState<PageToolbarFeature[]>(ALL_FEATURES);
  const [status, setStatus] = useState("all");
  const [editMode, setEditMode] = useState(false);
  const toggleFeature = (key: string) => {
    setFeatures((current) => {
      const next = new Set(current);
      if (next.has(key as never)) next.delete(key as never);
      else next.add(key as never);
      return [...next] as PageToolbarFeature[];
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <span className="text-xs font-semibold text-slate-500">参数开关：</span>
        {ALL_FEATURES.map((key) => (
          <label key={key} className="flex items-center gap-1 text-xs text-slate-700">
            <input
              type="checkbox"
              checked={features.includes(key)}
              onChange={() => toggleFeature(key)}
              className="h-3.5 w-3.5 rounded border-slate-300 text-emerald-600"
            />
            {key}
          </label>
        ))}
      </div>
      <PageToolbar
        features={features}
        onCreate={() => {}}
        onToggleList={() => {}}
        listVisible
        optionGroups={[{ value: status, options: [{ value: "all", label: "全部" }, { value: "active", label: "进行中" }, { value: "done", label: "已完成" }], onChange: setStatus, ariaLabel: "状态" }]}
        actions={[{ label: "导出", icon: "download" }, { label: "批量删除", icon: "delete-bin", variant: "danger" }]}
        editProps={{ editMode, onStartEdit: () => setEditMode(true), onSave: async () => setEditMode(false), onCancel: () => setEditMode(false), onShowHistory: () => {} }}
        meta={<>共 86 条</>}
      />
    </div>
  );
}

function getToolbarActionClassNamePreview() {
  return <div className="text-xs text-slate-400"><p className="font-medium">getToolbarActionClassName</p><p>工具栏动作按钮样式 token，用于少量需要自定义按钮挂载点的场景。</p><p className="mt-1 text-slate-300">Foundation / 样式 recipe，无运行时组件预览。</p></div>;
}

function SplitWorkspaceToolbarPreview() {
  const [sideOpen, setSideOpen] = useState(true);
  return (
    <div className="max-w-md">
      <SplitWorkspaceToolbar sideOpen={sideOpen} sideLabel="列表" onSideOpenChange={setSideOpen} onDrawerOpen={() => {}}>
        <ActionButton kind="save" label="保存" size="sm" variant="primary" />
      </SplitWorkspaceToolbar>
    </div>
  );
}

export const toolbarPreviewByName: Record<string, FC> = {
  ActionButton: ActionButtonPreview,
  ActionGlyph: ActionGlyphPreview,
  RefreshActionButton: RefreshActionButtonPreview,
  Toolbar: ToolbarPreview,
  PageToolbar: PageToolbarPreview,
  FieldValueFilter: FieldValueFilterPreview,
  ToolbarOptionGroup: ToolbarOptionGroupPreview,
  getToolbarActionClassName: getToolbarActionClassNamePreview,
  SplitWorkspaceToolbar: SplitWorkspaceToolbarPreview,
};
