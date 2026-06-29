import { joinClassNames } from "../common/card-utils";
import type { DataTablePresentation } from "./DataTable.types";
import type {
  DataSurfaceAlign,
  DataSurfaceEmphasis,
  DataSurfaceFont,
  DataSurfaceFrame,
  DataSurfaceRowState,
  DataSurfaceScrollSpec,
  DataSurfaceTone,
  DataSurfaceWidth,
  DataSurfaceWrap,
} from "../../DataSurface.types";

export interface ResolvedTablePresentation {
  density: "normal" | "compact";
  table: string;
  head: string;
  body: string;
  row: string;
  headerCell: string;
  cell: string;
  emptyCell: string;
  expandedRow: string;
  getRowClassName: (rowIndex: number) => string;
}

function resolveAlignClass(align?: DataSurfaceAlign) {
  if (align === "center") return "text-center";
  if (align === "right") return "text-right";
  return "text-left";
}

function resolveWidthClass(width?: DataSurfaceWidth) {
  if (width === undefined) return "";
  if (typeof width === "number") {
    if (width <= 96) return "w-24";
    if (width <= 128) return "w-32";
    if (width <= 160) return "w-40";
    if (width <= 192) return "w-48";
    if (width <= 256) return "w-64";
    return "w-80";
  }
  if (width === "xs") return "w-20";
  if (width === "sm") return "w-28";
  if (width === "md") return "w-40";
  if (width === "lg") return "w-56";
  if (width === "xl") return "w-72";
  if (width === "content") return "w-px";
  if (width === "wide") return "min-w-80";
  return "";
}

function resolveWrapClass(wrap?: DataSurfaceWrap) {
  if (wrap === "wrap") return "whitespace-normal break-words";
  if (wrap === "truncate") return "max-w-0 truncate";
  return "whitespace-nowrap";
}

export function resolveTableToneClass(tone?: DataSurfaceTone) {
  if (tone === "muted") return "text-slate-500";
  if (tone === "success") return "text-emerald-700";
  if (tone === "warning") return "text-amber-700";
  if (tone === "danger") return "text-red-700";
  if (tone === "info") return "text-sky-700";
  return "";
}

function resolveEmphasisClass(emphasis?: DataSurfaceEmphasis) {
  if (emphasis === "strong") return "font-bold";
  if (emphasis === "medium") return "font-medium";
  return "";
}

function resolveFontClass(font?: DataSurfaceFont) {
  if (font === "mono") return "font-mono tabular-nums";
  return "";
}

export function resolveTableColumnClass(column: {
  align?: DataSurfaceAlign;
  width?: DataSurfaceWidth;
  wrap?: DataSurfaceWrap;
  tone?: DataSurfaceTone;
  emphasis?: DataSurfaceEmphasis;
  font?: DataSurfaceFont;
  numeric?: boolean;
}) {
  return joinClassNames(
    resolveAlignClass(column.numeric ? column.align ?? "right" : column.align),
    resolveWidthClass(column.width),
    resolveWrapClass(column.wrap),
    resolveTableToneClass(column.tone),
    resolveEmphasisClass(column.emphasis),
    resolveFontClass(column.numeric ? column.font ?? "mono" : column.font),
  );
}

export function resolveTableRowStateClass(state: DataSurfaceRowState = "normal") {
  if (state === "selected") return "bg-emerald-50 text-emerald-950 ring-1 ring-inset ring-emerald-200";
  if (state === "section") return "bg-slate-100 text-slate-900 font-semibold";
  if (state === "total") return "bg-slate-50 text-slate-950 font-semibold";
  if (state === "muted") return "bg-slate-50/70 text-slate-500";
  if (state === "warning") return "bg-amber-50 text-amber-900";
  if (state === "danger") return "bg-red-50 text-red-900";
  if (state === "info") return "bg-sky-50 text-sky-900";
  return "";
}

export function resolveSurfaceFrameClass(frame: DataSurfaceFrame = "plain", scroll?: DataSurfaceScrollSpec) {
  const maxHeight = scroll?.maxHeight === "sm"
    ? "max-h-64"
    : scroll?.maxHeight === "md"
      ? "max-h-96"
      : scroll?.maxHeight === "lg"
        ? "max-h-[36rem]"
        : "";
  return joinClassNames(
    scroll?.x === false ? "overflow-x-hidden" : "overflow-x-auto",
    scroll?.y === "hidden" ? "overflow-y-hidden" : scroll?.maxHeight ? "overflow-y-auto" : "",
    maxHeight,
    frame === "clipped" ? "overflow-hidden rounded-md" : "",
    frame === "bordered" ? "overflow-hidden rounded-md border border-slate-200 bg-white" : "",
  );
}

export function resolveStructuredCellClass(cell: {
  header?: boolean;
  cellRole?: string;
  align?: DataSurfaceAlign;
  width?: DataSurfaceWidth;
  tone?: DataSurfaceTone;
  emphasis?: DataSurfaceEmphasis;
}) {
  const role = cell.cellRole ?? (cell.header ? "header" : "value");
  return joinClassNames(
    resolveAlignClass(cell.align),
    resolveWidthClass(cell.width),
    resolveTableToneClass(cell.tone),
    resolveEmphasisClass(cell.emphasis ?? (role === "header" || role === "label" || role === "title" ? "medium" : undefined)),
    role === "empty" ? "text-slate-400" : "",
    role === "title" ? "text-base text-slate-950" : "",
    role === "signature" ? "h-16 align-bottom" : "",
  );
}

export function resolveTablePresentation(
  presentation?: DataTablePresentation,
  fallbackDensity: DataTablePresentation["density"] = "normal",
  options: { rowHover?: DataTablePresentation["rowHover"] } = {},
): ResolvedTablePresentation {
  const density = presentation?.density ?? fallbackDensity ?? "normal";
  const grid = presentation?.grid ?? "rows";
  const header = presentation?.header ?? "tinted";
  const rowHover = presentation?.rowHover ?? options.rowHover ?? "neutral";
  const stripe = presentation?.stripe ?? "none";
  const cellWrap = presentation?.cellWrap ?? "nowrap";

  const headerPadding = density === "compact" ? "px-4 py-2.5" : "px-4 py-3";
  const cellPadding = density === "compact" ? "px-4 py-2.5" : "px-4 py-3";
  const wrapClassName = cellWrap === "wrap" ? "whitespace-normal break-words" : "whitespace-nowrap";
  const cellGridClassName = grid === "cells" ? "border-b border-r border-slate-200 last:border-r-0" : "";
  const headGridClassName = grid === "rows" ? "border-b border-slate-200" : "";
  const bodyGridClassName = grid === "rows" ? "divide-y divide-slate-100" : "";
  const headerClassName = header === "strong"
    ? "bg-slate-100 text-slate-800"
    : header === "plain"
      ? "text-slate-500"
      : "bg-slate-50 text-slate-500";
  const hoverClassName = rowHover === "interactive"
    ? "cursor-pointer transition hover:bg-emerald-50/60"
    : rowHover === "neutral"
      ? "transition hover:bg-slate-50/60"
      : "";

  return {
    density,
    table: joinClassNames("min-w-full text-left text-sm", grid === "cells" ? "border-collapse" : ""),
    head: joinClassNames(headGridClassName, headerClassName),
    body: joinClassNames(bodyGridClassName, "text-slate-800"),
    row: hoverClassName,
    headerCell: joinClassNames(wrapClassName, headerPadding, "font-medium", cellGridClassName),
    cell: joinClassNames(wrapClassName, cellPadding, cellGridClassName),
    emptyCell: "px-4 py-12 text-center text-slate-400",
    expandedRow: "bg-slate-50",
    getRowClassName: (rowIndex) => joinClassNames(stripe === "subtle" && rowIndex % 2 === 1 ? "bg-slate-50/50" : "", hoverClassName),
  };
}
