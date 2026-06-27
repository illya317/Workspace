"use client";

import { PanelCard } from "./Card";
import { joinClassNames } from "./card-utils";
import { renderCommands, renderData } from "./DataSurface.renderers";
import type { DataSurfaceLooseRow, DataSurfaceProps } from "./DataSurface.types";

export type {
  DataSurfaceCellActionSpec,
  DataSurfaceCellGroupSpec,
  DataSurfaceCellInputSpec,
  DataSurfaceCellSelectionGridSpec,
  DataSurfaceCellSpec,
  DataSurfaceColumnSpec,
  DataSurfaceCommandSpec,
  DataSurfaceDisplaySpec,
  DataSurfaceKind,
  DataSurfaceMetricSpec,
  DataSurfaceProps,
  DataSurfaceRecordSpec,
  DataSurfaceStructuredCellSpec,
  DataSurfaceTableProps,
  DataSurfaceVisualBarChartSpec,
  DataSurfaceVisualBarSpec,
  DataSurfaceVisualComparisonBarItemSpec,
  DataSurfaceVisualComparisonBarSectionSpec,
  DataSurfaceVisualComparisonBarsSpec,
  DataSurfaceVisualGroupedBarChartSpec,
  DataSurfaceVisualGroupedBarGroupSpec,
  DataSurfaceVisualLegendSpec,
  DataSurfaceVisualProps,
  DataSurfaceVisualSpec,
  DataSurfaceVisualTone,
  DataSurfaceVisualTreeBadgeSpec,
  DataSurfaceVisualTreeNodeSpec,
  DataSurfaceVisualTreeSpec,
} from "./DataSurface.types";

export default function DataSurface<T = DataSurfaceLooseRow>(props: DataSurfaceProps<T>) {
  if (props.wrap === false) return renderData(props);

  const content = (
    <div className={joinClassNames("space-y-4", props.framed ? "" : props.className)}>
      {renderCommands(props.actions)}
      {renderData(props)}
    </div>
  );

  if (!props.framed) return content;

  return (
    <PanelCard
      title={props.title}
      subtitle={props.subtitle}
      actions={renderCommands(props.actions)}
      className={props.className}
      bodyClassName={joinClassNames("p-4", props.bodyClassName)}
    >
      <div className="space-y-4">
        {renderData(props)}
      </div>
    </PanelCard>
  );
}
