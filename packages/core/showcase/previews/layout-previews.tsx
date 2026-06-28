"use client";

import { useState, type FC } from "react";
import { createEmptyBlock, createSectionBlock, PageSurface } from "@workspace/core/ui";
import {
  AnalysisBlock,
  AnalysisPageFrame,
  DatabasePageFrame,
  EmptyStateCard,
  MetricCard,
  ModuleCard,
  ModuleGridPage,
  PageContent,
  PageShell,
  PanelCard,
  SectionCard,
  TemplateWorkbenchFrame,
  WorkspaceSplitPage,
} from "../internal-ui";

function AnalysisBlockPreview() {
  return (
    <div className="max-w-md">
      <AnalysisBlock title="月度 KPI" subtitle="2026 年 6 月" toolbarItems={[{ kind: "text", key: "more", content: "更多" }]}>
        <div className="grid grid-cols-3 gap-3"><MetricCard label="完成率" value="92%" /><MetricCard label="延期数" value="3" /><MetricCard label="预警" value="1" /></div>
      </AnalysisBlock>
    </div>
  );
}

function AnalysisPageFramePreview() {
  const [tab, setTab] = useState("trend");
  return (
    <div className="max-h-80 overflow-hidden rounded-lg border border-slate-200">
      <AnalysisPageFrame contentClassName="py-4" tabs={[{ key: "trend", label: "趋势" }, { key: "kpi", label: "KPI" }, { key: "alert", label: "预警" }]} activeTab={tab} onTabChange={setTab} metrics={<div className="grid grid-cols-3 gap-3"><MetricCard label="总收入" value="¥1.2M" /><MetricCard label="总成本" value="¥800K" /><MetricCard label="净利润" value="¥400K" /></div>}>
        <AnalysisBlock title="趋势分析"><div className="h-16 rounded-md bg-slate-50" /></AnalysisBlock>
      </AnalysisPageFrame>
    </div>
  );
}

function DatabasePageFramePreview() {
  const [tab, setTab] = useState("list");
  return (
    <div className="max-h-80 overflow-hidden rounded-lg border border-slate-200">
      <DatabasePageFrame contentClassName="py-4" tabs={[{ key: "list", label: "列表" }, { key: "settings", label: "设置" }]} activeTab={tab} onTabChange={setTab} summary={<div className="text-xs text-slate-500">当前筛选：全部 · 共 24 条</div>} toolbarItems={[{ kind: "text", key: "toolbar-preview", content: "工具栏占位：搜索 / 筛选 / 新建" }]}>
        <PanelCard title="数据表格" bodyClassName="p-3"><EmptyStateCard compact>暂无数据</EmptyStateCard></PanelCard>
      </DatabasePageFrame>
    </div>
  );
}

function EmptyStateCardPreview() { return <EmptyStateCard compact>暂无数据</EmptyStateCard>; }

function MetricCardPreview() {
  return <div className="grid grid-cols-2 gap-3 max-w-xs"><MetricCard label="本月" value="128" /><MetricCard label="同比" value="+12%" /><MetricCard label="预警" value="3" /><MetricCard label="完成率" value="94%" /></div>;
}

function ModuleCardPreview() {
  const icon = (
    <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 7.5a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.5 20.25a7.5 7.5 0 0115 0" />
    </svg>
  );
  return (
    <div className="grid max-w-md grid-cols-2 gap-3">
      <ModuleCard title="人力资源" description="员工、岗位、部门管理" color="emerald" badge="核心" icon={icon} />
      <ModuleCard title="财务报表" description="科目、凭证、报表" color="blue" icon={icon} onClick={() => {}} />
      <ModuleCard title="链接模式" description="使用原生 a 标签" color="indigo" href="#module-card" icon={icon} />
      <ModuleCard title="自定义链接" description="平台可用 renderLink 接入 Next Link" color="purple" href="#module-card" icon={icon} renderLink={({ href, className, children }) => <a href={href} className={className}>{children}</a>} />
    </div>
  );
}

function ModuleGridPagePreview() {
  return (
    <div className="max-h-80 overflow-hidden rounded-lg border border-slate-200 bg-gray-50">
      <ModuleGridPage title="工作台" summary="选择要进入的模块" gridClassName="grid-cols-2">
        <ModuleCard title="人事" icon={<svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 7.5a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.5 20.25a7.5 7.5 0 0115 0" /></svg>} color="emerald" />
        <ModuleCard title="财务" icon={<svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10" strokeWidth="1.5" /><text x="12" y="16.5" textAnchor="middle" fontSize="11" fontWeight="700" fill="currentColor" stroke="none">¥</text></svg>} color="blue" />
      </ModuleGridPage>
    </div>
  );
}

function PageContentPreview() {
  return (
    <div className="max-h-40 overflow-hidden rounded-lg border border-slate-200">
      <PageContent className="bg-white py-4"><div className="rounded-md bg-slate-50 p-4 text-sm text-slate-600">页面内容容器：统一最大宽度、水平内边距和上下留白。</div></PageContent>
    </div>
  );
}

function PageShellPreview() {
  return (
    <div className="max-h-48 overflow-hidden rounded-lg border border-slate-200">
      <PageShell title="页面标题" backLabel="返回" onBack={() => {}} actions={[{ label: "设置", onClick: () => {} }]}>
        <PageContent className="bg-gray-50 py-4"><div className="rounded-md bg-white p-4 text-sm text-slate-600">页面主体内容</div></PageContent>
      </PageShell>
    </div>
  );
}

function PageSurfacePreview() {
  return (
    <div className="max-h-80 overflow-hidden rounded-lg border border-slate-200">
      <PageSurface
        kind="list"
        contentClassName="py-4"
        toolbar={{
          items: [
            { kind: "search", key: "search", value: "", onChange: () => {}, placeholder: "搜索..." },
            { kind: "text", key: "count", content: "共 12 条" },
          ],
        }}
        blocks={[
          createSectionBlock("records", {
            title: "列表 Surface",
            subtitle: "toolbar / blocks / empty 都通过明确 spec 传入",
            blocks: [
              createEmptyBlock("empty", {
                content: "暂无数据",
                compact: true,
              }),
            ],
          }),
        ]}
      />
    </div>
  );
}

function PanelCardPreview() { return <PanelCard title="示例卡片" className="max-w-xs"><p className="text-sm text-slate-600">这是一个 PanelCard 示例内容。</p></PanelCard>; }

function SectionCardPreview() { return <SectionCard title="示例小节"><p className="text-sm text-slate-600">这是一个 SectionCard 示例内容。</p></SectionCard>; }

function TemplateWorkbenchFramePreview() {
  const [selectedKey, setSelectedKey] = useState("tmpl-1");
  const [query, setQuery] = useState("");
  return (
    <div className="max-h-96 overflow-auto rounded-lg border border-slate-200">
      <TemplateWorkbenchFrame
        selectorTitle="检验模板"
        selectorItems={[
          { key: "tmpl-1", title: "成品检验模板", subtitle: "适用于最终产品", meta: ["12 个阶段"] },
          { key: "tmpl-2", title: "来料检验模板", subtitle: "适用于原材料", meta: ["8 个阶段"] },
        ]}
        activeSelectorKey={selectedKey}
        onSelectorChange={setSelectedKey}
        query={query}
        onQueryChange={setQuery}
        searchPlaceholder="搜索模板、阶段..."
        toolbarMeta={<>共 2 个模板</>}
        sections={[
          {
            key: "stage-1", selectorKey: "tmpl-1", title: "外观检查", subtitle: "第一阶段", collapsible: true, defaultExpanded: true,
            rows: [
              { key: "row-1", badge: "1.1", title: "表面无划痕", description: "目视检查产品表面", actions: [{ label: "反馈", onClick: () => {} }, { label: "预览", onClick: () => {}, variant: "secondary" }] },
              { key: "row-2", badge: "1.2", title: "颜色一致性", description: "比对标准色卡", actions: [{ label: "反馈", onClick: () => {} }] },
            ],
          },
        ]}
      />
    </div>
  );
}

function PageStylePreviewNamespace() {
  return <div className="text-xs text-slate-400"><p className="font-medium">page-style-preview</p><p>页面样式预览配置深导入命名空间，用于设置页和平台视图注册读取模板数据。</p><p className="mt-1 text-slate-300">Hook / 工具函数，无组件级实时预览。</p></div>;
}

function WorkspaceSplitPagePreview() {
  const [sideOpen, setSideOpen] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const renderSide = () => (
    <div className="space-y-2 p-2">
      <div className="rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-700">记录 001</div>
      <div className="rounded-md bg-white px-3 py-2 text-sm text-slate-700">记录 002</div>
    </div>
  );
  return (
    <div className="max-h-72 overflow-hidden rounded-lg border border-slate-200">
      <WorkspaceSplitPage contentClassName="py-3" sideOpen={sideOpen} drawerOpen={drawerOpen} onSideOpenChange={setSideOpen} onDrawerOpenChange={setDrawerOpen} sideLabel="记录列表" renderSide={renderSide} header={<h2 className="text-base font-semibold text-slate-900">主从分栏页面</h2>} toolbarItems={[{ kind: "text", key: "toolbar-preview", content: "顶部工具栏占位" }]}>
        <div className="rounded-md bg-slate-50 p-4 text-sm text-slate-600">右侧详情主内容区，保持编辑或只读展示。</div>
      </WorkspaceSplitPage>
    </div>
  );
}

function moduleCardColorClassesPreview() {
  return <div className="text-xs text-slate-400"><p className="font-medium">moduleCardColorClasses</p><p>模块卡片颜色 recipe，统一卡片图标背景色和悬停色。</p><p className="mt-1 text-slate-300">Foundation / 样式 recipe，无运行时组件预览。</p></div>;
}

function getModuleCardClassNamePreview() {
  return <div className="text-xs text-slate-400"><p className="font-medium">getModuleCardClassName</p><p>模块卡片样式 recipe，按颜色分类返回图标背景、悬停和 ring class。</p><p className="mt-1 text-slate-300">Foundation / 样式 recipe，无运行时组件预览。</p></div>;
}

export const layoutPreviewByName: Record<string, FC> = {
  AnalysisBlock: AnalysisBlockPreview,
  AnalysisPageFrame: AnalysisPageFramePreview,
  DatabasePageFrame: DatabasePageFramePreview,
  EmptyStateCard: EmptyStateCardPreview,
  MetricCard: MetricCardPreview,
  ModuleCard: ModuleCardPreview,
  ModuleGridPage: ModuleGridPagePreview,
  PageContent: PageContentPreview,
  PageShell: PageShellPreview,
  PageSurface: PageSurfacePreview,
  PanelCard: PanelCardPreview,
  SectionCard: SectionCardPreview,
  TemplateWorkbenchFrame: TemplateWorkbenchFramePreview,
  "page-style-preview": PageStylePreviewNamespace,
  WorkspaceSplitPage: WorkspaceSplitPagePreview,
  moduleCardColorClasses: moduleCardColorClassesPreview,
  getModuleCardClassName: getModuleCardClassNamePreview,
};
