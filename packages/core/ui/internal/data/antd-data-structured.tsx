"use client";

import { forwardRef, type KeyboardEvent, type MouseEvent, type TdHTMLAttributes } from "react";
import { Table, type TableColumnsType } from "antd";
import type {
  DataSurfacePresentationSpec,
  DataSurfaceScrollSpec,
  DataSurfaceStructuredCellSpec,
  DataSurfaceStructuredFormatSpec,
  DataSurfaceStructuredProps,
} from "../../DataSurface.types";
import { joinClassNames } from "../common/card-utils";
import { AntdDataCell } from "./antd-data-cell";
import { resolveStructuredCellClass } from "./table-presentation";
import {
  activateAntdDataRowFromClick,
  activateAntdDataRowFromKeyboard,
  antdDataFrameClass,
  MATRIX_ROW_HEADER_WIDTH,
  presentationCellClass,
  presentationWrapperClass,
  resolveMobilePresentation,
  resolveRowHover,
  ROW_HOVER_INTERACTIVE_CLASS,
  SCROLL_MAX_HEIGHT_PX,
  STRIPE_SUBTLE_CLASS,
  withMobileDataExperience,
} from "./antd-data-shared";

type AntdStructuredCell = {
  spec?: DataSurfaceStructuredCellSpec;
  hidden?: "column" | "row";
};

type AntdStructuredRow = {
  key: string;
  cells: AntdStructuredCell[];
  rowIndex: number;
};

type AntdStructuredNativeCellProps = TdHTMLAttributes<HTMLTableCellElement> & {
  "data-structured-header"?: "true";
};

/** Structured rows can mix header and data cells, so preserve their native table semantics inside tbody. */
const AntdStructuredNativeCell = forwardRef<HTMLTableCellElement, AntdStructuredNativeCellProps>(
  function AntdStructuredNativeCell({ "data-structured-header": header, ...props }, ref) {
    return header === "true" ? <th ref={ref} {...props} /> : <td ref={ref} {...props} />;
  },
);

function structuredColumnCount(rows: DataSurfaceStructuredCellSpec[][]) {
  return Math.max(0, ...rows.map((row) => row.reduce((count, cell) => count + (cell.colSpan ?? 1), 0)));
}

function normalizeStructuredRows(rows: DataSurfaceStructuredCellSpec[][]): AntdStructuredRow[] {
  const columnCount = structuredColumnCount(rows);
  const remainingRowSpans = Array.from({ length: columnCount }, () => 0);
  return rows.map((row, rowIndex) => {
    const cells: AntdStructuredCell[] = Array.from({ length: columnCount }, (_, index) => (
      remainingRowSpans[index] > 0 ? { hidden: "row" } : {}
    ));
    for (let index = 0; index < remainingRowSpans.length; index += 1) {
      remainingRowSpans[index] = Math.max(0, remainingRowSpans[index] - 1);
    }
    let cursor = 0;
    for (const spec of row) {
      while (cursor < columnCount && (cells[cursor].hidden || cells[cursor].spec)) cursor += 1;
      if (cursor >= columnCount) break;
      const colSpan = Math.max(1, spec.colSpan ?? 1);
      const rowSpan = Math.max(1, spec.rowSpan ?? 1);
      cells[cursor] = { spec };
      for (let offset = 1; offset < colSpan && cursor + offset < columnCount; offset += 1) {
        cells[cursor + offset] = { hidden: "column" };
      }
      if (rowSpan > 1) {
        for (let offset = 0; offset < colSpan && cursor + offset < columnCount; offset += 1) {
          remainingRowSpans[cursor + offset] = Math.max(remainingRowSpans[cursor + offset], rowSpan - 1);
        }
      }
      cursor += colSpan;
    }
    return { key: `structured-row-${rowIndex}`, cells, rowIndex };
  });
}

/** matrix 格式的 presentation 默认值（结构化表），对齐 legacy structuredPresentation。 */
function structuredPresentationFor(data: DataSurfaceStructuredProps): DataSurfacePresentationSpec {
  const rowHover = data.presentation?.rowHover ?? (data.rowInteractions?.some(Boolean) ? "interactive" : undefined);
  if (data.format?.kind !== "matrix") return { ...data.presentation, rowHover };
  return {
    density: "compact",
    grid: "cells",
    header: "tinted",
    cellWrap: "wrap",
    controlHeight: "fillRow",
    ...data.presentation,
    rowHover,
  };
}

/** 单元格样式：cellRole/对齐/宽度/色调/强调统一走 table-presentation 的 resolver。 */
function structuredCellClassName(cell?: DataSurfaceStructuredCellSpec) {
  if (!cell) return "";
  return joinClassNames(
    cell.header ? "!bg-slate-50" : "",
    resolveStructuredCellClass(cell),
  );
}

/** 首列 sticky 固定；使用清晰分隔线，避免逐行投影在不同 row height 下形成波浪。 */
function structuredPinnedColumnClass(columnIndex: number, header: boolean, scrollable: boolean) {
  if (!scrollable || columnIndex !== 0) return "";
  return header
    ? "sticky left-0 z-30 border-r border-slate-200 bg-slate-50"
    : "sticky left-0 z-10 border-r border-slate-200 bg-white";
}

/** format 行列尺寸默认值，对齐 previous renderer 的 matrix 解析。 */
function structuredFormatColWidths(rows: DataSurfaceStructuredCellSpec[][], format?: DataSurfaceStructuredFormatSpec) {
  if (format?.kind !== "matrix") return undefined;
  const columnCount = structuredColumnCount(rows);
  if (columnCount <= 0) return undefined;
  const columnWidths = format.columnWidths?.length ? format.columnWidths : [format.rowHeaderWidth ?? MATRIX_ROW_HEADER_WIDTH];
  return [
    ...columnWidths.slice(0, columnCount),
    ...Array.from({ length: Math.max(0, columnCount - columnWidths.length) }, () => null),
  ];
}

function structuredFormatRowHeights(rowCount: number, format?: DataSurfaceStructuredFormatSpec) {
  if (format?.kind !== "matrix") return undefined;
  if (rowCount <= 0 || (format.headerRowHeight === undefined && format.bodyRowHeight === undefined)) return undefined;
  return [
    format.headerRowHeight,
    ...Array.from({ length: rowCount - 1 }, () => format.bodyRowHeight),
  ];
}

/** 移动端卡片表头判定，对齐 legacy mobileCardHeaders。 */
function structuredMobileHeaders(rows: DataSurfaceStructuredCellSpec[][]) {
  if (rows.length < 2) return null;
  const headers = rows[0];
  const simpleCell = (cell: DataSurfaceStructuredCellSpec) => !cell.colSpan && !cell.rowSpan;
  if (!headers.length || !headers.every((cell) => cell.header && simpleCell(cell))) return null;
  const bodyRowsAreSimple = rows.slice(1).every((row) => (
    (row.length === headers.length && row.every((cell) => !cell.header && simpleCell(cell)))
    || (row.length === 1 && !row[0].header && row[0].colSpan === headers.length && !row[0].rowSpan)
  ));
  return bodyRowsAreSimple ? headers : null;
}

/** 结构化表移动端列表卡片，对齐 legacy StructuredTable 移动端呈现。 */
function AntdMobileStructuredList({ data }: { data: DataSurfaceStructuredProps }) {
  const headers = structuredMobileHeaders(data.rows);
  if (!headers) return null;
  return (
    <div className="sm:hidden" role="list" data-mobile-table-presentation="list">
      <div className="divide-y divide-slate-100 bg-white">
        {data.rows.slice(1).map((row, mobileRowIndex) => {
          const rowIndex = mobileRowIndex + 1;
          const interaction = data.rowInteractions?.[rowIndex] ?? null;
          const titleCell = row[0];
          const summaryCells = row.slice(1, 3);
          const detailCells = row.slice(3);
          if (row.length === 1 && row[0]?.colSpan) {
            return (
              <div className="px-4 py-10 text-center text-sm text-slate-500" key={`structured-mobile-${rowIndex}`}>
                <AntdDataCell value={row[0].content} />
              </div>
            );
          }
          return (
            <article
              key={`structured-mobile-${rowIndex}`}
              role="listitem"
              className={`relative px-4 py-4 ${interaction ? "cursor-pointer transition active:bg-emerald-50" : ""}`}
              tabIndex={interaction ? 0 : undefined}
              aria-label={interaction?.ariaLabel}
              onClick={interaction ? (event) => activateAntdDataRowFromClick(event, row, interaction.onClick) : undefined}
              onKeyDown={interaction ? (event) => activateAntdDataRowFromKeyboard(event, row, interaction.onClick) : undefined}
            >
              <div className="flex min-w-0 items-start gap-3">
                <div className="min-w-0 flex-1">
                  <span className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400"><AntdDataCell value={headers[0].content} /></span>
                  <div className={`mt-0.5 min-w-0 break-words text-[15px] font-bold leading-6 text-slate-900 ${titleCell ? resolveStructuredCellClass(titleCell) : ""}`}>
                    {titleCell ? <AntdDataCell value={titleCell.content} /> : null}
                  </div>
                </div>
                {interaction ? <span aria-hidden="true" className="mt-4 shrink-0 text-xl leading-none text-slate-300">›</span> : null}
              </div>
              {summaryCells.length > 0 ? (
                <dl className="mt-2 grid gap-2 min-[400px]:grid-cols-2">
                  {summaryCells.map((cell, summaryIndex) => (
                    <div key={`${rowIndex}-summary-${summaryIndex}`} className="min-w-0">
                      <dt className="text-xs font-semibold leading-5 text-slate-400"><AntdDataCell value={headers[summaryIndex + 1].content} /></dt>
                      <dd className={`mt-0.5 min-w-0 break-words text-sm leading-5 text-slate-700 ${resolveStructuredCellClass(cell)}`}><AntdDataCell value={cell.content} /></dd>
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
                        <dt className="text-xs font-semibold leading-5 text-slate-400"><AntdDataCell value={headers[detailIndex + 3].content} /></dt>
                        <dd className={`min-w-0 break-words text-sm leading-5 text-slate-700 ${resolveStructuredCellClass(cell)}`}><AntdDataCell value={cell.content} /></dd>
                      </div>
                    ))}
                  </dl>
                </details>
              ) : null}
            </article>
          );
        })}
      </div>
    </div>
  );
}

function MobileHorizontalScrollHint() {
  return (
    <div className="sticky left-0 z-20 flex w-[calc(100vw-2rem)] items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500 sm:hidden">
      <span>数据矩阵</span>
      <span>左右滑动查看完整数据 ↔</span>
    </div>
  );
}

export function AntdStructuredTable({ data }: { data: DataSurfaceStructuredProps }) {
  const matrix = data.format?.kind === "matrix";
  const presentation = structuredPresentationFor(data);
  const fillRow = presentation.controlHeight === "fillRow";
  const rows = normalizeStructuredRows(data.rows);
  const columnCount = structuredColumnCount(data.rows);
  const widths = data.colWidths ?? structuredFormatColWidths(data.rows, data.format);
  const heights = data.rowHeights ?? structuredFormatRowHeights(data.rows.length, data.format);
  const scrollable = Boolean(widths?.length);
  const frame = data.frame ?? (matrix ? "bordered" : undefined);
  const scrollSpec: DataSurfaceScrollSpec = data.scroll ?? (matrix ? { x: true, y: "hidden" } : {});
  const mobilePresentation = resolveMobilePresentation(data.mobile, matrix);
  const showMobileList = mobilePresentation === "list" && structuredMobileHeaders(data.rows) !== null;
  const cellClass = presentationCellClass(presentation);
  let bodyRowIndex = 0;
  const bodyRowIndexes = data.rows.map((row) => (row.some((cell) => cell.header) ? -1 : bodyRowIndex++));

  const columns: TableColumnsType<AntdStructuredRow> = Array.from({ length: columnCount }, (_, columnIndex) => ({
    key: `structured-column-${columnIndex}`,
    width: widths?.[columnIndex] ?? undefined,
    onCell: (row) => {
      const cell = row.cells[columnIndex];
      const spec = cell?.spec;
      return {
        "data-structured-header": spec?.header ? "true" : undefined,
        align: spec?.align,
        className: joinClassNames(
          cellClass,
          structuredCellClassName(spec),
          structuredPinnedColumnClass(columnIndex, spec?.header ?? false, scrollable),
        ),
        colSpan: cell?.hidden ? 0 : spec?.colSpan,
        rowSpan: cell?.hidden ? 0 : spec?.rowSpan,
        style: typeof spec?.width === "number" ? { width: spec.width } : undefined,
      } as AntdStructuredNativeCellProps;
    },
    render: (_value, row) => {
      const cell = row.cells[columnIndex];
      if (cell?.hidden || !cell?.spec) return null;
      const content = <AntdDataCell value={cell.spec.content} />;
      return fillRow && !cell.spec.header
        ? <div className="flex h-full min-h-[56px] items-stretch">{content}</div>
        : content;
    },
  }));

  const horizontalScroll = data.structuredScroll === false || scrollSpec.x === false ? undefined : "max-content";
  const verticalScroll = scrollSpec.maxHeight && scrollSpec.y !== "hidden"
    ? SCROLL_MAX_HEIGHT_PX[scrollSpec.maxHeight]
    : undefined;
  const rowHover = resolveRowHover(presentation, Boolean(data.rowInteractions?.some(Boolean)));

  const desktopTable = (
    <Table<AntdStructuredRow>
      bordered={presentation.grid === "cells"}
      columns={columns}
      components={{ body: { cell: AntdStructuredNativeCell } }}
      dataSource={rows}
      locale={{ emptyText: data.empty ?? "暂无数据" }}
      onRow={(row) => {
        const interaction = data.rowInteractions?.[row.rowIndex];
        const explicitRowHeight = data.rows[row.rowIndex]?.find((cell) => cell.rowHeight)?.rowHeight
          ?? heights?.[row.rowIndex];
        return {
          ...(interaction ? {
            "aria-label": interaction.ariaLabel,
            onClick: (event: MouseEvent<HTMLElement>) => activateAntdDataRowFromClick(event, row, interaction.onClick),
            onKeyDown: (event: KeyboardEvent<HTMLElement>) => activateAntdDataRowFromKeyboard(event, row, interaction.onClick),
            role: "button",
            tabIndex: 0,
          } : {}),
          style: explicitRowHeight ? { height: explicitRowHeight } : undefined,
        };
      }}
      pagination={false}
      rowClassName={(row) => {
        const bodyIndex = bodyRowIndexes[row.rowIndex] ?? -1;
        return joinClassNames(
          presentation.stripe === "subtle" && bodyIndex >= 0 && bodyIndex % 2 === 1 ? STRIPE_SUBTLE_CLASS : "",
          rowHover === "interactive" && bodyIndex >= 0 ? ROW_HOVER_INTERACTIVE_CLASS : "",
        );
      }}
      rowKey="key"
      scroll={horizontalScroll || verticalScroll ? { x: horizontalScroll, y: verticalScroll } : undefined}
      showHeader={false}
      size={presentation.density === "compact" ? "small" : "medium"}
    />
  );

  const tableWithMobile = (
    <>
      {showMobileList ? <AntdMobileStructuredList data={data} /> : null}
      <div
        className={showMobileList || structuredMobileHeaders(data.rows) !== null
          ? mobilePresentation === "landscape" ? "hidden sm:block landscape:max-sm:block" : "hidden sm:block"
          : undefined}
        data-desktop-table="true"
      >
        {scrollable ? <MobileHorizontalScrollHint /> : null}
        {desktopTable}
      </div>
    </>
  );
  const framed = data.structuredScroll === false ? tableWithMobile : (
    <div className={joinClassNames(
      presentationWrapperClass(presentation),
      antdDataFrameClass(frame, scrollSpec, Boolean(verticalScroll)),
    )}>
      {tableWithMobile}
    </div>
  );
  return withMobileDataExperience(framed, mobilePresentation, data.mobile);
}
