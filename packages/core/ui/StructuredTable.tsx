import type { CSSProperties, ReactNode } from "react";

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
}

export default function StructuredTable({
  rows,
  className = "",
  colWidths,
  rowHeights,
  cellClassName = "",
  headerCellClassName = "",
  bodyClassName = "",
}: StructuredTableProps) {
  return (
    <table className={className}>
      {colWidths?.length ? (
        <colgroup>
          {colWidths.map((width, index) => <col key={`${width}-${index}`} style={{ width }} />)}
        </colgroup>
      ) : null}
      <tbody className={bodyClassName}>
        {rows.map((row, rowIndex) => (
          <tr key={rowIndex} style={rowHeights?.[rowIndex] ? { height: rowHeights[rowIndex] } : undefined}>
            {row.map((cell, cellIndex) => {
              const Tag = cell.header ? "th" : "td";
              return (
                <Tag
                  key={`${rowIndex}-${cellIndex}`}
                  colSpan={cell.colSpan}
                  rowSpan={cell.rowSpan}
                  className={`${cell.header ? headerCellClassName : cellClassName} ${cell.className ?? ""}`}
                  style={cell.style}
                >
                  {cell.content}
                </Tag>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
