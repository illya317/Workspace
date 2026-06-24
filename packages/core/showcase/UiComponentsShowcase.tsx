"use client";

import { useState } from "react";
import {
  ActionButton,
  ActionGlyph,
  AmountCell,
  CheckboxChip,
  CheckboxField,
  ChoiceGroup,
  CommandToolbar,
  coreUiComponentRegistry,
  coreUiComponentTierMeta,
  EmptyStateCard,
  IconActionButton,
  NumberCell,
  PageContent,
  PanelCard,
  RatingControl,
  SectionCard,
  StatusBadge,
  StatusToggle,
  SwitchField,
  TagRemoveButton,
  TextareaField,
  TextField,
  ToolbarOptionGroup,
} from "@workspace/core/ui";
import type { CoreUiComponentTier } from "@workspace/core/ui";

const TIERS: CoreUiComponentTier[] = ["primitive", "assembly", "frame"];

function ComponentPreview({ name }: { name: string }) {
  const [value, setValue] = useState<string | null>(null);
  const [boolValue, setBoolValue] = useState(false);
  const [text, setText] = useState("");
  const [rating, setRating] = useState(3);

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
          <IconActionButton label="新增" variant="primary">+</IconActionButton>
          <IconActionButton label="编辑" variant="secondary"><ActionGlyph kind="edit" className="h-4 w-4" /></IconActionButton>
          <IconActionButton label="删除" variant="danger"><ActionGlyph kind="delete" /></IconActionButton>
        </div>
      );
    case "ActionGlyph":
      return (
        <div className="flex flex-wrap items-center gap-3 text-slate-700">
          <span className="flex items-center gap-1">x <ActionGlyph kind="x" className="h-4 w-4" /></span>
          <span className="flex items-center gap-1">delete <ActionGlyph kind="delete" /></span>
          <span className="flex items-center gap-1">check <ActionGlyph kind="check" className="h-4 w-4" /></span>
          <span className="flex items-center gap-1">add <ActionGlyph kind="add" className="h-4 w-4" /></span>
          <span className="flex items-center gap-1">edit <ActionGlyph kind="edit" className="h-4 w-4" /></span>
          <span className="flex items-center gap-1">view <ActionGlyph kind="view" className="h-4 w-4" /></span>
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
      return <CheckboxField checked={boolValue} onChange={setBoolValue} ariaLabel="复选框" />;
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
    case "TextField":
      return <TextField value={text} onChange={setText} placeholder="请输入文本" className="max-w-xs" />;
    case "TextareaField":
      return <TextareaField value={text} onChange={setText} placeholder="请输入多行文本" className="max-w-xs" />;
    case "NumberCell":
      return <NumberCell value={1280} />;
    case "AmountCell":
      return <AmountCell value={12800.5} />;
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
    default:
      return <span className="text-xs text-slate-400">暂无实时预览</span>;
  }
}

export default function UiComponentsShowcase() {
  const [tier, setTier] = useState<CoreUiComponentTier>("primitive");
  const tierMeta = coreUiComponentTierMeta[tier];
  const items = coreUiComponentRegistry.filter((component) => component.tier === tier);

  return (
    <PageContent className="max-w-5xl py-10">
      <div className="mb-6">
        <h1 className="text-lg font-bold text-slate-900">UI 组件库</h1>
        <p className="text-sm text-slate-500">按核心分层查看并预览已注册的共享组件</p>
      </div>

      <PanelCard title="组件层级" bodyClassName="p-4">
        <ToolbarOptionGroup
          ariaLabel="组件层级"
          value={tier}
          options={TIERS.map((value) => ({
            value,
            label: coreUiComponentTierMeta[value].label,
          }))}
          onChange={(value) => setTier(value as CoreUiComponentTier)}
        />
        <p className="mt-3 text-sm text-slate-600">{tierMeta.description}</p>
      </PanelCard>

      <div className="mt-6 grid gap-4">
        {items.map((component) => (
          <PanelCard
            key={component.name}
            title={(
              <span className="flex items-center gap-2">
                <code className="rounded bg-slate-100 px-1.5 py-0.5 text-sm font-semibold text-slate-900">
                  {component.name}
                </code>
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                  {component.kind}
                </span>
              </span>
            )}
            bodyClassName="p-4"
          >
            <p className="text-sm text-slate-700">{component.description}</p>
            {component.example && (
              <div className="mt-3 rounded-md border border-slate-100 bg-slate-50 px-3 py-2">
                <p className="text-xs font-medium text-slate-500">示例</p>
                <p className="mt-1 text-sm text-slate-600">{component.example}</p>
              </div>
            )}
            <div className="mt-4 rounded-md border border-dashed border-slate-200 bg-white p-4">
              <p className="mb-3 text-xs font-medium text-slate-400">实时预览</p>
              <ComponentPreview name={component.name} />
            </div>
            {"includes" in component && component.includes && component.includes.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-xs text-slate-400">包含：</span>
                {component.includes.map((name) => (
                  <code key={name} className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">
                    {name}
                  </code>
                ))}
              </div>
            )}
          </PanelCard>
        ))}
      </div>
    </PageContent>
  );
}
