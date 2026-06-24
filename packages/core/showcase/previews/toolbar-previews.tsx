"use client";

import { useState, type FC } from "react";
import {
  ,
  ActionButton,
  ActionGlyph,
  CommandToolbar,
  IconActionButton,
  ToolbarOptionGroup,
} from "@workspace/core/ui";

function ActionButtonPreview() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <ActionButton variant="primary">主操作</ActionButton>
      <ActionButton variant="secondary">次操作</ActionButton>
      <ActionButton variant="danger">危险</ActionButton>
      <ActionButton variant="secondary" disabled>禁用</ActionButton>
    </div>
  );
}

function ActionGlyphPreview() {
  return (
    <div className="flex flex-wrap items-center gap-3 text-slate-700">
      <span className="flex items-center gap-1">add <ActionGlyph kind="add" className="h-4 w-4" /></span>
      <span className="flex items-center gap-1">edit <ActionGlyph kind="edit" className="h-4 w-4" /></span>
      <span className="flex items-center gap-1">check <ActionGlyph kind="check" className="h-4 w-4" /></span>
      <span className="flex items-center gap-1">cancel <ActionGlyph kind="cancel" className="h-4 w-4" /></span>
      <span className="flex items-center gap-1">copy <ActionGlyph kind="copy" className="h-4 w-4" /></span>
      <span className="flex items-center gap-1">save <ActionGlyph kind="save" className="h-4 w-4" /></span>
      <span className="flex items-center gap-1">delete <ActionGlyph kind="delete" /></span>
      <span className="flex items-center gap-1">delete-bin <ActionGlyph kind="delete-bin" className="h-4 w-4" /></span>
      <span className="flex items-center gap-1">delete-minus <ActionGlyph kind="delete-minus" className="h-4 w-4" /></span>
      <span className="flex items-center gap-1">view <ActionGlyph kind="view" className="h-4 w-4" /></span>
      <span className="flex items-center gap-1">eye <ActionGlyph kind="eye" className="h-4 w-4" /></span>
      <span className="flex items-center gap-1">eye-off <ActionGlyph kind="eye-off" className="h-4 w-4" /></span>
      <span className="flex items-center gap-1">search <ActionGlyph kind="search" className="h-4 w-4" /></span>
      <span className="flex items-center gap-1">filter <ActionGlyph kind="filter" className="h-4 w-4" /></span>
      <span className="flex items-center gap-1">refresh <ActionGlyph kind="refresh" className="h-4 w-4" /></span>
      <span className="flex items-center gap-1">more <ActionGlyph kind="more" className="h-4 w-4" /></span>
      <span className="flex items-center gap-1">download <ActionGlyph kind="download" className="h-4 w-4" /></span>
      <span className="flex items-center gap-1">upload <ActionGlyph kind="upload" className="h-4 w-4" /></span>
      <span className="flex items-center gap-1">archive <ActionGlyph kind="archive" className="h-4 w-4" /></span>
    </div>
  );
}

function ActionToolbarPreview() {
    return <div className="text-xs text-slate-400"><p className="font-medium">ActionToolbar</p><p>通用页面动作栏，承接主按钮、次按钮和左右插槽。</p><p className="mt-1 text-slate-300">实时预览待补充。</p></div>;
}

function IconActionButtonPreview() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <IconActionButton label="新增" variant="primary"><ActionGlyph kind="add" /></IconActionButton>
      <IconActionButton label="编辑" variant="secondary"><ActionGlyph kind="edit" className="h-4 w-4" /></IconActionButton>
      <IconActionButton label="删除" variant="danger"><ActionGlyph kind="delete-bin" className="h-4 w-4" /></IconActionButton>
      <IconActionButton label="刷新" variant="secondary"><ActionGlyph kind="refresh" className="h-4 w-4" /></IconActionButton>
      <IconActionButton label="搜索" variant="secondary"><ActionGlyph kind="search" className="h-4 w-4" /></IconActionButton>
      <IconActionButton label="筛选" variant="secondary"><ActionGlyph kind="filter" className="h-4 w-4" /></IconActionButton>
    </div>
  );
}

function RefreshActionButtonPreview() {
    return <div className="text-xs text-slate-400"><p className="font-medium">RefreshActionButton</p><p>工具栏刷新动作按钮，使用无边框图标样式和统一可访问名称。</p><p className="mt-1 text-slate-300">实时预览待补充。</p></div>;
}

function CommandToolbarPreview() {
  const [value, setValue] = useState<string | null>(null);
  return (
    <CommandToolbar
      filters={(
        <ToolbarOptionGroup
          ariaLabel="预览筛选"
          value={value ?? "all"}
          options={[{ value: "all", label: "全部" }, { value: "active", label: "进行中" }]}
          onChange={(v) => setValue(v)}
        />
      )}
      editActions={(
        <ActionButton variant="primary">新建</ActionButton>
      )}
      meta={<>共 24 条</>}
    />
  );
}

function EditToolbarPreview() {
    return <div className="text-xs text-slate-400"><p className="font-medium">EditToolbar</p><p>编辑场景工具栏，统一保存、取消和辅助动作排列。</p><p className="mt-1 text-slate-300">实时预览待补充。</p></div>;
}

function FieldValueFilterPreview() {
    return <div className="text-xs text-slate-400"><p className="font-medium">FieldValueFilter</p><p>字段和值组合筛选，工具栏只显示“字段：值”，点击后再选择字段和值；字段可声明 FK，并由业务域传入 reference-options endpoint。</p><p className="mt-1 text-slate-300">实时预览待补充。</p></div>;
}

function FilterBarPreview() {
    return <div className="text-xs text-slate-400"><p className="font-medium">FilterBar</p><p>筛选栏容器，用于承载多个筛选字段和操作区。</p><p className="mt-1 text-slate-300">实时预览待补充。</p></div>;
}

function FilterToolbarPreview() {
    return <div className="text-xs text-slate-400"><p className="font-medium">FilterToolbar</p><p>列表筛选工具栏，统一搜索、下拉筛选和操作按钮。</p><p className="mt-1 text-slate-300">实时预览待补充。</p></div>;
}

function ToolbarOptionGroupPreview() {
  const [value, setValue] = useState<string | null>(null);
  return (
    <ToolbarOptionGroup
      ariaLabel="预览选项"
      value={value ?? "all"}
      options={[{ value: "all", label: "全部" }, { value: "active", label: "进行中" }, { value: "done", label: "已完成" }]}
      onChange={(v) => setValue(v)}
    />
  );
}

function getToolbarActionClassNamePreview() {
    return <div className="text-xs text-slate-400"><p className="font-medium">getToolbarActionClassName</p><p>工具栏动作按钮样式 token，用于少量需要自定义按钮挂载点的场景。</p><p className="mt-1 text-slate-300">Foundation / 样式 recipe，无运行时组件预览。</p></div>;
}

function SplitWorkspaceToolbarPreview() {
    return <div className="text-xs text-slate-400"><p className="font-medium">SplitWorkspaceToolbar</p><p>分栏工作区工具条，承接折叠、模式和辅助操作。</p><p className="mt-1 text-slate-300">实时预览待补充。</p></div>;
}

function ToolbarPreview() {
    return <div className="text-xs text-slate-400"><p className="font-medium">Toolbar</p><p>CommandToolbar 的兼容别名导出，保留旧消费路径，新增代码优先使用 CommandToolbar。</p><p className="mt-1 text-slate-300">实时预览待补充。</p></div>;
}

function ToolbarSelectFilterPreview() {
    return <div className="text-xs text-slate-400"><p className="font-medium">ToolbarSelectFilter</p><p>工具栏专用下拉筛选，统一“标签 + 当前值 + 下拉菜单”的紧凑列表筛选样式。</p><p className="mt-1 text-slate-300">实时预览待补充。</p></div>;
}

function ToolbarShowcasePreview() {
    return <div className="text-xs text-slate-400"><p className="font-medium">ToolbarShowcase</p><p>页面样式预览的兼容导出入口，真实实现已收敛到 PageStyleShowcase。</p><p className="mt-1 text-slate-300">实时预览待补充。</p></div>;
}

export const toolbarPreviewByName: Record<string, FC> = {
  ActionButton: ActionButtonPreview,
  ActionGlyph: ActionGlyphPreview,
  ActionToolbar: ActionToolbarPreview,
  IconActionButton: IconActionButtonPreview,
  RefreshActionButton: RefreshActionButtonPreview,
  CommandToolbar: CommandToolbarPreview,
  EditToolbar: EditToolbarPreview,
  FieldValueFilter: FieldValueFilterPreview,
  FilterBar: FilterBarPreview,
  FilterToolbar: FilterToolbarPreview,
  ToolbarOptionGroup: ToolbarOptionGroupPreview,
  getToolbarActionClassName: getToolbarActionClassNamePreview,
  SplitWorkspaceToolbar: SplitWorkspaceToolbarPreview,
  Toolbar: ToolbarPreview,
  ToolbarSelectFilter: ToolbarSelectFilterPreview,
  ToolbarShowcase: ToolbarShowcasePreview,
};
