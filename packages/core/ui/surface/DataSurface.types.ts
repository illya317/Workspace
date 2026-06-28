import type { CSSProperties, FocusEventHandler, KeyboardEventHandler, MouseEventHandler, ReactNode } from "react";
import type { InputFieldSpec } from "../InputControl";
import type { PageSurfaceBlockSpec } from "./PageSurface.types";
import type { SurfaceDataRowActionSpec, SurfaceDataRowEditActionSpec } from "./SurfaceContractTypes";

export type DataSurfaceKind = "table" | "structured" | "records" | "metrics";
export type DataSurfaceLooseRow = ReturnType<typeof JSON.parse>;
export type DataSurfaceActionSize = "sm" | "md" | "lg";
export type DataSurfaceBadgeTone = "gray" | "green" | "blue" | "red" | "yellow" | "orange" | "emerald" | "sky" | "slate" | "amber";

export interface DataSurfaceCommandSpec {
  key: string;
  label: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "danger";
  type?: "button" | "submit";
  size?: DataSurfaceActionSize;
  className?: string;
  truncate?: boolean;
}

export interface DataSurfaceBadgeSpec {
  label?: ReactNode;
  tone?: DataSurfaceBadgeTone;
  level?: number;
  className?: string;
}

export interface DataSurfaceNumberSpec {
  value: number | null | undefined;
  locale?: string;
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
  empty?: string;
  className?: string;
}

export interface DataSurfaceAmountSpec {
  value: number | null | undefined;
  currencySymbol?: string;
  showZero?: boolean;
  negativeClassName?: string;
  locale?: string;
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
  className?: string;
}

export type DataSurfaceDisplaySpec =
  | { kind: "text"; value: ReactNode; className?: string }
  | { kind: "empty"; content?: ReactNode; className?: string }
  | { kind: "stack"; items: Array<ReactNode | DataSurfaceDisplaySpec>; gap?: "none" | "xs" | "sm"; className?: string }
  | ({ kind: "badge" } & DataSurfaceBadgeSpec)
  | ({ kind: "number" } & DataSurfaceNumberSpec)
  | ({ kind: "amount" } & DataSurfaceAmountSpec);

export interface DataSurfaceCellInputSpec {
  kind: "input";
  spec: InputFieldSpec;
  value?: unknown;
  onChange?: (value: unknown) => void;
  size?: "sm" | "md" | "lg";
  density?: "normal" | "compact";
  disabled?: boolean;
  readOnly?: boolean;
  invalid?: boolean;
  className?: string;
  placeholder?: string;
  emptyText?: string;
  ariaLabel?: string;
  autoFocus?: boolean;
  onBlur?: FocusEventHandler<HTMLInputElement | HTMLTextAreaElement>;
  onKeyDown?: KeyboardEventHandler<HTMLInputElement | HTMLTextAreaElement>;
  stopPropagation?: boolean;
}

export interface DataSurfaceCellActionSpec extends DataSurfaceCommandSpec {
  stopPropagation?: boolean;
}

export type DataSurfaceRowActionSpec = SurfaceDataRowActionSpec;
export type DataSurfaceRowEditActionSpec<T> = SurfaceDataRowEditActionSpec<T>;

export interface DataSurfaceCellGroupSpec {
  kind: "group";
  items: DataSurfaceCellSpec[];
  direction?: "row" | "column";
  className?: string;
}

export interface DataSurfaceCellSelectionGridOptionSpec {
  value: string;
  label: string;
  code?: string;
}

export interface DataSurfaceCellSelectionGridSpec {
  kind: "selectionGrid";
  options: DataSurfaceCellSelectionGridOptionSpec[];
  value?: string | null;
  onChange?: (value: string) => void;
  mode?: "select" | "readOnly" | "action";
  onItemClick?: (option: DataSurfaceCellSelectionGridOptionSpec) => void;
  columns?: 1 | 2 | 3 | 4;
  layout?: "fixed" | "auto";
  minItemWidth?: "sm" | "md" | "lg" | number;
  truncate?: boolean;
  disabled?: boolean;
  emptyText?: ReactNode;
  ariaLabel: string;
  className?: string;
}

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

export interface DataSurfaceStructuredCellSpec {
  content: ReactNode | DataSurfaceCellSpec;
  header?: boolean;
  colSpan?: number;
  rowSpan?: number;
  className?: string;
  style?: CSSProperties;
}

export interface DataSurfaceColumnSpec<T> {
  key: string;
  label: ReactNode;
  defaultVisible?: boolean;
  required?: boolean;
  className?: string;
  headerClassName?: string;
  cellClassName?: string;
  onHeaderClick?: () => void;
  cell: (row: T) => ReactNode | DataSurfaceCellSpec;
}

export interface DataSurfaceMetricSpec {
  key: string;
  label: ReactNode;
  value: ReactNode | DataSurfaceDisplaySpec;
  className?: string;
}

export interface DataSurfaceRecordActionSpec {
  label: string;
  loadingLabel?: string;
  loading?: boolean;
  onClick: MouseEventHandler<HTMLButtonElement>;
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
  detailAction?: DataSurfaceRecordActionSpec;
}

interface DataSurfaceBaseProps {
  kind: DataSurfaceKind;
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: DataSurfaceCommandSpec[];
  empty?: ReactNode;
  framed?: boolean;
  wrap?: boolean;
  presentation?: DataSurfacePresentationSpec;
  className?: string;
  bodyClassName?: string;
}

export interface DataSurfacePresentationSpec {
  density?: "normal" | "compact";
  grid?: "rows" | "cells" | "none";
  header?: "tinted" | "plain" | "strong";
  rowHover?: "none" | "neutral" | "interactive";
  stripe?: "none" | "subtle";
  cellWrap?: "nowrap" | "wrap";
}

export interface DataSurfaceActionsColumnSpec {
  key?: string;
  label?: ReactNode;
  headerClassName?: string;
  cellClassName?: string;
  centered?: boolean;
}

export interface DataSurfaceTableProps<T> extends DataSurfaceBaseProps {
  kind: "table";
  rows: T[];
  columns: Array<DataSurfaceColumnSpec<T>>;
  rowKey: (row: T, index: number) => string | number;
  visibleColumns?: string[];
  density?: "normal" | "compact";
  loading?: boolean;
  emptyText?: string;
  onRowClick?: (row: T) => void;
  rowClassName?: (row: T) => string;
  tableClassName?: string;
  expandedRowKey?: string | number | null;
  expandedRowKeys?: Array<string | number> | Set<string | number> | null;
  expandedRowBlocks?: (row: T) => PageSurfaceBlockSpec[];
  rowActions?: (row: T) => DataSurfaceRowActionSpec[];
  rowEditActions?: (row: T) => DataSurfaceRowEditActionSpec<T>;
  actionsColumn?: DataSurfaceActionsColumnSpec;
  scrollClassName?: string;
}

export interface DataSurfaceStructuredProps extends DataSurfaceBaseProps {
  kind: "structured";
  rows: DataSurfaceStructuredCellSpec[][];
  structuredScroll?: boolean;
  colWidths?: Array<string | number>;
  rowHeights?: Array<string | number>;
  cellClassName?: string;
  headerCellClassName?: string;
}

export interface DataSurfaceRecordsProps<TDetail = DataSurfaceLooseRow> extends DataSurfaceBaseProps {
  kind: "records";
  records: Array<DataSurfaceRecordSpec<TDetail>>;
}

export interface DataSurfaceMetricsProps extends DataSurfaceBaseProps {
  kind: "metrics";
  metrics: DataSurfaceMetricSpec[];
}

export type DataSurfaceProps<T = DataSurfaceLooseRow> =
  | DataSurfaceTableProps<T>
  | DataSurfaceStructuredProps
  | DataSurfaceRecordsProps<T>
  | DataSurfaceMetricsProps;
