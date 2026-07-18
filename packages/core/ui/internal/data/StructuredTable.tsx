import { type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import type { DataTablePresentation } from "./DataTable.types";
import {
  resolveStructuredCellClass,
  resolveTablePresentation,
} from "./table-presentation";
import type {
  DataSurfaceAlign,
  DataSurfaceEmphasis,
  DataSurfaceMobilePresentation,
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
  mobilePresentation?: DataSurfaceMobilePresentation;
}

export default function StructuredTable({
  rows,
  rowInteractions,
  colWidths,
  rowHeights,
  presentation,
  mobilePresentation = "list",
}: StructuredTableProps) {
  const tablePresentation = resolveTablePresentation(presentation, presentation?.density);
  const tableClassName = `${tablePresentation.table} ${colWidths?.length ? "table-fixed min-w-max w-full" : ""}`;
  const mobileHeaders = mobileCardHeaders(rows);
  let bodyRowIndex = 0;

  return (
    <>
      {mobileHeaders && mobilePresentation === "list" ? (
        <div className="divide-y divide-slate-100 bg-white sm:hidden" role="list" data-mobile-table-presentation="list">
          {rows.slice(1).map((row, mobileRowIndex) => {
            const rowIndex = mobileRowIndex + 1;
            const interaction = rowInteractions?.[rowIndex] ?? null;
            const titleCell = row[0];
            const summaryCells = row.slice(1, 3);
            const detailCells = row.slice(3);
            if (row.length === 1 && row[0]?.colSpan) {
              return (
                <div key={rowIndex} className="px-4 py-10 text-center text-sm text-slate-500">
                  {row[0].content}
                </div>
              );
            }
            return (
              <article
                key={rowIndex}
                role="listitem"
                className={`relative px-4 py-4 ${interaction ? "cursor-pointer transition active:bg-emerald-50" : ""}`}
                tabIndex={interaction ? 0 : undefined}
                aria-label={interaction?.ariaLabel}
                onClick={interaction ? (event) => activateRowFromClick(event, interaction) : undefined}
                onKeyDown={interaction ? (event) => activateRowFromKeyboard(event, interaction) : undefined}
              >
                <div className="flex min-w-0 items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <span className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">{mobileHeaders[0].content}</span>
                    <div className={`mt-0.5 min-w-0 break-words text-[15px] font-bold leading-6 text-slate-900 ${resolveStructuredCellClass(titleCell)}`}>
                      {titleCell.content}
                    </div>
                  </div>
                  {interaction ? <span aria-hidden="true" className="mt-4 shrink-0 text-xl leading-none text-slate-300">›</span> : null}
                </div>
                {summaryCells.length > 0 ? (
                  <dl className="mt-2 grid gap-2 min-[400px]:grid-cols-2">
                    {summaryCells.map((cell, summaryIndex) => (
                      <div key={`${rowIndex}-summary-${summaryIndex}`} className="min-w-0">
                        <dt className="text-xs font-semibold leading-5 text-slate-400">{mobileHeaders[summaryIndex + 1].content}</dt>
                        <dd className={`mt-0.5 min-w-0 break-words text-sm leading-5 text-slate-700 ${resolveStructuredCellClass(cell)}`}>{cell.content}</dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
                {detailCells.length > 0 ? (
                  <details className="group mt-2 border-t border-slate-100 pt-1">
                    <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between text-xs font-semibold text-slate-500 marker:hidden">
                      <span>更多信息</span>
                      <span className="text-slate-400 transition group-open:rotate-180">⌄</span>
                    </summary>
                    <dl className="grid gap-3 pb-1 pt-2">
                      {detailCells.map((cell, detailIndex) => (
                        <div key={`${rowIndex}-detail-${detailIndex}`} className="grid grid-cols-[5rem_minmax(0,1fr)] gap-3">
                          <dt className="text-xs font-semibold leading-5 text-slate-400">{mobileHeaders[detailIndex + 3].content}</dt>
                          <dd className={`min-w-0 break-words text-sm leading-5 text-slate-700 ${resolveStructuredCellClass(cell)}`}>{cell.content}</dd>
                        </div>
                      ))}
                    </dl>
                  </details>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : null}
      <div className={mobileHeaders ? (mobilePresentation === "landscape" ? "hidden sm:block landscape:max-sm:block" : "hidden sm:block") : undefined} data-desktop-table="true">
        {colWidths?.length ? <MobileHorizontalScrollHint /> : null}
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
                        className={`${cell.header ? tablePresentation.headerCell : tablePresentation.cell} ${resolveStructuredCellClass(cell)} ${structuredPinnedColumnClass(cellIndex, cell.header ?? false, Boolean(colWidths?.length))}`}
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
) {
  if (rows.length < 2) return null;
  const headers = rows[0];
  const simpleCell = (cell: StructuredTableCell) => !cell.colSpan && !cell.rowSpan;
  if (!headers.length || !headers.every((cell) => cell.header && simpleCell(cell))) return null;
  const bodyRowsAreSimple = rows.slice(1).every((row) => (
    (row.length === headers.length && row.every((cell) => !cell.header && simpleCell(cell)))
    || (row.length === 1 && !row[0].header && row[0].colSpan === headers.length && !row[0].rowSpan)
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
  return Boolean(target.closest("a,button,input,select,textarea,summary,details,[role='button'],[role='link'],[contenteditable='true'],[data-row-interaction-stop]"));
}

function MobileHorizontalScrollHint() {
  return (
    <div className="sticky left-0 z-20 flex w-[calc(100vw-2rem)] items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500 sm:hidden">
      <span>数据矩阵</span>
      <span>左右滑动查看完整数据 ↔</span>
    </div>
  );
}

function structuredPinnedColumnClass(columnIndex: number, header: boolean, scrollable: boolean) {
  if (!scrollable || columnIndex !== 0) return "";
  return header
    ? "sticky left-0 z-30 bg-slate-50 shadow-[8px_0_14px_-12px_rgba(15,23,42,0.55)]"
    : "sticky left-0 z-10 bg-white shadow-[8px_0_14px_-12px_rgba(15,23,42,0.45)]";
}
