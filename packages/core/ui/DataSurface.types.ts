import type { FocusEventHandler, KeyboardEventHandler, MouseEventHandler, ReactNode } from "react";
import type { InputFieldSpec } from "./InputControl";
import type { SurfaceDataRowActionSpec, SurfaceDataRowEditActionSpec } from "./SurfaceContractTypes";

export type DataSurfaceKind = "table" | "structured" | "records" | "metrics";
export type DataSurfaceLooseRow = ReturnType<typeof JSON.parse>;
export type DataSurfaceActionSize = "sm" | "md" | "lg";
export type DataSurfaceBadgeTone = "gray" | "green" | "blue" | "red" | "yellow" | "orange" | "emerald" | "sky" | "slate" | "amber";
export type DataSurfaceAlign = "left" | "center" | "right";
export type DataSurfaceWidth = "xs" | "sm" | "md" | "lg" | "xl" | "content" | "wide" | number;
export type DataSurfaceWrap = "nowrap" | "wrap" | "truncate";
export type DataSurfaceTone = "default" | "muted" | "success" | "warning" | "danger" | "info";
export type DataSurfaceEmphasis = "normal" | "medium" | "strong";
export type DataSurfaceFont = "default" | "mono";
export type DataSurfaceFrame = "plain" | "clipped" | "bordered";
export type DataSurfaceRowState = "normal" | "selected" | "section" | "total" | "muted" | "warning" | "danger" | "info";
export type DataSurfaceStructuredCellRole = "header" | "label" | "value" | "empty" | "title" | "signature";
export type DataSurfaceRowHeight = "sm" | "md" | "lg" | number;

export interface DataSurfaceScrollSpec {
  x?: boolean;
  y?: "auto" | "hidden";
  maxHeight?: "sm" | "md" | "lg";
}

export interface DataSurfaceCommandSpec {
  key: string;
  label: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "danger";
  type?: "button" | "submit";
  size?: DataSurfaceActionSize;
  truncate?: boolean;
}

export interface DataSurfaceBadgeSpec {
  label?: ReactNode;
  tone?: DataSurfaceBadgeTone;
  level?: number;
}

export interface DataSurfaceNumberSpec {
  value: number | null | undefined;
  locale?: string;
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
  empty?: string;
}

export interface DataSurfaceAmountSpec {
  value: number | null | undefined;
  currencySymbol?: string;
  showZero?: boolean;
  locale?: string;
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
}

export type DataSurfaceDisplaySpec =
  | { kind: "text"; value: ReactNode; tone?: DataSurfaceTone; emphasis?: DataSurfaceEmphasis; font?: DataSurfaceFont }
  | { kind: "empty"; content?: ReactNode }
  | { kind: "stack"; items: Array<ReactNode | DataSurfaceDisplaySpec>; gap?: "none" | "xs" | "sm" }
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
      align?: DataSurfaceAlign;
    };

export interface DataSurfaceStructuredCellSpec {
  content: ReactNode | DataSurfaceCellSpec;
  header?: boolean;
  cellRole?: DataSurfaceStructuredCellRole;
  align?: DataSurfaceAlign;
  width?: DataSurfaceWidth;
  rowHeight?: DataSurfaceRowHeight;
  colSpan?: number;
  rowSpan?: number;
  tone?: DataSurfaceTone;
  emphasis?: DataSurfaceEmphasis;
}

export interface DataSurfaceColumnSpec<T> {
  key: string;
  label: ReactNode;
  defaultVisible?: boolean;
  required?: boolean;
  align?: DataSurfaceAlign;
  width?: DataSurfaceWidth;
  wrap?: DataSurfaceWrap;
  tone?: DataSurfaceTone;
  emphasis?: DataSurfaceEmphasis;
  font?: DataSurfaceFont;
  numeric?: boolean;
  onHeaderClick?: () => void;
  cell: (row: T) => ReactNode | DataSurfaceCellSpec;
}

export interface DataSurfaceMetricSpec {
  key: string;
  label: ReactNode;
  value: ReactNode | DataSurfaceDisplaySpec;
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
  align?: DataSurfaceAlign;
}

export interface DataSurfaceTableProps<T> extends DataSurfaceBaseProps {
  kind: "table";
  rows: T[];
  columns: Array<DataSurfaceColumnSpec<T>>;
  rowKey: (row: T, index: number) => string | number;
  visibleColumns?: string[];
  loading?: boolean;
  emptyText?: string;
  onRowClick?: (row: T) => void;
  rowState?: (row: T) => DataSurfaceRowState;
  frame?: DataSurfaceFrame;
  scroll?: DataSurfaceScrollSpec;
  expandedRowKey?: string | number | null;
  expandedRowKeys?: Array<string | number> | Set<string | number> | null;
  expandedRowContent?: (row: T) => ReactNode;
  rowActions?: (row: T) => DataSurfaceRowActionSpec[];
  rowEditActions?: (row: T) => DataSurfaceRowEditActionSpec<T>;
  actionsColumn?: DataSurfaceActionsColumnSpec;
}

export interface DataSurfaceStructuredProps extends DataSurfaceBaseProps {
  kind: "structured";
  rows: DataSurfaceStructuredCellSpec[][];
  structuredScroll?: boolean;
  colWidths?: Array<string | number>;
  rowHeights?: Array<string | number>;
  frame?: DataSurfaceFrame;
  scroll?: DataSurfaceScrollSpec;
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
