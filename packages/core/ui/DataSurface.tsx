"use client";

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
  DataSurfaceRowState,
  DataSurfaceScrollSpec,
  DataSurfaceActionsColumnSpec,
  DataSurfacePresentationSpec,
  DataSurfaceProps,
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

  return content;
}
