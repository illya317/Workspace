"use client";

import { PanelCard } from "./Card";
import { joinClassNames } from "./card-utils";
import { renderCommands, renderData, renderToolbar } from "./DataSurface.renderers";
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
  DataSurfaceToolbarSpec,
} from "./DataSurface.types";

export default function DataSurface<T = DataSurfaceLooseRow>(props: DataSurfaceProps<T>) {
  if (props.wrap === false) return renderData(props);

  const content = (
    <div className={joinClassNames("space-y-4", props.framed ? "" : props.className)}>
      {renderToolbar(props.toolbar)}
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
      {renderToolbar(props.toolbar)}
      {renderData(props)}
    </PanelCard>
  );
}
