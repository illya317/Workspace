"use client";

import type { FC } from "react";
import { BlockSurface, VisualizationSurface } from "@workspace/core/ui";

function BlockSurfacePreview() {
  return (
    <div className="space-y-4">
      <BlockSurface
        kind="message"
        tone="success"
        content="区块 Surface 承载短消息、标题、动作、section/panel 等通用正文块。"
      />
      <BlockSurface
        kind="section"
        title="通用区块"
        subtitle="复杂业务正文应升级到专用 Surface。"
        actions={[{ key: "refresh", label: "刷新", variant: "secondary" }]}
        content={<p className="text-sm text-slate-600">这里可以放短内容，或者组合几个轻量 block。</p>}
      />
    </div>
  );
}

function VisualizationSurfacePreview() {
  return (
    <VisualizationSurface
      kind="chart"
      title="人员趋势"
      framed
      visual={{
        kind: "groupedBarChart",
        title: "近 4 月入职/离职",
        height: 120,
        groups: [
          { key: "03", label: "03", bars: [{ key: "joins", label: "入职", value: 8, tone: "blue" }, { key: "leaves", label: "离职", value: 2, tone: "rose" }] },
          { key: "04", label: "04", bars: [{ key: "joins", label: "入职", value: 5, tone: "blue" }, { key: "leaves", label: "离职", value: 3, tone: "rose" }] },
          { key: "05", label: "05", bars: [{ key: "joins", label: "入职", value: 11, tone: "blue" }, { key: "leaves", label: "离职", value: 4, tone: "rose" }] },
          { key: "06", label: "06", bars: [{ key: "joins", label: "入职", value: 7, tone: "blue" }, { key: "leaves", label: "离职", value: 1, tone: "rose" }] },
        ],
        legend: [
          { key: "joins", label: "入职", tone: "blue" },
          { key: "leaves", label: "离职", tone: "rose" },
        ],
      }}
    />
  );
}

export const surfacePreviewByName: Record<string, FC> = {
  BlockSurface: BlockSurfacePreview,
  VisualizationSurface: VisualizationSurfacePreview,
};
