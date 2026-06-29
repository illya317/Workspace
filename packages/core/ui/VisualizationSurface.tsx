"use client";

import { PanelCard } from "./internal/common/Card";
import { joinClassNames } from "./internal/common/card-utils";
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
  const content = <div className={joinClassNames("min-w-0", props.framed ? "" : props.className)}>{renderVisualization(props)}</div>;
  if (!props.framed) return content;
  return (
    <PanelCard
      title={props.title}
      subtitle={props.subtitle}
      className={props.className}
      bodyClassName={joinClassNames("p-4", props.bodyClassName)}
    >
      {renderVisualization(props)}
    </PanelCard>
  );
}
