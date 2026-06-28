import { joinClassNames } from "./card-utils";
import type { DataTablePresentation } from "./DataTable.types";

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
