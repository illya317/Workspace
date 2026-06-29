"use client";

import { PanelCard } from "./internal/common/Card";
import { renderCommands, renderData } from "./internal/data/DataSurface.renderers";
import type { DataSurfaceLooseRow, DataSurfaceProps } from "./DataSurface.types";

export type {
  DataSurfaceAlign,
  DataSurfaceCellActionSpec,
  DataSurfaceCellGroupSpec,
  DataSurfaceCellInputSpec,
  DataSurfaceCellSelectionGridSpec,
  DataSurfaceCellSpec,
  DataSurfaceColumnSpec,
  DataSurfaceCommandSpec,
  DataSurfaceDisplaySpec,
  DataSurfaceEmphasis,
  DataSurfaceFont,
  DataSurfaceFrame,
  DataSurfaceKind,
  DataSurfaceLooseRow,
  DataSurfaceMetricSpec,
  DataSurfaceRowState,
  DataSurfaceScrollSpec,
  DataSurfaceRecordActionSpec,
  DataSurfaceActionsColumnSpec,
  DataSurfacePresentationSpec,
  DataSurfaceProps,
  DataSurfaceRecordSpec,
  DataSurfaceRowActionSpec,
  DataSurfaceRowEditActionSpec,
  DataSurfaceStructuredCellSpec,
  DataSurfaceStructuredCellRole,
  DataSurfaceTableProps,
  DataSurfaceTone,
  DataSurfaceWidth,
  DataSurfaceWrap,
} from "./DataSurface.types";

export default function DataSurface<T = DataSurfaceLooseRow>(props: DataSurfaceProps<T>) {
  if (props.wrap === false) return renderData(props);

  const content = (
    <div className="space-y-4">
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
      bodyClassName="p-4"
    >
      <div className="space-y-4">
        {renderData(props)}
      </div>
    </PanelCard>
  );
}
