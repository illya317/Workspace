import type { ReactNode } from "react";
import type { DataTablePresentation } from "./DataTable.types";
import {
  resolveStructuredCellClass,
  resolveTablePresentation,
} from "./table-presentation";
import type {
  DataSurfaceAlign,
  DataSurfaceEmphasis,
  DataSurfaceRowHeight,
  DataSurfaceStructuredCellRole,
  DataSurfaceTone,
  DataSurfaceWidth,
} from "../../DataSurface.types";

export interface StructuredTableCell {
  content: ReactNode;
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

export interface StructuredTableProps {
  rows: StructuredTableCell[][];
  colWidths?: Array<string | number>;
  rowHeights?: Array<string | number>;
  presentation?: DataTablePresentation;
}

export default function StructuredTable({
  rows,
  colWidths,
  rowHeights,
  presentation,
}: StructuredTableProps) {
  const tablePresentation = resolveTablePresentation(presentation, presentation?.density);
  let bodyRowIndex = 0;

  return (
    <table className={tablePresentation.table}>
      {colWidths?.length ? (
        <colgroup>
          {colWidths.map((width, index) => <col key={`${width}-${index}`} style={{ width }} />)}
        </colgroup>
      ) : null}
      <tbody className={tablePresentation.body}>
        {rows.map((row, rowIndex) => {
          const headerRow = row.some((cell) => cell.header);
          const resolvedRowIndex = headerRow ? -1 : bodyRowIndex++;
          const explicitRowHeight = row.find((cell) => cell.rowHeight)?.rowHeight ?? rowHeights?.[rowIndex];
          return (
            <tr
              key={rowIndex}
              className={headerRow ? "" : tablePresentation.getRowClassName(resolvedRowIndex)}
              style={explicitRowHeight ? { height: explicitRowHeight } : undefined}
            >
              {row.map((cell, cellIndex) => {
                const Tag = cell.header ? "th" : "td";
                const cellStyle = typeof cell.width === "number" ? { width: cell.width } : undefined;
                return (
                  <Tag
                    key={`${rowIndex}-${cellIndex}`}
                    colSpan={cell.colSpan}
                    rowSpan={cell.rowSpan}
                    className={`${cell.header ? tablePresentation.headerCell : tablePresentation.cell} ${resolveStructuredCellClass(cell)}`}
                    style={cellStyle}
                  >
                    {cell.content}
                  </Tag>
                );
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
