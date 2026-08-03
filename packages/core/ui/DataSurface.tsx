"use client";

import { AntdDataSurface } from "./internal/data/antd-data";
import type { DataSurfaceLooseRow, DataSurfaceProps } from "./DataSurface.types";

export type {
  DataSurfaceAlign,
  DataSurfaceCellActionSpec,
  DataSurfaceCellGroupSpec,
  DataSurfaceCellInputSpec,
  DataSurfaceCellSelectionGridSpec,
  DataSurfaceCellSpec,
  DataSurfaceCellState,
  DataSurfaceColumnSpec,
  DataSurfaceCommandSpec,
  DataSurfaceDisplaySpec,
  DataSurfaceDisclosureSpec,
  DataSurfaceEmphasis,
  DataSurfaceFont,
  DataSurfaceFrame,
  DataSurfaceKind,
  DataSurfaceLooseRow,
  DataSurfaceMobilePresentation,
  DataSurfaceMobileSpec,
  DataSurfaceRowState,
  DataSurfaceScrollSpec,
  DataSurfaceActionsColumnSpec,
  DataSurfacePresentationSpec,
  DataSurfaceProps,
  DataSurfaceRecordActionSpec,
  DataSurfaceRecordProps,
  DataSurfaceRecordSpec,
  DataSurfaceRowActionSpec,
  DataSurfaceRowEditActionSpec,
  DataSurfaceSummaryMetricSpec,
  DataSurfaceSummaryProps,
  DataSurfaceStructuredCellSpec,
  DataSurfaceStructuredCellRole,
  DataSurfaceStructuredDimension,
  DataSurfaceStructuredFormatSpec,
  DataSurfaceStructuredMatrixFormatSpec,
  DataSurfaceStructuredProps,
  DataSurfaceStructuredRowInteractionSpec,
  DataSurfaceTableFormatSpec,
  DataSurfaceTableMatrixFormatSpec,
  DataSurfaceTableProps,
  DataSurfaceTone,
  DataSurfaceWidth,
  DataSurfaceWrap,
} from "./DataSurface.types";

export default function DataSurface<T = DataSurfaceLooseRow>(props: DataSurfaceProps<T>) {
  return <AntdDataSurface data={props} />;
}
