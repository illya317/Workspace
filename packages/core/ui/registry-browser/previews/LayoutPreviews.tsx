import { AnalysisBlock, EmptyStateCard, getModuleCardClassName, MetricCard, ModuleCardBody, PanelCard, SelectorCard } from "../../Card";
import { MiniButton, MiniField } from "./PreviewBits";

export function LayoutPreview({ variant }: { variant: "page" | "module" | "split" | "tree" | "empty" | "analysis" }) {
  if (variant === "module") {
    return (
      <div className={getModuleCardClassName("blue")}>
        <ModuleCardBody
          title="模块入口"
          description="统一展示入口说明和状态。"
          color="blue"
          badge="Core"
          icon={<svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6.5A2.5 2.5 0 016.5 4H10l2 2h5.5A2.5 2.5 0 0120 8.5v8A2.5 2.5 0 0117.5 19h-11A2.5 2.5 0 014 16.5v-10z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 11h8M8 14h5" /></svg>}
        />
      </div>
    );
  }

  if (variant === "split") {
    return (
      <div className="grid grid-cols-[3fr_7fr] gap-2">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
          <div className="text-xs font-semibold text-slate-500">列表</div>
          <SelectorCard title="项目 A" subtitle="进行中" active />
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
    <PanelCard title="页面标题" subtitle="页面说明和当前上下文" bodyClassName="p-3">
      <div className="grid grid-cols-2 gap-2">
        <MiniField label="筛选区" value="搜索 / 状态 / 分页" />
        <MiniField label="内容区" value="表格 / 详情 / 卡片" />
      </div>
      <div className="mt-3 flex justify-end">
        <MiniButton primary>主要操作</MiniButton>
      </div>
    </PanelCard>
  );
}
