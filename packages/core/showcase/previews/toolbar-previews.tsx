"use client";

import { useState, type FC } from "react";
import {
  ActionButton,
  ActionGlyph,
  ActionToolbar,
  CommandToolbar,
  EditToolbar,
  FieldValueFilter,
  FilterBar,
  FilterToolbar,
  IconActionButton,
  RefreshActionButton,
  SearchInput,
  SplitWorkspaceToolbar,
  ToolbarOptionGroup,
} from "@workspace/core/ui";

function ActionButtonPreview() {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <ActionButton variant="primary">主操作</ActionButton>
        <ActionButton variant="secondary">次操作</ActionButton>
        <ActionButton variant="danger">危险</ActionButton>
        <ActionButton variant="secondary" disabled>禁用</ActionButton>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <ActionButton size="sm" variant="primary">主操作</ActionButton>
        <ActionButton size="sm" variant="secondary">次操作</ActionButton>
        <ActionButton size="sm" variant="danger">危险</ActionButton>
        <ActionButton size="sm" variant="secondary" disabled>禁用</ActionButton>
      </div>
    </div>
  );
}

function ActionGlyphPreview() {
  const kinds: Array<Parameters<typeof ActionGlyph>[0]["kind"]> = ["add", "edit", "check", "cancel", "copy", "save", "delete", "delete-bin", "delete-minus", "view", "eye", "eye-off", "search", "filter", "refresh", "more", "download", "upload", "archive"];
  return (
    <div className="flex flex-wrap items-center gap-3 text-slate-700">
      {kinds.map((kind) => <span key={kind} className="flex items-center gap-1">{kind} <ActionGlyph kind={kind} className="h-4 w-4" /></span>)}
    </div>
  );
}

function ActionToolbarPreview() {
  return (
    <div className="max-w-2xl">
      <ActionToolbar
        leftSlot={<span className="text-sm font-semibold">已选择 2 条记录</span>}
        primaryActions={[{ label: "导出", kind: "download", size: "sm", onClick: () => {} }]}
        secondaryActions={[{ label: "取消选择", kind: "cancel", size: "sm", onClick: () => {} }]}
        rightSlot={<IconActionButton kind="add" label="新增" variant="primary" size="sm" />}
      />
    </div>
  );
}

function IconActionButtonPreview() {
  const items: Array<{ label: string; variant: "primary" | "secondary" | "danger"; kind: Parameters<typeof ActionGlyph>[0]["kind"] }> = [
    { label: "新增", variant: "primary", kind: "add" },
    { label: "编辑", variant: "secondary", kind: "edit" },
    { label: "删除", variant: "danger", kind: "delete-bin" },
    { label: "刷新", variant: "secondary", kind: "refresh" },
    { label: "搜索", variant: "secondary", kind: "search" },
    { label: "筛选", variant: "secondary", kind: "filter" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-2">
      {items.map((item) => <IconActionButton key={item.label} kind={item.kind} label={item.label} variant={item.variant} />)}
    </div>
  );
}

function RefreshActionButtonPreview() {
  return <RefreshActionButton onClick={() => {}} />;
}

function CommandToolbarPreview() {
  const [value, setValue] = useState<string | null>(null);
  return <CommandToolbar filters={<ToolbarOptionGroup ariaLabel="预览筛选" value={value ?? "all"} options={[{ value: "all", label: "全部" }, { value: "active", label: "进行中" }]} onChange={(v) => setValue(v)} />} editActions={<ActionButton variant="primary">新建</ActionButton>} meta={<>共 24 条</>} />;
}

function EditToolbarPreview() {
  const [editMode, setEditMode] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <EditToolbar editMode={editMode} onStartEdit={() => setEditMode(true)} onSave={async () => { setEditMode(false); }} onCancel={() => setEditMode(false)} onDownload={() => {}} onShowHistory={() => {}} />
      <div className="text-xs text-slate-400">当前模式：{editMode ? "编辑中" : "只读"}</div>
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

function FilterBarPreview() {
  const [keyword, setKeyword] = useState("");
  return (
    <FilterBar>
      <SearchInput value={keyword} onChange={setKeyword} placeholder="搜索..." className="min-w-0" />
      <ActionButton size="sm" variant="primary">查询</ActionButton>
      <ActionButton size="sm" variant="secondary">重置</ActionButton>
    </FilterBar>
  );
}

function FilterToolbarPreview() {
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("all");
  const [pageSize, setPageSize] = useState(50);
  const [visibleColumns, setVisibleColumns] = useState(["name", "status", "amount"]);
  return (
    <FilterToolbar
      keyword={keyword}
      onKeywordChange={setKeyword}
      optionGroups={[{ value: status, options: [{ value: "all", label: "全部" }, { value: "active", label: "进行中" }, { value: "done", label: "已完成" }], onChange: setStatus, ariaLabel: "状态筛选" }]}
      pageSize={pageSize}
      onPageSizeChange={setPageSize}
      meta={<>共 86 条</>}
      onReset={() => { setKeyword(""); setStatus("all"); }}
      primaryAction={{ label: "新建", onClick: () => {} }}
      columns={[{ key: "name", label: "名称", required: true }, { key: "status", label: "状态", defaultVisible: true }, { key: "amount", label: "金额", defaultVisible: true }, { key: "owner", label: "负责人" }]}
      visibleColumns={visibleColumns}
      onColumnsChange={setVisibleColumns}
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

function SplitWorkspaceToolbarPreview() {
  const [sideOpen, setSideOpen] = useState(true);
  return (
    <div className="max-w-md">
      <SplitWorkspaceToolbar sideOpen={sideOpen} sideLabel="列表" onSideOpenChange={setSideOpen} onDrawerOpen={() => {}}>
        <ActionButton size="sm" variant="primary">保存</ActionButton>
      </SplitWorkspaceToolbar>
    </div>
  );
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
};
