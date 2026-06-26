"use client";

import { MetricCard, PanelCard } from "@workspace/core/ui";
import { getWorkSpaceLabel } from "./model";
import type { WorkTaskSpace } from "./types";

export function SpaceHeader({ space }: { space: WorkTaskSpace }) {
  return (
    <PanelCard bodyClassName="px-5 py-4">
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-emerald-600">{getWorkSpaceLabel(space.targetType)}工作计划</div>
          <h2 className="mt-1 truncate text-xl font-semibold text-slate-950">{space.name}</h2>
          {space.subtitle && <p className="mt-1 text-sm text-slate-500">{space.subtitle}</p>}
        </div>
        <div className="grid grid-cols-4 gap-2 text-center">
          <MetricCard label="目标" value={space.counts.objective} className="px-3 py-2" />
          <MetricCard label="结果" value={space.counts.keyResult} className="px-3 py-2" />
          <MetricCard label="任务" value={space.counts.task} className="px-3 py-2" />
          <MetricCard label="归档" value={space.counts.archived} className="px-3 py-2" />
        </div>
      </div>
    </PanelCard>
  );
}
