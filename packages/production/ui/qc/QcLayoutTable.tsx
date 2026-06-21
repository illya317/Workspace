"use client";

import type { CSSProperties } from "react";
import { dataTableClassNames, StructuredTable, type StructuredTableCell } from "@workspace/core/ui";
import type { QcLayoutBlock } from "@workspace/production/server/qc";
import { CellContent } from "./qc-layout-table/cell-content";
import { Part } from "./qc-layout-table/parts";
import type { LayoutRenderContext } from "./qc-layout-table/types";

const TABLE_BODY_TEXT_CLASS = "text-[15px] leading-8 text-slate-950 tabular-nums";
const SIGNATURE_COL_WIDTHS = ["12%", "10%", "8%", "20%", "12%", "10%", "8%", "20%"];

export { Part };
export type { LayoutRenderContext };

export function TableBlock({
  block,
  className = "",
  context,
}: {
  block: QcLayoutBlock;
  className?: string;
  context: LayoutRenderContext;
}) {
  if (!block.rows?.length) return null;
  const marginClass = block.compactTable ? "mb-0" : "mb-4";
  const rows: StructuredTableCell[][] = block.rows.map((row) => row.map((cell) => {
    const isTableTitleCell = cell.bold && !cell.header && row.length === 1;
    const isSignatureRow = row.some((item) => item.rawText === "检验者") && row.some((item) => item.rawText === "复核者");
    const cellIndex = row.indexOf(cell);
    const textAlign = (cell.align || (isTableTitleCell ? "left" : "center")) as CSSProperties["textAlign"];
    return {
      content: <CellContent cell={cell} context={context} />,
      header: cell.header,
      colSpan: cell.colspan,
      rowSpan: cell.rowspan,
      className: `border border-slate-950 align-middle ${isSignatureRow ? "px-1 py-1 leading-7" : "px-2 py-1.5"} ${cell.bold || cell.header ? "font-semibold" : "font-normal"} ${cell.isEmpty ? "text-transparent" : ""} ${cell.className || ""}`,
      style: { textAlign, width: cell.width || (isSignatureRow ? SIGNATURE_COL_WIDTHS[cellIndex] : undefined) },
    };
  }));

  return (
    <StructuredTable
      rows={rows}
      colWidths={block.columnWidths}
      rowHeights={block.rowHeights}
      className={`${dataTableClassNames.table} ${marginClass} w-full table-fixed border-collapse ${TABLE_BODY_TEXT_CLASS} ${className}`}
    />
  );
}
