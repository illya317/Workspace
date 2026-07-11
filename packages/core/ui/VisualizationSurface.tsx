"use client";

import { renderVisual } from "./internal/visualization/VisualizationSurfaceChart";
import VisualizationGantt from "./internal/visualization/VisualizationGantt";
import type { VisualizationSurfaceFrameSpec, VisualizationSurfaceProps } from "./VisualizationSurfaceTypes";

export type {
  VisualizationBarChartSpec,
  VisualizationBarSpec,
  VisualizationComparisonBarItemSpec,
  VisualizationComparisonBarSectionSpec,
  VisualizationComparisonBarsSpec,
  VisualizationGroupedBarChartSpec,
  VisualizationGroupedBarGroupSpec,
  VisualizationLegendSpec,
  VisualizationSpec,
  VisualizationSurfaceChartProps,
  VisualizationSurfaceChartSpec,
  VisualizationSurfaceFrameSpec,
  VisualizationSurfaceGanttSpec,
  VisualizationSurfaceGanttProps,
  VisualizationSurfaceKind,
  VisualizationSurfaceProps,
  VisualizationTone,
  VisualizationTreeBadgeSpec,
  VisualizationTreeNodeSpec,
  VisualizationTreeSpec,
} from "./VisualizationSurfaceTypes";

function frameForVisualization(props: VisualizationSurfaceProps): VisualizationSurfaceFrameSpec | undefined {
  if (props.kind === "chart") return props.chart.frame;
  return props.gantt.frame;
}

function renderVisualization(props: VisualizationSurfaceProps) {
  if (props.kind === "chart") return renderVisual(props.chart.visual);
  const timeline = props.gantt.timeline;
  return timeline.rows.length > 0 ? <VisualizationGantt spec={timeline} /> : props.gantt.empty ?? <VisualizationGantt spec={timeline} />;
}

export default function VisualizationSurface(props: VisualizationSurfaceProps) {
  const frame = frameForVisualization(props);
  return (
    <div className="min-w-0 space-y-4">
      {(frame?.title || frame?.subtitle) && (
        <div className="space-y-1">
          {frame.title ? <h3 className="text-base font-semibold text-slate-900">{frame.title}</h3> : null}
          {frame.subtitle ? <p className="text-sm text-slate-500">{frame.subtitle}</p> : null}
        </div>
      )}
      {renderVisualization(props)}
    </div>
  );
}
