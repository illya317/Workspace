import type { FocusEventHandler, KeyboardEventHandler, MouseEventHandler, ReactNode, Ref } from "react";
import type { InputFieldSpec } from "./InputSurface";
import type { FormSurfaceProps } from "./FormSurface.types";
import type { CreateSurfaceSurfaceProps } from "./CreateSurface.types";
import type { ActionGlyphKind } from "./internal/action/ActionGlyphs";
import type { SurfaceDataRowActionSpec, SurfaceDataRowEditActionSpec } from "./SurfaceContractTypes";

export type DataSurfaceKind = "table" | "structured" | "summary" | "record";
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
export type DataSurfaceMobilePresentation = "list" | "landscape" | "unavailable";

export interface DataSurfaceMobileSpec {
  presentation?: DataSurfaceMobilePresentation;
  title?: string;
  reason?: string;
}

export interface DataSurfaceScrollSpec {
  x?: boolean;
  y?: "auto" | "hidden";
  maxHeight?: "sm" | "md" | "lg";
}

export interface DataSurfaceCommandSpec {
  key: string;
  label: ReactNode;
  title?: string;
  icon?: ActionGlyphKind;
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
  | { kind: "text"; value: ReactNode; title?: string; tone?: DataSurfaceTone; emphasis?: DataSurfaceEmphasis; font?: DataSurfaceFont; wrap?: DataSurfaceWrap }
  | { kind: "empty"; content?: ReactNode }
  | { kind: "stack"; items: Array<ReactNode | DataSurfaceDisplaySpec>; gap?: "none" | "xs" | "sm" }
  | { kind: "disclosure"; label: ReactNode; expanded: boolean; level?: number; emphasis?: DataSurfaceEmphasis }
  | { kind: "link"; label: ReactNode; href: string; external?: boolean; tone?: DataSurfaceTone; font?: DataSurfaceFont }
  | ({ kind: "badge" } & DataSurfaceBadgeSpec)
  | ({ kind: "number" } & DataSurfaceNumberSpec)
  | ({ kind: "amount" } & DataSurfaceAmountSpec);

export interface DataSurfaceCellInputSpec {
  kind: "input";
  spec: InputFieldSpec;
  value?: unknown;
  displayValue?: string;
  onChange?: (value: unknown, option?: unknown) => void;
  size?: "sm" | "md" | "lg";
  density?: "normal" | "compact";
  disabled?: boolean;
  readOnly?: boolean;
  invalid?: boolean;
  placeholder?: string;
  emptyText?: string;
  rows?: number;
  resize?: "none" | "vertical" | "both";
  fillRow?: boolean;
  autoGrow?: boolean;
  verticalAlign?: "top" | "center";
  textAlign?: "left" | "center" | "right";
  type?: "text" | "password" | "email" | "tel" | "url" | "number";
  inputMode?: "none" | "text" | "tel" | "url" | "email" | "numeric" | "decimal" | "search";
  minLength?: number;
  maxLength?: number;
  step?: number | string;
  ariaLabel?: string;
  autoFocus?: boolean;
  onBlur?: FocusEventHandler<HTMLInputElement | HTMLTextAreaElement>;
  inputRef?: Ref<HTMLInputElement>;
  onKeyDown?: KeyboardEventHandler<HTMLInputElement | HTMLTextAreaElement>;
  stopPropagation?: boolean;
  autocompletePresentation?: "popover" | "inline";
}

export interface DataSurfaceCellActionSpec extends DataSurfaceCommandSpec {
  stopPropagation?: boolean;
  presentation?: "button" | "glyph";
  tone?: DataSurfaceBadgeTone;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

export type DataSurfaceRowActionSpec = SurfaceDataRowActionSpec;
export type DataSurfaceRowEditActionSpec<T> = SurfaceDataRowEditActionSpec<T>;

export interface DataSurfaceCellGroupSpec {
  kind: "group";
  items: DataSurfaceCellSpec[];
  direction?: "row" | "column";
}

export type DataSurfaceCellEmbeddedSpec =
  | { kind: "data"; data: DataSurfaceProps }
  | { kind: "form"; form: FormSurfaceProps }
  | { kind: "create-trigger"; create: CreateSurfaceSurfaceProps }
  | { kind: "create-anchor"; anchor: string };

export interface DataSurfaceCellInteractiveSpec {
  kind: "interactive";
  content: DataSurfaceCellSpec;
  onClick: () => void;
  ariaLabel: string;
}

export interface DataSurfaceCellSelectionGridOptionSpec {
  value: string;
  label: string;
  code?: string;
  icon?: ActionGlyphKind;
  tone?: DataSurfaceBadgeTone;
  title?: string;
}

export interface DataSurfaceCellSelectionGridSpec {
  kind: "selectionGrid";
  options: DataSurfaceCellSelectionGridOptionSpec[];
  value?: string | null;
  onChange?: (value: string) => void;
  mode?: "select" | "readOnly" | "action";
  presentation?: "card" | "chip";
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
  | DataSurfaceCellEmbeddedSpec
  | DataSurfaceCellInteractiveSpec
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

export interface DataSurfaceStructuredRowInteractionSpec {
  onClick: () => void;
  ariaLabel: string;
}

export interface DataSurfaceSummaryMetricSpec {
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

export interface DataSurfaceRecordSpec {
  key: string;
  expanded: boolean;
  onToggle: () => void;
  header: ReactNode | DataSurfaceDisplaySpec;
  summary?: ReactNode | DataSurfaceDisplaySpec;
  detail?: ReactNode | DataSurfaceDisplaySpec;
  detailTitle?: ReactNode;
  detailAction?: DataSurfaceRecordActionSpec;
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

interface DataSurfaceBaseProps {
  kind: DataSurfaceKind;
  actions?: DataSurfaceCommandSpec[];
  empty?: ReactNode;
  wrap?: boolean;
  presentation?: DataSurfacePresentationSpec;
  /** 紧凑移动设备的呈现策略；矩阵默认 landscape，普通表格默认 list。 */
  mobile?: DataSurfaceMobileSpec;
}

export interface DataSurfacePresentationSpec {
  density?: "normal" | "compact";
  grid?: "rows" | "cells" | "none";
  header?: "tinted" | "plain" | "strong";
  rowHover?: "none" | "neutral" | "interactive";
  stripe?: "none" | "subtle";
  cellWrap?: "nowrap" | "wrap";
  controlHeight?: "auto" | "fillRow";
}

export type DataSurfaceStructuredDimension = string | number;

export interface DataSurfaceStructuredMatrixFormatSpec {
  kind: "matrix";
  rowHeaderWidth?: DataSurfaceStructuredDimension;
  columnWidths?: Array<DataSurfaceStructuredDimension | null>;
  headerRowHeight?: DataSurfaceStructuredDimension;
  bodyRowHeight?: DataSurfaceStructuredDimension;
}

export type DataSurfaceStructuredFormatSpec = DataSurfaceStructuredMatrixFormatSpec;

export interface DataSurfaceTableMatrixFormatSpec {
  kind: "matrix";
  rowHeaderWidth?: DataSurfaceStructuredDimension;
  columnWidths?: Array<DataSurfaceStructuredDimension | null>;
}

export type DataSurfaceTableFormatSpec = DataSurfaceTableMatrixFormatSpec;

export interface DataSurfaceActionsColumnSpec {
  key?: string;
  label?: ReactNode;
  align?: DataSurfaceAlign;
}

export interface DataSurfaceTableProps<T> extends DataSurfaceBaseProps {
  kind: "table";
  rows: T[];
  columns: Array<DataSurfaceColumnSpec<T>>;
  format?: DataSurfaceTableFormatSpec;
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
  expandedRow?: (row: T) => DataSurfaceCellSpec | null;
  rowActions?: (row: T) => DataSurfaceRowActionSpec[];
  rowEditActions?: (row: T) => DataSurfaceRowEditActionSpec<T>;
  actionsColumn?: DataSurfaceActionsColumnSpec;
}

export interface DataSurfaceStructuredProps extends DataSurfaceBaseProps {
  kind: "structured";
  rows: DataSurfaceStructuredCellSpec[][];
  rowInteractions?: Array<DataSurfaceStructuredRowInteractionSpec | null>;
  format?: DataSurfaceStructuredFormatSpec;
  structuredScroll?: boolean;
  colWidths?: Array<DataSurfaceStructuredDimension | null>;
  rowHeights?: Array<DataSurfaceStructuredDimension>;
  frame?: DataSurfaceFrame;
  scroll?: DataSurfaceScrollSpec;
}

export interface DataSurfaceSummaryProps extends DataSurfaceBaseProps {
  kind: "summary";
  metrics: DataSurfaceSummaryMetricSpec[];
}

export interface DataSurfaceRecordProps extends DataSurfaceBaseProps {
  kind: "record";
  records: DataSurfaceRecordSpec[];
}

export type DataSurfaceProps<T = DataSurfaceLooseRow> =
  | DataSurfaceTableProps<T>
  | DataSurfaceStructuredProps
  | DataSurfaceSummaryProps
  | DataSurfaceRecordProps;
