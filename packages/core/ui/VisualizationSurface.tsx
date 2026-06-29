"use client";

import { PanelCard } from "./internal/common/Card";
import { renderVisual } from "./internal/visualization/VisualizationSurfaceChart";
import VisualizationGantt from "./internal/visualization/VisualizationGantt";
import type { VisualizationSurfaceProps } from "./VisualizationSurfaceTypes";

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
  VisualizationSurfaceGanttProps,
  VisualizationSurfaceKind,
  VisualizationSurfaceProps,
  VisualizationTone,
  VisualizationTreeBadgeSpec,
  VisualizationTreeNodeSpec,
  VisualizationTreeSpec,
} from "./VisualizationSurfaceTypes";

function renderVisualization(props: VisualizationSurfaceProps) {
  if (props.kind === "chart") return renderVisual(props.visual);
  return props.gantt.rows.length > 0 ? <VisualizationGantt spec={props.gantt} /> : props.empty ?? <VisualizationGantt spec={props.gantt} />;
}

export default function VisualizationSurface(props: VisualizationSurfaceProps) {
  const content = <div className="min-w-0">{renderVisualization(props)}</div>;
  if (!props.framed) return content;
  return (
    <PanelCard
      title={props.title}
      subtitle={props.subtitle}
      bodyClassName="p-4"
    >
      {renderVisualization(props)}
    </PanelCard>
  );
}
