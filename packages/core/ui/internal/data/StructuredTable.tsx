import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
import type { DataTablePresentation } from "./DataTable.types";
import {
  resolveStructuredCellClass,
  resolveTablePresentation,
} from "./table-presentation";
import type {
  DataSurfaceAlign,
  DataSurfaceEmphasis,
  DataSurfaceRowHeight,
  DataSurfaceStructuredDimension,
  DataSurfaceStructuredCellRole,
  DataSurfaceStructuredRowInteractionSpec,
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
  rowInteractions?: Array<DataSurfaceStructuredRowInteractionSpec | null>;
  colWidths?: Array<DataSurfaceStructuredDimension | null>;
  rowHeights?: Array<DataSurfaceStructuredDimension | undefined>;
  presentation?: DataTablePresentation;
}

export default function StructuredTable({
  rows,
  rowInteractions,
  colWidths,
  rowHeights,
  presentation,
}: StructuredTableProps) {
  const tablePresentation = resolveTablePresentation(presentation, presentation?.density);
  const tableClassName = `${tablePresentation.table} ${colWidths?.length ? "table-fixed w-full" : ""}`;
  let bodyRowIndex = 0;

  return (
    <table className={tableClassName}>
      {colWidths?.length ? (
        <colgroup>
          {colWidths.map((width, index) => <col key={`${width ?? "auto"}-${index}`} style={width ? { width } : undefined} />)}
        </colgroup>
      ) : null}
      <tbody className={tablePresentation.body}>
        {rows.map((row, rowIndex) => {
          const headerRow = row.some((cell) => cell.header);
          const interaction = headerRow ? null : rowInteractions?.[rowIndex] ?? null;
          const resolvedRowIndex = headerRow ? -1 : bodyRowIndex++;
          const explicitRowHeight = row.find((cell) => cell.rowHeight)?.rowHeight ?? rowHeights?.[rowIndex];
          return (
            <tr
              key={rowIndex}
              className={headerRow ? "" : tablePresentation.getRowClassName(resolvedRowIndex)}
              style={explicitRowHeight ? { height: explicitRowHeight } : undefined}
              tabIndex={interaction ? 0 : undefined}
              aria-label={interaction?.ariaLabel}
              onClick={interaction ? (event) => activateRowFromClick(event, interaction) : undefined}
              onKeyDown={interaction ? (event) => activateRowFromKeyboard(event, interaction) : undefined}
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
                    <div className={cell.header ? "" : tablePresentation.cellContent}>{cell.content}</div>
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

function activateRowFromClick(
  event: MouseEvent<HTMLTableRowElement>,
  interaction: DataSurfaceStructuredRowInteractionSpec,
) {
  if (isNestedInteractiveTarget(event.target, event.currentTarget)) return;
  interaction.onClick();
}

function activateRowFromKeyboard(
  event: KeyboardEvent<HTMLTableRowElement>,
  interaction: DataSurfaceStructuredRowInteractionSpec,
) {
  if (event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== " ")) return;
  event.preventDefault();
  interaction.onClick();
}

function isNestedInteractiveTarget(target: EventTarget | null, row: HTMLTableRowElement) {
  if (!(target instanceof Element) || target === row) return false;
  return Boolean(target.closest("a,button,input,select,textarea,[role='button'],[role='link'],[contenteditable='true'],[data-row-interaction-stop]"));
}
