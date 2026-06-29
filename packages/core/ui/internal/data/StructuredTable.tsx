import type { CSSProperties, ReactNode } from "react";
import type { DataTablePresentation } from "./DataTable.types";
import { resolveTablePresentation } from "./table-presentation";

export interface StructuredTableCell {
  content: ReactNode;
  header?: boolean;
  colSpan?: number;
  rowSpan?: number;
  className?: string;
  style?: CSSProperties;
}

export interface StructuredTableProps {
  rows: StructuredTableCell[][];
  className?: string;
  colWidths?: Array<string | number>;
  rowHeights?: Array<string | number>;
  cellClassName?: string;
  headerCellClassName?: string;
  bodyClassName?: string;
  presentation?: DataTablePresentation;
}

export default function StructuredTable({
  rows,
  className = "",
  colWidths,
  rowHeights,
  cellClassName = "",
  headerCellClassName = "",
  bodyClassName = "",
  presentation,
}: StructuredTableProps) {
  const tablePresentation = resolveTablePresentation(presentation, presentation?.density);
  let bodyRowIndex = 0;

  return (
    <table className={`${tablePresentation.table} ${className}`}>
      {colWidths?.length ? (
        <colgroup>
          {colWidths.map((width, index) => <col key={`${width}-${index}`} style={{ width }} />)}
        </colgroup>
      ) : null}
      <tbody className={`${tablePresentation.body} ${bodyClassName}`}>
        {rows.map((row, rowIndex) => {
          const headerRow = row.some((cell) => cell.header);
          const resolvedRowIndex = headerRow ? -1 : bodyRowIndex++;
          return (
            <tr
              key={rowIndex}
              className={headerRow ? "" : tablePresentation.getRowClassName(resolvedRowIndex)}
              style={rowHeights?.[rowIndex] ? { height: rowHeights[rowIndex] } : undefined}
            >
              {row.map((cell, cellIndex) => {
                const Tag = cell.header ? "th" : "td";
                return (
                  <Tag
                    key={`${rowIndex}-${cellIndex}`}
                    colSpan={cell.colSpan}
                    rowSpan={cell.rowSpan}
                    className={`${cell.header ? `${tablePresentation.headerCell} ${headerCellClassName}` : `${tablePresentation.cell} ${cellClassName}`} ${cell.className ?? ""}`}
                    style={cell.style}
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
