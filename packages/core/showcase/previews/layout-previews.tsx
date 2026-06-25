"use client";

import { useState, type FC } from "react";
import {
  AnalysisBlock,
  AnalysisPageFrame,
  DatabasePageFrame,
  EmptyStateCard,
  getModuleCardClassName,
  MetricCard,
  ModuleCardBody,
  ModuleGridPage,
  PageContent,
  PageShell,
  PageStyleShowcase,
  PanelCard,
  SectionCard,
  SplitWorkspace,
  TemplateWorkbenchFrame,
  TreeNodeBranch,
  TreeNodeCard,
  WorkspaceSplitPage,
} from "@workspace/core/ui";
import type { ModuleTemplate, PageStyleRouteModule, PageViewDefinition } from "@workspace/core/ui/page-style-preview/template-data";

function AnalysisBlockPreview() {
  return (
    <div className="max-w-md">
      <AnalysisBlock title="月度 KPI" subtitle="2026 年 6 月" toolbar={<span className="text-xs text-slate-400">更多</span>}>
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
      <DatabasePageFrame contentClassName="py-4" tabs={[{ key: "list", label: "列表" }, { key: "settings", label: "设置" }]} activeTab={tab} onTabChange={setTab} summary={<div className="text-xs text-slate-500">当前筛选：全部 · 共 24 条</div>} toolbar={<div className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-500">工具栏占位：搜索 / 筛选 / 新建</div>}>
        <PanelCard title="数据表格" bodyClassName="p-3"><EmptyStateCard compact>暂无数据</EmptyStateCard></PanelCard>
      </DatabasePageFrame>
    </div>
  );
}

function EmptyStateCardPreview() { return <EmptyStateCard compact>暂无数据</EmptyStateCard>; }

function MetricCardPreview() {
  return <div className="grid grid-cols-2 gap-3 max-w-xs"><MetricCard label="本月" value="128" /><MetricCard label="同比" value="+12%" /><MetricCard label="预警" value="3" /><MetricCard label="完成率" value="94%" /></div>;
}

function ModuleCardBodyPreview() {
  return (
    <div className="grid max-w-md grid-cols-2 gap-3">
      <div className={getModuleCardClassName("emerald")}><ModuleCardBody title="人力资源" description="员工、岗位、部门管理" color="emerald" badge="核心" icon={<svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>} /></div>
      <div className={getModuleCardClassName("blue")}><ModuleCardBody title="财务报表" description="科目、凭证、报表" color="blue" icon={<svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>} /></div>
    </div>
  );
}

function ModuleGridPagePreview() {
  return (
    <div className="max-h-80 overflow-hidden rounded-lg border border-slate-200 bg-gray-50">
      <ModuleGridPage title="工作台" summary="选择要进入的模块" gridClassName="grid-cols-2">
        <div className={getModuleCardClassName("emerald")}><ModuleCardBody title="人事" icon={<svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 7.5a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.5 20.25a7.5 7.5 0 0115 0" /></svg>} color="emerald" /></div>
        <div className={getModuleCardClassName("blue")}><ModuleCardBody title="财务" icon={<svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10" strokeWidth="1.5" /><text x="12" y="16.5" textAnchor="middle" fontSize="11" fontWeight="700" fill="currentColor" stroke="none">¥</text></svg>} color="blue" /></div>
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

const showcaseModules: ModuleTemplate[] = [{
  key: "finance", label: "财务", overviewLabel: "概览",
  pages: [
    { key: "subjects", label: "科目设置", title: "科目设置", kind: "table", toolbar: true, tableColumns: ["编码", "名称", "类别"] },
    { key: "vouchers", label: "凭证明细", title: "凭证明细", kind: "table", toolbar: true, tableColumns: ["日期", "摘要", "金额"] },
  ],
}];
const showcaseRouteModules: PageStyleRouteModule[] = [{
  key: "finance", label: "财务", route: "/finance",
  children: [
    { key: "subjects", label: "科目设置", route: "/finance/subjects" },
    { key: "vouchers", label: "凭证明细", route: "/finance/vouchers" },
  ],
}];
const showcaseViewDefinitions: PageViewDefinition[] = [
  { route: "/finance/subjects", moduleKey: "finance", label: "科目设置", views: [{ key: "list", label: "列表" }] },
  { route: "/finance/vouchers", moduleKey: "finance", label: "凭证明细", views: [{ key: "list", label: "列表" }] },
];

function PageStyleShowcasePreview() {
  return <div className="max-h-96 overflow-auto rounded-lg border border-slate-200"><PageStyleShowcase modules={showcaseModules} routeModules={showcaseRouteModules} viewDefinitions={showcaseViewDefinitions} /></div>;
}

function PanelCardPreview() { return <PanelCard title="示例卡片" className="max-w-xs"><p className="text-sm text-slate-600">这是一个 PanelCard 示例内容。</p></PanelCard>; }

function SectionCardPreview() { return <SectionCard title="示例小节"><p className="text-sm text-slate-600">这是一个 SectionCard 示例内容。</p></SectionCard>; }

function SplitWorkspacePreview() {
  const [sideOpen, setSideOpen] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const renderSide = () => (
    <div className="space-y-2">
      <div className="rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-700">项目 A</div>
      <div className="rounded-md bg-white px-3 py-2 text-sm text-slate-700">项目 B</div>
      <div className="rounded-md bg-white px-3 py-2 text-sm text-slate-700">项目 C</div>
    </div>
  );
  return (
    <div className="max-h-64 overflow-hidden rounded-lg border border-slate-200">
      <div className="flex items-center gap-2 border-b border-slate-200 bg-white p-2">
        <button type="button" onClick={() => setSideOpen((v) => !v)} className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50">{sideOpen ? "隐藏侧栏" : "显示侧栏"}</button>
      </div>
      <div className="p-3">
        <SplitWorkspace sideOpen={sideOpen} drawerOpen={drawerOpen} onDrawerOpenChange={setDrawerOpen} renderSide={renderSide} splitRatio={[1, 2]}>
          <div className="rounded-md bg-slate-50 p-4 text-sm text-slate-600">右侧主内容区：保持详情编辑或表格区域。</div>
        </SplitWorkspace>
      </div>
    </div>
  );
}

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

function TreeNodeBranchPreview() {
  return (
    <div className="max-w-xs">
      <TreeNodeCard title="研发中心" level={1} meta="一级部门">
        <TreeNodeBranch>
          <TreeNodeCard title="平台组" level={2} meta="二级部门" />
          <TreeNodeCard title="业务组" level={2} meta="二级部门">
            <TreeNodeBranch><TreeNodeCard title="财务小队" level={3} meta="三级部门" /></TreeNodeBranch>
          </TreeNodeCard>
        </TreeNodeBranch>
      </TreeNodeCard>
    </div>
  );
}

function TreeNodeCardPreview() {
  return (
    <div className="flex flex-col gap-2 max-w-xs">
      <TreeNodeCard title="生产中心" level={1} meta="一级部门 · 现用" />
      <TreeNodeCard title="质量部" level={2} active meta="二级部门 · 选中态" />
      <TreeNodeCard title="仓储物流" level={3} meta="三级部门" />
    </div>
  );
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
      <WorkspaceSplitPage contentClassName="py-3" sideOpen={sideOpen} drawerOpen={drawerOpen} onSideOpenChange={setSideOpen} onDrawerOpenChange={setDrawerOpen} sideLabel="记录列表" renderSide={renderSide} header={<h2 className="text-base font-semibold text-slate-900">主从分栏页面</h2>} toolbar={<span className="text-xs text-slate-500">顶部工具栏占位</span>}>
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
  ModuleCardBody: ModuleCardBodyPreview,
  ModuleGridPage: ModuleGridPagePreview,
  PageContent: PageContentPreview,
  PageShell: PageShellPreview,
  PageStyleShowcase: PageStyleShowcasePreview,
  PanelCard: PanelCardPreview,
  SectionCard: SectionCardPreview,
  SplitWorkspace: SplitWorkspacePreview,
  TemplateWorkbenchFrame: TemplateWorkbenchFramePreview,
  "page-style-preview": PageStylePreviewNamespace,
  TreeNodeBranch: TreeNodeBranchPreview,
  TreeNodeCard: TreeNodeCardPreview,
  WorkspaceSplitPage: WorkspaceSplitPagePreview,
  moduleCardColorClasses: moduleCardColorClassesPreview,
  getModuleCardClassName: getModuleCardClassNamePreview,
};
