import type { ReactNode } from "react";
import type { AmountCellProps } from "./AmountCell";
import type { BadgeProps } from "./Badge";
import type { DataTableColumn, DataTableProps } from "./DataTable.types";
import type { DisclosureRecordAction } from "./DisclosureRecordCard";
import type { NumberCellProps } from "./NumberCell";
import type { PaginationProps } from "./Pagination";
import type { SelectionGridProps } from "./SelectionGrid";
import type { StructuredTableCell, StructuredTableProps } from "./StructuredTable";
import type { CommandButtonProps } from "./CommandButton";
import type { InputControlProps } from "./InputControl";
import type { ToolbarProps } from "./Toolbar";

export type DataSurfaceKind = "table" | "structured" | "records" | "metrics" | "raw";
export type DataSurfaceLooseRow = ReturnType<typeof JSON.parse>;

export type DataSurfaceToolbarSpec = Omit<ToolbarProps, "items"> & {
  items: ToolbarProps["items"];
};

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

export interface DataSurfaceRecordSpec {
  key: string;
  expanded: boolean;
  onToggle: () => void;
  header: ReactNode | DataSurfaceDisplaySpec;
  summary?: ReactNode | DataSurfaceDisplaySpec;
  detail?: ReactNode | DataSurfaceDisplaySpec;
  detailTitle?: ReactNode;
  detailAction?: DisclosureRecordAction;
}

interface DataSurfaceBaseProps {
  kind: DataSurfaceKind;
  title?: ReactNode;
  subtitle?: ReactNode;
  toolbar?: DataSurfaceToolbarSpec;
  actions?: DataSurfaceCommandSpec[];
  empty?: ReactNode;
  framed?: boolean;
  wrap?: boolean;
  className?: string;
  bodyClassName?: string;
}

export interface DataSurfaceTableProps<T> extends DataSurfaceBaseProps, Omit<DataTableProps<T>, "rows" | "columns" | "rowKey"> {
  kind: "table";
  rows: T[];
  columns: Array<DataTableColumn<T> | DataSurfaceColumnSpec<T>>;
  rowKey: DataTableProps<T>["rowKey"];
  pagination?: PaginationProps;
  scrollClassName?: string;
}

export interface DataSurfaceStructuredProps extends DataSurfaceBaseProps, Omit<StructuredTableProps, "rows"> {
  kind: "structured";
  rows: DataSurfaceStructuredCellSpec[][];
  structuredScroll?: boolean;
}

export interface DataSurfaceRecordsProps extends DataSurfaceBaseProps {
  kind: "records";
  records: DataSurfaceRecordSpec[];
}

export interface DataSurfaceMetricsProps extends DataSurfaceBaseProps {
  kind: "metrics";
  metrics: DataSurfaceMetricSpec[];
}

export interface DataSurfaceRawProps extends DataSurfaceBaseProps {
  kind: "raw";
  value: unknown;
  rawClassName?: string;
}

export type DataSurfaceProps<T = DataSurfaceLooseRow> =
  | DataSurfaceTableProps<T>
  | DataSurfaceStructuredProps
  | DataSurfaceRecordsProps
  | DataSurfaceMetricsProps
  | DataSurfaceRawProps;
