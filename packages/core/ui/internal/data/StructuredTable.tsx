import { Fragment, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
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
  const mobileHeaders = mobileCardHeaders(rows, colWidths);
  let bodyRowIndex = 0;

  return (
    <>
      {mobileHeaders ? (
        <div className="divide-y divide-slate-100 bg-white sm:hidden">
          {rows.slice(1).map((row, mobileRowIndex) => {
            const rowIndex = mobileRowIndex + 1;
            const interaction = rowInteractions?.[rowIndex] ?? null;
            return (
              <article
                key={rowIndex}
                className={`p-3.5 ${interaction ? "cursor-pointer transition active:bg-emerald-50" : ""}`}
                tabIndex={interaction ? 0 : undefined}
                aria-label={interaction?.ariaLabel}
                onClick={interaction ? (event) => activateRowFromClick(event, interaction) : undefined}
                onKeyDown={interaction ? (event) => activateRowFromKeyboard(event, interaction) : undefined}
              >
                <dl className="grid grid-cols-[5rem_minmax(0,1fr)] gap-x-3 gap-y-2.5">
                  {row.map((cell, cellIndex) => (
                    <Fragment key={`${rowIndex}-${cellIndex}`}>
                      <dt className="min-w-0 text-xs font-semibold leading-6 text-slate-500">
                        {mobileHeaders[cellIndex].content}
                      </dt>
                      <dd className={`min-w-0 text-sm leading-6 text-slate-800 ${resolveStructuredCellClass(cell)}`}>
                        {cell.content}
                      </dd>
                    </Fragment>
                  ))}
                </dl>
              </article>
            );
          })}
        </div>
      ) : null}
      <div className={mobileHeaders ? "hidden sm:block" : undefined}>
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
      </div>
    </>
  );
}

function mobileCardHeaders(
  rows: StructuredTableCell[][],
  colWidths?: Array<DataSurfaceStructuredDimension | null>,
) {
  if (colWidths?.length || rows.length < 2) return null;
  const headers = rows[0];
  const simpleCell = (cell: StructuredTableCell) => !cell.colSpan && !cell.rowSpan;
  if (!headers.length || !headers.every((cell) => cell.header && simpleCell(cell))) return null;
  const bodyRowsAreSimple = rows.slice(1).every((row) => (
    row.length === headers.length
    && row.every((cell) => !cell.header && simpleCell(cell))
  ));
  return bodyRowsAreSimple ? headers : null;
}

function activateRowFromClick(
  event: MouseEvent<HTMLElement>,
  interaction: DataSurfaceStructuredRowInteractionSpec,
) {
  if (isNestedInteractiveTarget(event.target, event.currentTarget)) return;
  interaction.onClick();
}

function activateRowFromKeyboard(
  event: KeyboardEvent<HTMLElement>,
  interaction: DataSurfaceStructuredRowInteractionSpec,
) {
  if (event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== " ")) return;
  event.preventDefault();
  interaction.onClick();
}

function isNestedInteractiveTarget(target: EventTarget | null, row: Element) {
  if (!(target instanceof Element) || target === row) return false;
  return Boolean(target.closest("a,button,input,select,textarea,[role='button'],[role='link'],[contenteditable='true'],[data-row-interaction-stop]"));
}
