import { AnalysisBlock, EmptyStateCard, MetricCard, ModuleCardBody, PanelCard, SelectorCard } from "../../Card";
import { MiniButton, MiniField } from "./PreviewBits";

export function LayoutPreview({ variant }: { variant: "page" | "module" | "split" | "tree" | "empty" | "analysis" }) {
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
