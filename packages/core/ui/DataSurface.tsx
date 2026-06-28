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
  DataSurfaceLooseRow,
  DataSurfaceMetricSpec,
  DataSurfaceRecordActionSpec,
  DataSurfaceActionsColumnSpec,
  DataSurfacePresentationSpec,
  DataSurfaceProps,
  DataSurfaceRecordSpec,
  DataSurfaceRowActionSpec,
  DataSurfaceRowEditActionSpec,
  DataSurfaceStructuredCellSpec,
  DataSurfaceTableProps,
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
