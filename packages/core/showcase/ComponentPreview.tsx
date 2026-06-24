"use client";

import { useState } from "react";
import {
  ActionButton,
  ActionGlyph,
  AmountCell,
  CalendarDateInput,
  CheckboxChip,
  CheckboxField,
  ChoiceGroup,
  ColumnToggle,
  CommandToolbar,
  ConfirmModal,
  EmptyStateCard,
  IconActionButton,
  NumberCell,
  PanelCard,
  RatingControl,
  SearchInput,
  SectionCard,
  StatusBadge,
  StatusToggle,
  SwitchField,
  TagRemoveButton,
  TextareaField,
  TextField,
  ToolbarOptionGroup,
} from "@workspace/core/ui";

export function ComponentPreview({ name }: { name: string }) {
  const [value, setValue] = useState<string | null>(null);
  const [boolValue, setBoolValue] = useState(false);
  const [text, setText] = useState("");
  const [rating, setRating] = useState(3);
  const [dateValue, setDateValue] = useState<string | null>("2026-06-24");
  const [visibleColumns, setVisibleColumns] = useState<string[]>(["name", "status", "amount"]);
  const [confirmOpen, setConfirmOpen] = useState(false);

  switch (name) {
    case "ActionButton":
      return (
        <div className="flex flex-wrap items-center gap-2">
          <ActionButton variant="primary">主操作</ActionButton>
          <ActionButton variant="secondary">次操作</ActionButton>
          <ActionButton variant="danger">危险</ActionButton>
          <ActionButton variant="secondary" disabled>禁用</ActionButton>
        </div>
      );
    case "IconActionButton":
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
    case "ActionGlyph":
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
    case "TagRemoveButton":
      return (
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700">
            标签示例 <TagRemoveButton label="删除标签" confirm={false} onClick={() => {}} />
          </span>
        </div>
      );
    case "ToolbarOptionGroup":
      return (
        <ToolbarOptionGroup
          ariaLabel="预览选项"
          value={value ?? "all"}
          options={[{ value: "all", label: "全部" }, { value: "active", label: "进行中" }, { value: "done", label: "已完成" }]}
          onChange={(v) => setValue(v)}
        />
      );
    case "StatusBadge":
      return (
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge label="已启用" variant="green" />
          <StatusBadge label="待审核" variant="yellow" />
          <StatusBadge label="已归档" variant="gray" />
        </div>
      );
    case "StatusToggle":
      return (
        <StatusToggle
          active="active"
          tabs={[{ key: "active", label: "现用", count: 12 }, { key: "all", label: "全部", count: 18 }]}
          onChange={() => {}}
        />
      );
    case "SwitchField":
      return <SwitchField checked={boolValue} onChange={setBoolValue} ariaLabel="启用开关" />;
    case "CheckboxField":
      return (
        <div className="flex flex-wrap items-center gap-3">
          <CheckboxField checked={boolValue} onChange={setBoolValue} ariaLabel="默认尺寸" />
          <CheckboxField checked={boolValue} onChange={setBoolValue} size="sm" ariaLabel="小尺寸" />
        </div>
      );
    case "CheckboxChip":
      return (
        <div className="flex flex-wrap items-center gap-2">
          <CheckboxChip checked={boolValue} onChange={setBoolValue}>选项 A</CheckboxChip>
          <CheckboxChip checked={!boolValue} onChange={() => setBoolValue((v) => !v)}>选项 B</CheckboxChip>
        </div>
      );
    case "ChoiceGroup":
      return (
        <ChoiceGroup
          value={value ?? "yes"}
          options={["是", "否"]}
          onChange={(v) => setValue(v)}
        />
      );
    case "ColumnToggle":
      return (
        <CommandToolbar
          filters={(
            <>
              <SearchInput
                value={text}
                onChange={setText}
                placeholder="搜索记录..."
                size="toolbar"
                className="w-40"
              />
              <ColumnToggle
                columns={[
                  { key: "name", label: "名称", required: true },
                  { key: "status", label: "状态", defaultVisible: true },
                  { key: "amount", label: "金额", defaultVisible: true },
                  { key: "owner", label: "负责人" },
                  { key: "updated", label: "更新时间" },
                ]}
                visible={visibleColumns}
                onChange={setVisibleColumns}
              />
              <ActionButton variant="secondary">重置</ActionButton>
            </>
          )}
        />
      );
    case "TextField":
      return <TextField value={text} onChange={setText} placeholder="请输入文本" className="max-w-xs" />;
    case "TextareaField":
      return <TextareaField value={text} onChange={setText} placeholder="请输入多行文本" className="max-w-xs" />;
    case "NumberCell":
      return <NumberCell value={1280} />;
    case "AmountCell":
      return <AmountCell value={12800.5} />;
    case "CalendarDateInput":
      return <CalendarDateInput value={dateValue} onChange={setDateValue} className="max-w-xs" />;
    case "PanelCard":
      return (
        <PanelCard title="示例卡片" className="max-w-xs">
          <p className="text-sm text-slate-600">这是一个 PanelCard 示例内容。</p>
        </PanelCard>
      );
    case "SectionCard":
      return (
        <SectionCard title="示例小节">
          <p className="text-sm text-slate-600">这是一个 SectionCard 示例内容。</p>
        </SectionCard>
      );
    case "EmptyStateCard":
      return <EmptyStateCard compact>暂无数据</EmptyStateCard>;
    case "RatingControl":
      return <RatingControl value={rating} onChange={setRating} max={5} label="重要度" />;
    case "CommandToolbar":
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
    case "ConfirmModal":
      return (
        <>
          <ActionButton variant="danger" onClick={() => setConfirmOpen(true)}>打开确认弹窗</ActionButton>
          <ConfirmModal
            open={confirmOpen}
            title="确认删除？"
            message="删除后无法恢复，是否继续？"
            confirmLabel="删除"
            cancelLabel="取消"
            confirmDanger
            onConfirm={() => setConfirmOpen(false)}
            onCancel={() => setConfirmOpen(false)}
          />
        </>
      );
    default:
      return <span className="text-xs text-slate-400">暂无实时预览</span>;
  }
}
