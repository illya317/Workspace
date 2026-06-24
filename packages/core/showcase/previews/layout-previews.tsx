"use client";

import { useState, type FC } from "react";
import {
  EmptyStateCard,
  PanelCard,
  SectionCard,
} from "@workspace/core/ui";

function AnalysisBlockPreview() {
    return <div className="text-xs text-slate-400"><p className="font-medium">AnalysisBlock</p><p>分析页内容块，用于 KPI、图表或摘要区的统一分组。</p><p className="mt-1 text-slate-300">实时预览待补充。</p></div>;
}

function AnalysisPageFramePreview() {
    return <div className="text-xs text-slate-400"><p className="font-medium">AnalysisPageFrame</p><p>分析页骨架，统一页内 Tab、指标条和分析内容块间距。</p><p className="mt-1 text-slate-300">实时预览待补充。</p></div>;
}

function DatabasePageFramePreview() {
    return <div className="text-xs text-slate-400"><p className="font-medium">DatabasePageFrame</p><p>数据库页骨架，统一 Tab、筛选工具条、摘要和表格内容排列。</p><p className="mt-1 text-slate-300">实时预览待补充。</p></div>;
}

function EmptyStateCardPreview() {
  return (
<EmptyStateCard compact>暂无数据</EmptyStateCard>
  );
}

function MetricCardPreview() {
    return <div className="text-xs text-slate-400"><p className="font-medium">MetricCard</p><p>指标卡片，用于展示单个统计值和标签。</p><p className="mt-1 text-slate-300">实时预览待补充。</p></div>;
}

function ModuleCardBodyPreview() {
    return <div className="text-xs text-slate-400"><p className="font-medium">ModuleCardBody</p><p>模块入口卡片主体，封装图标、标题、描述、徽标和动作。</p><p className="mt-1 text-slate-300">实时预览待补充。</p></div>;
}

function ModuleGridPagePreview() {
    return <div className="text-xs text-slate-400"><p className="font-medium">ModuleGridPage</p><p>低密度模块入口页骨架，统一标题、说明和模块卡片网格。</p><p className="mt-1 text-slate-300">实时预览待补充。</p></div>;
}

function PageContentPreview() {
    return <div className="text-xs text-slate-400"><p className="font-medium">PageContent</p><p>页面内容宽度和内边距容器，避免业务页重复写主内容壳。</p><p className="mt-1 text-slate-300">实时预览待补充。</p></div>;
}

function PageShellPreview() {
    return <div className="text-xs text-slate-400"><p className="font-medium">PageShell</p><p>页面标题、返回、动作和顶部结构骨架。</p><p className="mt-1 text-slate-300">实时预览待补充。</p></div>;
}

function PageStyleShowcasePreview() {
    return <div className="text-xs text-slate-400"><p className="font-medium">PageStyleShowcase</p><p>页面样式预览中心，按八大业务板块展示页眉、Tab、Toolbar、主体、页脚、预览和弹出框模板。</p><p className="mt-1 text-slate-300">实时预览待补充。</p></div>;
}

function PanelCardPreview() {
  return (
    <PanelCard title="示例卡片" className="max-w-xs">
      <p className="text-sm text-slate-600">这是一个 PanelCard 示例内容。</p>
    </PanelCard>
  );
}

function SectionCardPreview() {
  return (
    <SectionCard title="示例小节">
      <p className="text-sm text-slate-600">这是一个 SectionCard 示例内容。</p>
    </SectionCard>
  );
}

function SplitWorkspacePreview() {
    return <div className="text-xs text-slate-400"><p className="font-medium">SplitWorkspace</p><p>左右分栏工作区，适合列表加详情的主从工作流。</p><p className="mt-1 text-slate-300">实时预览待补充。</p></div>;
}

function TemplateWorkbenchFramePreview() {
    return <div className="text-xs text-slate-400"><p className="font-medium">TemplateWorkbenchFrame</p><p>模板结构工作台骨架，统一左侧模板选择、顶部搜索筛选、右侧阶段/项目行和行级动作承载区。</p><p className="mt-1 text-slate-300">实时预览待补充。</p></div>;
}

function PageStylePreviewNamespace() {
    return <div className="text-xs text-slate-400"><p className="font-medium">page-style-preview</p><p>页面样式预览配置深导入命名空间，用于设置页和平台视图注册读取模板数据。</p><p className="mt-1 text-slate-300">Hook / 工具函数，无组件级实时预览。</p></div>;
}

function TreeNodeBranchPreview() {
    return <div className="text-xs text-slate-400"><p className="font-medium">TreeNodeBranch</p><p>树节点分支容器，统一层级缩进和连接关系。</p><p className="mt-1 text-slate-300">实时预览待补充。</p></div>;
}

function TreeNodeCardPreview() {
    return <div className="text-xs text-slate-400"><p className="font-medium">TreeNodeCard</p><p>树节点卡片，统一节点标题、副标题、层级徽标和选中态。</p><p className="mt-1 text-slate-300">实时预览待补充。</p></div>;
}

function WorkspaceSplitPagePreview() {
    return <div className="text-xs text-slate-400"><p className="font-medium">WorkspaceSplitPage</p><p>主从分栏页面骨架，统一 3/7 分栏、移动端抽屉和显示隐藏工具条。</p><p className="mt-1 text-slate-300">实时预览待补充。</p></div>;
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
