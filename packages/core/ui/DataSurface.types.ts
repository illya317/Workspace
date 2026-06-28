import type { ReactNode } from "react";
import type { AmountCellProps } from "./AmountCell";
import type { BadgeProps } from "./Badge";
import type { DataTableColumn, DataTablePresentation, DataTableProps } from "./DataTable.types";
import type { DisclosureRecordAction } from "./DisclosureRecordCard";
import type { NumberCellProps } from "./NumberCell";
import type { SelectionGridProps } from "./SelectionGrid";
import type { StructuredTableCell, StructuredTableProps } from "./StructuredTable";
import type { CommandButtonProps } from "./CommandButton";
import type { InputControlProps } from "./InputControl";

export type DataSurfaceKind = "table" | "structured" | "records" | "metrics" | "visual" | "raw";
export type DataSurfaceLooseRow = ReturnType<typeof JSON.parse>;
export type DataSurfaceVisualTone = "blue" | "emerald" | "amber" | "rose" | "slate";

export interface DataSurfaceCommandSpec {
  key: string;
  label: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "danger";
  type?: "button" | "submit";
  size?: CommandButtonProps["size"];
  className?: string;
  truncate?: boolean;
}

export type DataSurfaceDisplaySpec =
  | { kind: "text"; value: ReactNode; className?: string }
  | { kind: "empty"; content?: ReactNode; className?: string }
  | { kind: "stack"; items: Array<ReactNode | DataSurfaceDisplaySpec>; gap?: "none" | "xs" | "sm"; className?: string }
  | ({ kind: "badge" } & BadgeProps)
  | ({ kind: "number" } & NumberCellProps)
  | ({ kind: "amount" } & AmountCellProps)
  | { kind: "raw"; value: unknown; className?: string };

export interface DataSurfaceCellInputSpec extends Omit<InputControlProps, "spec" | "value" | "onChange"> {
  kind: "input";
  spec: InputControlProps["spec"];
  value?: InputControlProps["value"];
  onChange?: InputControlProps["onChange"];
  stopPropagation?: boolean;
}

export interface DataSurfaceCellActionSpec extends DataSurfaceCommandSpec {
  stopPropagation?: boolean;
}

export interface DataSurfaceCellGroupSpec {
  kind: "group";
  items: DataSurfaceCellSpec[];
  direction?: "row" | "column";
  className?: string;
}

export type DataSurfaceCellSelectionGridSpec = SelectionGridProps & {
  kind: "selectionGrid";
};

export type DataSurfaceCellSpec =
  | DataSurfaceDisplaySpec
  | DataSurfaceCellInputSpec
  | DataSurfaceCellGroupSpec
  | DataSurfaceCellSelectionGridSpec
  | { kind: "action"; action: DataSurfaceCellActionSpec }
  | {
      kind: "actions";
      actions: DataSurfaceCellActionSpec[];
      align?: "left" | "center" | "right";
      className?: string;
    };

export type DataSurfaceStructuredCellSpec = Omit<StructuredTableCell, "content"> & {
  content: ReactNode | DataSurfaceCellSpec;
};

export interface DataSurfaceColumnSpec<T> extends Omit<DataTableColumn<T>, "render"> {
  /**
   * Return typed cell specs instead of importing Badge/InputControl/CommandButton in business tables.
   * Existing DataTableColumn.render columns remain supported for compatibility.
   */
  cell: (row: T) => ReactNode | DataSurfaceCellSpec;
}

export interface DataSurfaceMetricSpec {
  key: string;
  label: ReactNode;
  value: ReactNode | DataSurfaceDisplaySpec;
  className?: string;
}

export interface DataSurfaceRecordSpec<TDetail = DataSurfaceLooseRow> {
  key: string;
  expanded: boolean;
  onToggle: () => void;
  header: ReactNode | DataSurfaceDisplaySpec;
  summary?: ReactNode | DataSurfaceDisplaySpec;
  detail?: ReactNode | DataSurfaceDisplaySpec;
  detailSurface?: DataSurfaceProps<TDetail>;
  detailTitle?: ReactNode;
  detailAction?: DisclosureRecordAction;
}

export interface DataSurfaceVisualLegendSpec {
  key: string;
  label: string;
  tone?: DataSurfaceVisualTone;
  marker?: "solid" | "reference";
}

export interface DataSurfaceVisualBarSpec {
  key: string;
  label: string;
  value: number;
  valueLabel?: string | number;
  tone?: DataSurfaceVisualTone;
  title?: string;
  minPercent?: number;
}

export interface DataSurfaceVisualBarChartSpec {
  kind: "barChart";
  title?: string;
  bars: DataSurfaceVisualBarSpec[];
  min?: number;
  max?: number;
  height?: number;
  emptyText?: string;
  legend?: DataSurfaceVisualLegendSpec[];
}

export interface DataSurfaceVisualGroupedBarGroupSpec {
  key: string;
  label: string;
  bars: DataSurfaceVisualBarSpec[];
}

export interface DataSurfaceVisualGroupedBarChartSpec {
  kind: "groupedBarChart";
  title?: string;
  groups: DataSurfaceVisualGroupedBarGroupSpec[];
  max?: number;
  height?: number;
  emptyText?: string;
  legend?: DataSurfaceVisualLegendSpec[];
}

export interface DataSurfaceVisualComparisonBarItemSpec {
  key: string;
  label: string;
  actual: number;
  reference?: number;
  valueLabel?: string;
  diffLabel?: string;
  tone?: DataSurfaceVisualTone;
  diffTone?: DataSurfaceVisualTone;
}

export interface DataSurfaceVisualComparisonBarSectionSpec {
  key: string;
  title: string;
  subtitle?: string;
  tone?: DataSurfaceVisualTone;
  items: DataSurfaceVisualComparisonBarItemSpec[];
}

export interface DataSurfaceVisualComparisonBarsSpec {
  kind: "comparisonBars";
  sections: DataSurfaceVisualComparisonBarSectionSpec[];
  max?: number;
  emptyText?: string;
  legend?: DataSurfaceVisualLegendSpec[];
}

export interface DataSurfaceVisualTreeBadgeSpec {
  key: string;
  label: string;
  tone?: DataSurfaceVisualTone;
}

export interface DataSurfaceVisualTreeNodeSpec {
  key: string;
  label: string;
  subtitle?: string;
  level?: number;
  badges?: DataSurfaceVisualTreeBadgeSpec[];
  children?: DataSurfaceVisualTreeNodeSpec[];
}

export interface DataSurfaceVisualTreeSpec {
  kind: "tree";
  nodes: DataSurfaceVisualTreeNodeSpec[];
  emptyText?: string;
  maxHeight?: number;
}

export type DataSurfaceVisualSpec =
  | DataSurfaceVisualBarChartSpec
  | DataSurfaceVisualGroupedBarChartSpec
  | DataSurfaceVisualComparisonBarsSpec
  | DataSurfaceVisualTreeSpec;

interface DataSurfaceBaseProps {
  kind: DataSurfaceKind;
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: DataSurfaceCommandSpec[];
  empty?: ReactNode;
  framed?: boolean;
  wrap?: boolean;
  presentation?: DataTablePresentation;
  className?: string;
  bodyClassName?: string;
}

export interface DataSurfaceTableProps<T> extends DataSurfaceBaseProps, Omit<DataTableProps<T>, "rows" | "columns" | "rowKey" | "presentation"> {
  kind: "table";
  rows: T[];
  columns: Array<DataTableColumn<T> | DataSurfaceColumnSpec<T>>;
  rowKey: DataTableProps<T>["rowKey"];
  scrollClassName?: string;
}

export interface DataSurfaceStructuredProps extends DataSurfaceBaseProps, Omit<StructuredTableProps, "rows" | "presentation"> {
  kind: "structured";
  rows: DataSurfaceStructuredCellSpec[][];
  structuredScroll?: boolean;
}

export interface DataSurfaceRecordsProps<TDetail = DataSurfaceLooseRow> extends DataSurfaceBaseProps {
  kind: "records";
  records: Array<DataSurfaceRecordSpec<TDetail>>;
}

export interface DataSurfaceMetricsProps extends DataSurfaceBaseProps {
  kind: "metrics";
  metrics: DataSurfaceMetricSpec[];
}

export interface DataSurfaceVisualProps extends DataSurfaceBaseProps {
  kind: "visual";
  visual: DataSurfaceVisualSpec;
}

export interface DataSurfaceRawProps extends DataSurfaceBaseProps {
  kind: "raw";
  value: unknown;
  rawClassName?: string;
}

export type DataSurfaceProps<T = DataSurfaceLooseRow> =
  | DataSurfaceTableProps<T>
  | DataSurfaceStructuredProps
  | DataSurfaceRecordsProps<T>
  | DataSurfaceMetricsProps
  | DataSurfaceVisualProps
  | DataSurfaceRawProps;
