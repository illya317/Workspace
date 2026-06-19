"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import {
  ActionToolbar,
  AnalysisBlock,
  EmptyStateCard,
  MetricCard,
  ModuleCardBody,
  PanelCard,
  SelectorCard,
} from "./Card";
import CalendarDateInput from "./CalendarDateInput";
import DataTable from "./DataTable";
import EditToolbar from "./EditToolbar";
import FilterField from "./FilterField";
import FilterToolbar from "./FilterToolbar";
import InlineCreatePanel from "./InlineCreatePanel";
import Pagination from "./Pagination";
import SearchInput from "./SearchInput";
import SelectField from "./SelectField";
import StatusBadge from "./StatusBadge";
import StatusToggle from "./StatusToggle";

export interface RegistryBrowserItem {
  name: string;
  kind: string;
  kindLabel: string;
  kindDescription: string;
  description: string;
  example: string;
  includedComponents: string[];
  usageFiles: string[];
}

export interface RegistryBrowserCardProps {
  title: string;
  subtitle?: string;
  items: RegistryBrowserItem[];
  emptyText?: string;
}

function groupItems(items: RegistryBrowserItem[]) {
  const groups = new Map<string, RegistryBrowserItem[]>();
  for (const item of items) {
    const key = item.kind;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups.entries()]
    .map(([kind, groupItems]) => ({
      kind,
      label: groupItems[0]?.kindLabel ?? kind,
      description: groupItems[0]?.kindDescription ?? "",
      items: groupItems.sort((left, right) => left.name.localeCompare(right.name)),
    }))
    .sort((left, right) => left.label.localeCompare(right.label, "zh-CN"));
}

function RegistryPill({
  children,
  muted = false,
}: {
  children: string;
  muted?: boolean;
}) {
  return (
    <span
      className={`rounded-md border px-2 py-0.5 text-xs ${
        muted
          ? "border-slate-200 bg-slate-50 text-slate-400"
          : "border-emerald-100 bg-emerald-50 text-emerald-700"
      }`}
    >
      {children}
    </span>
  );
}

function UsageFiles({ files }: { files: string[] }) {
  if (files.length === 0) {
    return <span className="text-sm text-slate-400">未发现消费文件</span>;
  }

  const visibleFiles = files.slice(0, 6);
  const remaining = files.length - visibleFiles.length;

  return (
    <div className="space-y-1.5">
      {visibleFiles.map((file) => (
        <div key={file} className="truncate font-mono text-xs text-slate-600">
          {file}
        </div>
      ))}
      {remaining > 0 && (
        <div className="text-xs text-slate-400">另 {remaining} 个文件</div>
      )}
    </div>
  );
}

function PreviewFrame({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="mb-2 text-xs font-medium text-slate-400">组件实例</div>
      <div className="rounded-md border border-slate-200 bg-white p-3">
        {children}
      </div>
    </div>
  );
}

function PreviewNote({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2 rounded-md border border-slate-200 bg-white p-3">
      <div className="text-sm font-semibold text-slate-900">{title}</div>
      <div className="text-xs leading-5 text-slate-500">{children}</div>
    </div>
  );
}

function MiniButton({
  children,
  primary = false,
  danger = false,
}: {
  children: ReactNode;
  primary?: boolean;
  danger?: boolean;
}) {
  const className = danger
    ? "border-red-200 bg-red-50 text-red-600"
    : primary
      ? "border-emerald-600 bg-emerald-600 text-white"
      : "border-slate-300 bg-white text-slate-600";

  return (
    <button
      type="button"
      className={`rounded-md border px-3 py-1.5 text-xs font-semibold shadow-sm ${className}`}
    >
      {children}
    </button>
  );
}

function MiniField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="text-[11px] font-medium text-slate-400">{label}</div>
      <div className="mt-0.5 truncate text-sm font-semibold text-slate-800">{value}</div>
    </div>
  );
}

function EntitySearchPreview({ mode }: { mode: "single" | "multiple" }) {
  return (
    <div className="space-y-2">
      <SearchInput value="张" onChange={() => {}} placeholder="搜索姓名、编码、拼音" size="compact" />
      <div className="space-y-1.5 rounded-md border border-slate-200 p-2">
        {[
          ["张云", "员工 · E-1024"],
          ["张明", "部门负责人 · E-1186"],
        ].map(([name, meta], index) => (
          <div
            key={name}
            className={`flex items-center justify-between rounded-md px-2 py-1.5 text-xs ${
              index === 0 ? "bg-emerald-50 text-emerald-800" : "bg-slate-50 text-slate-600"
            }`}
          >
            <span className="font-semibold">{name}</span>
            <span>{meta}</span>
          </div>
        ))}
      </div>
      <div className="text-[11px] text-slate-400">
        {mode === "single" ? "用于 FK：搜索后选择一个目标记录。" : "用于字段检索：保留关键词并匹配多条记录。"}
      </div>
    </div>
  );
}

function ConfirmPreview({ title = "确认停用这条记录？" }: { title?: string }) {
  return (
    <div className="mx-auto max-w-xs rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div className="text-sm font-semibold text-slate-900">{title}</div>
      <p className="mt-1 text-xs leading-5 text-slate-500">
        操作会写入审计记录，仍被引用时应由业务守卫阻断。
      </p>
      <div className="mt-3 flex justify-end gap-2">
        <MiniButton>取消</MiniButton>
        <MiniButton danger>确认</MiniButton>
      </div>
    </div>
  );
}

function DetailPreview() {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
        <div className="text-sm font-semibold text-slate-900">记录详情</div>
        <span className="text-xs text-slate-400">关闭</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <MiniField label="状态" value="现用" />
        <MiniField label="负责人" value="张云" />
      </div>
    </div>
  );
}

function ToolbarPreview({ variant }: { variant: "filter" | "action" | "edit" | "split" }) {
  if (variant === "filter") {
    return (
      <FilterToolbar
        keyword="张"
        onKeywordChange={() => {}}
        searchPlaceholder="搜索姓名、编码"
        pageSize={50}
        onPageSizeChange={() => {}}
        searchClassName="sm:w-48"
      >
        <SelectField
          value="active"
          onChange={() => {}}
          options={[
            { value: "active", label: "现用" },
            { value: "archived", label: "已归档" },
          ]}
          size="toolbar"
        />
      </FilterToolbar>
    );
  }

  if (variant === "action") {
    return (
      <ActionToolbar
        leftSlot={<span className="text-sm font-semibold text-slate-800">已选择 2 条记录</span>}
        secondaryActions={[{ label: "导出" }]}
        primaryActions={[{ label: "新增" }]}
      />
    );
  }

  if (variant === "edit") {
    return (
      <EditToolbar
        editMode
        onStartEdit={() => {}}
        onSave={async () => {}}
        onCancel={() => {}}
        onShowHistory={() => {}}
      />
    );
  }

  return (
    <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-3">
      <span className="text-sm font-semibold text-slate-900">左侧列表</span>
      <div className="flex gap-2">
        <MiniButton>收起</MiniButton>
        <MiniButton primary>保存详情</MiniButton>
      </div>
    </div>
  );
}

function LayoutPreview({ variant }: { variant: "page" | "module" | "split" | "tree" | "empty" | "analysis" }) {
  if (variant === "module") {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4 text-center shadow-sm">
        <ModuleCardBody
          title="数据治理"
          description="统一注册、约束和引用检查入口。"
          color="blue"
          badge="Core"
          icon={<span className="text-lg font-bold">UI</span>}
          actions={[{ label: "进入" }]}
        />
      </div>
    );
  }

  if (variant === "split") {
    return (
      <div className="grid grid-cols-[3fr_7fr] gap-2">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
          <div className="text-xs font-semibold text-slate-500">列表</div>
          <SelectorCard title="计划 A" subtitle="进行中" active />
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-2">
          <div className="text-xs font-semibold text-slate-500">详情</div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <MiniField label="编码" value="W-2026-01" />
            <MiniField label="状态" value="进行中" />
          </div>
        </div>
      </div>
    );
  }

  if (variant === "tree") {
    return (
      <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-3">
        <SelectorCard title="生产中心" subtitle="一级部门" active />
        <div className="ml-5 space-y-2 border-l border-slate-200 pl-3">
          <SelectorCard title="包装组" subtitle="二级部门" />
          <SelectorCard title="质检组" subtitle="二级部门" />
        </div>
      </div>
    );
  }

  if (variant === "empty") {
    return <EmptyStateCard compact>暂无数据，调整筛选条件或新建一条记录。</EmptyStateCard>;
  }

  if (variant === "analysis") {
    return (
      <AnalysisBlock title="趋势分析" subtitle="按月汇总已完成数量" bodyClassName="space-y-3">
        <div className="grid grid-cols-3 gap-2">
          <MetricCard label="本月" value="128" />
          <MetricCard label="同比" value="+12%" />
          <MetricCard label="预警" value="3" />
        </div>
        <div className="flex h-12 items-end gap-1 rounded-md bg-slate-50 px-3 py-2">
          {[40, 70, 55, 90, 64, 82].map((height, index) => (
            <div
              key={index}
              className="flex-1 rounded-t bg-emerald-500/70"
              style={{ height: `${height}%` }}
            />
          ))}
        </div>
      </AnalysisBlock>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
        <div>
          <div className="text-sm font-semibold text-slate-900">页面标题</div>
          <div className="text-xs text-slate-500">页面说明和当前上下文</div>
        </div>
        <MiniButton primary>主要操作</MiniButton>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <MiniField label="筛选区" value="搜索 / 状态 / 分页" />
        <MiniField label="内容区" value="表格 / 详情 / 卡片" />
      </div>
    </div>
  );
}

function ComponentPreview({ item }: { item: RegistryBrowserItem }) {
  const tableRows = [{ id: 1, name: "示例行", status: "已启用" }];
  const tableColumns = [
    { key: "name", label: "名称", required: true, render: (row: typeof tableRows[number]) => row.name },
    { key: "status", label: "状态", required: true, render: (row: typeof tableRows[number]) => row.status },
  ];

  let preview: ReactNode;

  switch (item.name) {
    case "SearchInput":
      preview = <SearchInput value="张" onChange={() => {}} placeholder="搜索姓名、编码、拼音" size="compact" />;
      break;
    case "SelectField":
      preview = (
        <SelectField
          value="active"
          onChange={() => {}}
          options={[{ value: "active", label: "现用" }, { value: "archived", label: "已归档" }]}
          size="compact"
        />
      );
      break;
    case "FilterField":
      preview = (
        <FilterField
          fieldKey="status"
          onFieldKeyChange={() => {}}
          value="active"
          onValueChange={() => {}}
          fields={[
            { key: "status", label: "状态" },
            { key: "department", label: "部门" },
          ]}
          valueOptions={{
            status: [
              { value: "active", label: "现用" },
              { value: "archived", label: "已归档" },
            ],
            department: [
              { value: "prod", label: "生产部" },
              { value: "qc", label: "质检部" },
            ],
          }}
        />
      );
      break;
    case "CalendarDateInput":
      preview = <CalendarDateInput value="2026-06-20" onChange={() => {}} />;
      break;
    case "StatusBadge":
      preview = <StatusBadge label="已启用" variant="green" />;
      break;
    case "StatusToggle":
      preview = (
        <StatusToggle
          active="active"
          onChange={() => {}}
          tabs={[{ key: "active", label: "现用", count: 12 }, { key: "all", label: "全部", count: 18 }]}
        />
      );
      break;
    case "Pagination":
      preview = <Pagination page={2} totalPages={5} total={48} onPageChange={() => {}} compact />;
      break;
    case "MetricCard":
      preview = <MetricCard label="指标" value="128" />;
      break;
    case "PanelCard":
    case "SectionCard":
      preview = (
        <PanelCard title="面板标题" subtitle="面板说明" bodyClassName="p-3">
          <div className="grid grid-cols-2 gap-2">
            <MiniField label="字段 A" value="已填写" />
            <MiniField label="字段 B" value="待确认" />
          </div>
        </PanelCard>
      );
      break;
    case "DataTable":
      preview = (
        <DataTable
          rows={tableRows}
          columns={tableColumns}
          visibleColumns={[]}
          density="compact"
          rowKey={(row) => row.id}
        />
      );
      break;
    case "AmountCell":
      preview = <span className="font-mono text-sm font-semibold text-slate-900">¥ 12,800.00</span>;
      break;
    case "NumberCell":
      preview = <span className="font-mono text-sm font-semibold text-slate-900">1,280</span>;
      break;
    case "FilterToolbar":
    case "FilterBar":
      preview = <ToolbarPreview variant="filter" />;
      break;
    case "ActionToolbar":
      preview = <ToolbarPreview variant="action" />;
      break;
    case "getToolbarActionClassName":
      preview = (
        <div className="flex flex-wrap gap-2">
          <MiniButton primary>主操作</MiniButton>
          <MiniButton>次操作</MiniButton>
          <MiniButton danger>危险操作</MiniButton>
        </div>
      );
      break;
    case "EditToolbar":
      preview = <ToolbarPreview variant="edit" />;
      break;
    case "SplitWorkspaceToolbar":
      preview = <ToolbarPreview variant="split" />;
      break;
    case "ConfirmModal":
      preview = <ConfirmPreview />;
      break;
    case "ConfirmProvider":
      preview = (
        <PreviewNote title="统一确认入口">
          页面调用 confirm()，实际弹窗由 Provider 统一挂载，避免业务页手写 window.confirm。
        </PreviewNote>
      );
      break;
    case "DetailModal":
      preview = <DetailPreview />;
      break;
    case "FKSearchInput":
      preview = <EntitySearchPreview mode="single" />;
      break;
    case "OptionPicker":
      preview = (
        <SelectField
          value="qc"
          onChange={() => {}}
          options={[
            { value: "prod", label: "生产部" },
            { value: "qc", label: "质检部" },
          ]}
          size="compact"
        />
      );
      break;
    case "PickerShell":
      preview = <EntitySearchPreview mode="multiple" />;
      break;
    case "SelectorCard":
      preview = (
        <SelectorCard
          title="张云"
          subtitle="员工 · E-1024"
          active
          meta={[{ label: "部门", value: "生产部" }, { label: "状态", value: "现用" }]}
        />
      );
      break;
    case "ArchiveSelectorPanel":
      preview = (
        <PreviewNote title="归档范围选择">
          用同一选择器切换“现用 / 全部 / 已归档”，归档语义由业务文案传入。
        </PreviewNote>
      );
      break;
    case "PageContent":
    case "PageShell":
      preview = <LayoutPreview variant="page" />;
      break;
    case "ModuleCardBody":
    case "ModuleGridPage":
      preview = <LayoutPreview variant="module" />;
      break;
    case "SplitWorkspace":
      preview = <LayoutPreview variant="split" />;
      break;
    case "TreeNodeBranch":
    case "TreeNodeCard":
      preview = <LayoutPreview variant="tree" />;
      break;
    case "EmptyStateCard":
      preview = <LayoutPreview variant="empty" />;
      break;
    case "AnalysisBlock":
      preview = <LayoutPreview variant="analysis" />;
      break;
    case "InlineCreatePanel":
      preview = (
        <InlineCreatePanel
          title="快速新建"
          onSubmit={() => {}}
          onCancel={() => {}}
          fieldsClassName="grid grid-cols-1 gap-2"
          submitLabel="新建"
        >
          <SearchInput value="" onChange={() => {}} placeholder="输入名称" size="compact" />
          <SelectField
            value="active"
            onChange={() => {}}
            options={[{ value: "active", label: "现用" }, { value: "draft", label: "草稿" }]}
            size="compact"
          />
        </InlineCreatePanel>
      );
      break;
    default:
      preview = (
        <PreviewNote title={item.name}>
          {item.example}
        </PreviewNote>
      );
  }

  return <PreviewFrame>{preview}</PreviewFrame>;
}

export default function RegistryBrowserCard({
  title,
  subtitle,
  items,
  emptyText = "暂无注册项",
}: RegistryBrowserCardProps) {
  const groups = useMemo(() => groupItems(items), [items]);
  const [activeKind, setActiveKind] = useState(() => groups[0]?.kind ?? "");
  const activeGroup = groups.find((group) => group.kind === activeKind) ?? groups[0];

  if (groups.length === 0 || !activeGroup) {
    return (
      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
        </div>
        <p className="p-8 text-center text-sm text-slate-400">{emptyText}</p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
            {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
          </div>
          <div className="text-sm text-slate-400">
            {items.length} 个注册组件 / {groups.length} 个分类
          </div>
        </div>
      </div>

      <div className="grid gap-0 lg:grid-cols-[3fr_7fr]">
        <div className="border-b border-slate-200 bg-slate-50/70 p-4 lg:border-b-0 lg:border-r">
          <div className="space-y-2">
            {groups.map((group) => {
              const active = group.kind === activeGroup.kind;
              return (
                <button
                  key={group.kind}
                  type="button"
                  onClick={() => setActiveKind(group.kind)}
                  className={`w-full rounded-lg border px-4 py-3 text-left transition ${
                    active
                      ? "border-emerald-200 bg-white shadow-sm"
                      : "border-transparent hover:border-slate-200 hover:bg-white"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium text-slate-900">{group.label}</span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                      {group.items.length}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    {group.description}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="p-5">
          <div className="mb-4">
            <h3 className="text-base font-semibold text-slate-900">{activeGroup.label}</h3>
            <p className="mt-1 text-sm text-slate-500">{activeGroup.description}</p>
          </div>

          <div className="space-y-4">
            {activeGroup.items.map((item) => (
              <article
                key={item.name}
                className="rounded-lg border border-slate-200 bg-white p-4"
              >
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0">
                    <h4 className="font-mono text-sm font-semibold text-slate-950">
                      {item.name}
                    </h4>
                    <p className="mt-1 text-sm leading-6 text-slate-500">
                      {item.description}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      <span className="font-medium text-slate-800">使用案例：</span>
                      {item.example}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                    {item.kindLabel}
                  </span>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
                  <div>
                    <ComponentPreview item={item} />
                  </div>

                  <div className="space-y-4">
                    <div>
                    <div className="mb-2 text-xs font-medium text-slate-400">包括的子组件</div>
                    <div className="flex flex-wrap gap-1.5">
                      {item.includedComponents.length > 0 ? (
                        item.includedComponents.map((component) => (
                          <RegistryPill key={component}>{component}</RegistryPill>
                        ))
                      ) : (
                        <RegistryPill muted>primitive</RegistryPill>
                      )}
                    </div>
                  </div>

                    <div>
                      <div className="mb-2 text-xs font-medium text-slate-400">使用的文件</div>
                      <UsageFiles files={item.usageFiles} />
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
