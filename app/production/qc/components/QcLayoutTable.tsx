"use client";

import type { CSSProperties } from "react";
import type { QcLayoutBlock } from "@workspace/production/server/qc";
import { CellContent } from "./qc-layout-table/cell-content";
import { Part } from "./qc-layout-table/parts";
import type { LayoutRenderContext } from "./qc-layout-table/types";

const TABLE_BODY_TEXT_CLASS = "text-[15px] leading-8 text-slate-950 tabular-nums";

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
  return (
    <table className={`${marginClass} w-full table-fixed border-collapse ${TABLE_BODY_TEXT_CLASS} ${className}`}>
      {block.columnWidths?.length ? (
        <colgroup>
          {block.columnWidths.map((width, index) => <col key={`${width}-${index}`} style={{ width }} />)}
        </colgroup>
      ) : null}
      <tbody>
        {block.rows.map((row, rowIndex) => (
          <tr key={rowIndex} style={block.rowHeights?.[rowIndex] ? { height: block.rowHeights[rowIndex] } : undefined}>
            {row.map((cell, cellIndex) => {
              const Tag = cell.header ? "th" : "td";
              const isTableTitleCell = cell.bold && !cell.header && row.length === 1;
              const textAlign = (cell.align || (isTableTitleCell ? "left" : "center")) as CSSProperties["textAlign"];
              return (
                <Tag
                  key={`${rowIndex}-${cellIndex}`}
                  colSpan={cell.colspan}
                  rowSpan={cell.rowspan}
                  className={`border border-slate-950 px-2 py-1.5 align-middle ${cell.bold || cell.header ? "font-semibold" : "font-normal"} ${cell.isEmpty ? "text-transparent" : ""} ${cell.className || ""}`}
                  style={{ textAlign, width: cell.width }}
                >
                  <CellContent cell={cell} context={context} />
                </Tag>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
