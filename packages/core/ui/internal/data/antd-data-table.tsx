"use client";

import type { KeyboardEvent, MouseEvent } from "react";
import { Button, List, Space, Table, type TableColumnsType } from "antd";
import type {
  DataSurfaceColumnSpec,
  DataSurfaceDisclosureSpec,
  DataSurfacePresentationSpec,
  DataSurfaceRowActionSpec,
  DataSurfaceTableFormatSpec,
  DataSurfaceTableProps,
} from "../../DataSurface.types";
import { joinClassNames } from "../common/card-utils";
import type { FieldContextValue } from "../input/field-context";
import { createDataTableEditActions } from "./DataTableActions";
import { MobileTableFact, MobileTableValue } from "./DataTableCells";
import type { DataTableColumn } from "./DataTable.types";
import { renderDataSurfaceCell } from "./DataSurface.renderers";
import {
  resolveDataTableScroll,
  resolveTableCellSelectionClass,
  resolveTableCellStateClass,
  resolveTableDisclosureClass,
  resolveTableRowStateClass,
} from "./table-presentation";
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

/** 与 legacy 表头/表体文字 token 对齐的基础样式。 */
const TABLE_BASE_CLASS = "[&_.ant-table-tbody_td]:text-slate-700 [&_.ant-table-thead_th]:text-xs [&_.ant-table-thead_th]:font-semibold";

function columnWidth(width: DataSurfaceColumnSpec<Record<string, unknown>>["width"]) {
  if (typeof width === "number") return width;
  if (!width) return undefined;
  return { xs: 72, sm: 104, md: 144, lg: 190, xl: 240, content: 120, wide: 280 }[width];
}

function columnClassName<T>(column: DataSurfaceColumnSpec<T>, row: T) {
  return [
    column.wrap === "nowrap" ? "whitespace-nowrap" : column.wrap === "truncate" ? "max-w-0 truncate" : "",
    column.tone === "muted" ? "text-slate-500" : column.tone === "success" ? "text-emerald-700" : column.tone === "warning" ? "text-amber-700" : column.tone === "danger" ? "text-red-700" : column.tone === "info" ? "text-sky-700" : "",
    column.emphasis === "strong" ? "font-bold" : column.emphasis === "medium" ? "font-semibold" : "",
    column.font === "mono" ? "font-mono" : "",
    column.numeric ? "tabular-nums" : "",
    resolveTableCellStateClass(column.cellState?.(row)),
    resolveTableCellSelectionClass(column.cellSelected?.(row)),
  ].filter(Boolean).join(" ");
}

/** rowState 语义 class；token 与 resolveTableRowStateClass 对齐，作用于 antd 的 td。 */
function rowStateClass<T>(data: DataSurfaceTableProps<T>, row: T) {
  return {
    normal: "",
    selected: "[&>td]:!bg-emerald-50 [&>td]:!text-emerald-950",
    section: "[&>td]:!bg-slate-100 [&>td]:!text-slate-900 [&>td]:font-semibold",
    total: "[&>td]:!bg-slate-50 [&>td]:!text-slate-950 [&>td]:font-semibold",
    muted: "[&>td]:!bg-slate-50/70 [&>td]:!text-slate-500",
    warning: "[&>td]:!bg-amber-50 [&>td]:!text-amber-900",
    danger: "[&>td]:!bg-red-50 [&>td]:!text-red-900",
    info: "[&>td]:!bg-sky-50 [&>td]:!text-sky-900",
  }[data.rowState?.(row) ?? "normal"];
}

/** matrix 格式的 presentation 默认值（普通表格），对齐 legacy tablePresentationForFormat。 */
function tablePresentationForFormat(
  presentation: DataSurfacePresentationSpec | undefined,
  format: DataSurfaceTableFormatSpec | undefined,
): DataSurfacePresentationSpec {
  if (format?.kind !== "matrix") return { ...presentation };
  return {
    density: "compact",
    grid: "cells",
    header: "tinted",
    cellWrap: "wrap",
    controlHeight: "auto",
    ...presentation,
  };
}

function rowActions<T>(data: DataSurfaceTableProps<T>, row: T): DataSurfaceRowActionSpec[] {
  const actions: DataSurfaceRowActionSpec[] = [];
  if (data.rowEditActions) actions.push(...createDataTableEditActions({ ...data.rowEditActions(row), row }));
  if (data.rowActions) actions.push(...data.rowActions(row));
  return actions;
}

function visibleColumns<T>(data: DataSurfaceTableProps<T>) {
  const visible = new Set(data.visibleColumns ?? data.columns
    .filter((column) => column.required || column.defaultVisible)
    .map((column) => column.key));
  return data.columns.filter((column) => column.required || visible.has(column.key));
}

function expandedRowKeys<T>(data: DataSurfaceTableProps<T>) {
  const keys = new Set<string>();
  if (data.expandedRowKey !== null && data.expandedRowKey !== undefined) keys.add(String(data.expandedRowKey));
  if (data.expandedRowKeys instanceof Set || Array.isArray(data.expandedRowKeys)) {
    for (const key of data.expandedRowKeys) keys.add(String(key));
  }
  return [...keys];
}

/** matrix 格式列宽（普通表格），对齐 legacy tableFormatColumnWidths。 */
function tableFormatColumnWidths(columnCount: number, format: DataSurfaceTableFormatSpec | undefined) {
  if (columnCount <= 0 || format?.kind !== "matrix") return [];
  const columnWidths = format.columnWidths?.length ? format.columnWidths : [format.rowHeaderWidth ?? MATRIX_ROW_HEADER_WIDTH];
  return [
    ...columnWidths.slice(0, columnCount),
    ...Array.from({ length: Math.max(0, columnCount - columnWidths.length) }, () => null),
  ];
}

function disclosureEdges(columns: Array<{ disclosure?: DataSurfaceDisclosureSpec }>, columnIndex: number) {
  const disclosure = columns[columnIndex]?.disclosure;
  if (!disclosure) return { start: false, end: false };
  return {
    start: columns[columnIndex - 1]?.disclosure?.groupKey !== disclosure.groupKey,
    end: columns[columnIndex + 1]?.disclosure?.groupKey !== disclosure.groupKey,
  };
}

/** 列 disclosure 高亮，对齐 legacy DataTableDisclosure。 */
function disclosureColumnClass(
  columns: Array<{ disclosure?: DataSurfaceDisclosureSpec }>,
  columnIndex: number,
  surface: "header" | "body",
) {
  const column = columns[columnIndex];
  if (!column?.disclosure) return "";
  return resolveTableDisclosureClass({
    axis: "column",
    role: column.disclosure.role,
    expanded: column.disclosure.role === "trigger" ? column.disclosure.expanded : true,
    surface,
    ...disclosureEdges(columns, columnIndex),
  });
}

function disclosureDataProps(column: { disclosure?: DataSurfaceDisclosureSpec }) {
  if (!column.disclosure) return {};
  return {
    "data-disclosure-axis": "column",
    "data-disclosure-role": column.disclosure.role,
    "data-disclosure-group": column.disclosure.groupKey,
  } as const;
}

function AntdRowActionsCell<T>({ data, row }: { data: DataSurfaceTableProps<T>; row: T }) {
  const actions = rowActions(data, row);
  if (actions.length === 0) return null;
  return (
    <Space size={4} wrap>
      {actions.map((action) => (
        <Button
          danger={action.kind === "delete"}
          disabled={action.disabled}
          key={action.key}
          onClick={(event) => {
            event.stopPropagation();
            action.onClick();
          }}
          size="small"
          type="link"
        >
          {action.label}
        </Button>
      ))}
    </Space>
  );
}

type AntdRowRecord<T> = { row: T; index: number };

/** 普通表格移动端列表卡片，对齐 legacy DataTable 移动端呈现。 */
function AntdMobileTableList<T extends Record<string, unknown>>({
  data,
  visible,
  presentation,
}: {
  data: DataSurfaceTableProps<T>;
  visible: Array<DataSurfaceColumnSpec<T>>;
  presentation: DataSurfacePresentationSpec;
}) {
  const fieldContext: FieldContextValue = presentation.density === "compact"
    ? { size: "sm", density: "compact" }
    : { size: "md", density: "normal" };
  const hasActions = Boolean(data.rowActions || data.rowEditActions);
  const actionsKey = data.actionsColumn?.key ?? "actions";
  const toMobileColumn = (column: DataSurfaceColumnSpec<T>): DataTableColumn<T> => ({
    ...column,
    render: (row: T) => renderDataSurfaceCell(column.cell(row)),
  });
  const contentColumns = visible.filter((column) => !hasActions || column.key !== actionsKey).map(toMobileColumn);
  const titleColumn = contentColumns[0];
  const summaryColumns = contentColumns.slice(1, 3);
  const detailColumns = contentColumns.slice(3);
  const expandedKeys = data.expandedRow ? expandedRowKeys(data) : [];
  return (
    <div className="sm:hidden" role="list" data-mobile-table-presentation="list">
      <List<AntdRowRecord<T>>
        className="bg-white [&_.ant-list-items]:divide-y [&_.ant-list-items]:divide-slate-100"
        dataSource={data.rows.map((row, index) => ({ row, index }))}
        loading={data.loading}
        locale={{
          emptyText: (
            <div className="px-4 py-12 text-center text-sm text-slate-400">
              {data.emptyText ?? data.empty ?? "暂无数据"}
            </div>
          ),
        }}
        renderItem={({ row, index }) => {
          const key = String(data.rowKey(row, index));
          const isExpanded = expandedKeys.includes(key);
          const stateClassName = resolveTableRowStateClass(data.rowState?.(row));
          return (
            <article
              role="listitem"
              data-disclosure-axis={isExpanded ? "row" : undefined}
              data-disclosure-role={isExpanded ? "trigger" : undefined}
              data-disclosure-expanded={isExpanded || undefined}
              className={`relative px-4 py-4 ${stateClassName} ${isExpanded ? resolveTableDisclosureClass({ axis: "row", role: "trigger", expanded: true }) : ""} ${data.onRowClick ? "cursor-pointer transition active:bg-emerald-50" : ""}`}
              tabIndex={data.onRowClick ? 0 : undefined}
              onClick={data.onRowClick ? (event) => activateAntdDataRowFromClick(event, row, data.onRowClick!) : undefined}
              onKeyDown={data.onRowClick ? (event) => activateAntdDataRowFromKeyboard(event, row, data.onRowClick!) : undefined}
            >
              <div className="flex min-w-0 items-start gap-3">
                <div className="min-w-0 flex-1">
                  <span className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                    {titleColumn?.label ?? "记录"}
                  </span>
                  <div className="mt-0.5 min-w-0 break-words text-[15px] font-bold leading-6 text-slate-900">
                    {titleColumn
                      ? <MobileTableValue column={titleColumn} row={row} fieldContext={fieldContext} />
                      : `记录 ${index + 1}`}
                  </div>
                </div>
                {data.onRowClick ? <span aria-hidden="true" className="mt-4 shrink-0 text-xl leading-none text-slate-300">›</span> : null}
              </div>

              {summaryColumns.length > 0 ? (
                <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-2 min-[400px]:grid-cols-2">
                  {summaryColumns.map((column) => (
                    <MobileTableFact key={column.key} column={column} row={row} fieldContext={fieldContext} />
                  ))}
                </dl>
              ) : null}

              {detailColumns.length > 0 ? (
                <details className="group mt-2 border-t border-slate-100 pt-1">
                  <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between text-xs font-semibold text-slate-500 marker:hidden">
                    <span>更多信息</span>
                    <span className="text-slate-400 transition group-open:rotate-180">⌄</span>
                  </summary>
                  <dl className="grid gap-3 pb-1 pt-2">
                    {detailColumns.map((column) => (
                      <MobileTableFact key={column.key} column={column} row={row} fieldContext={fieldContext} detail />
                    ))}
                  </dl>
                </details>
              ) : null}

              {hasActions ? (
                <div className="mt-2 flex justify-end gap-2 border-t border-slate-100 pt-2">
                  <AntdRowActionsCell data={data} row={row} />
                </div>
              ) : null}
              {isExpanded && data.expandedRow ? (
                <div
                  data-disclosure-axis="row"
                  data-disclosure-role="detail"
                  className={`-mx-4 mb-[-1rem] mt-3 border-t border-emerald-100 px-4 pb-4 pt-3 ${resolveTableDisclosureClass({ axis: "row", role: "detail" })}`}
                >
                  {renderDataSurfaceCell(data.expandedRow(row) ?? null)}
                </div>
              ) : null}
            </article>
          );
        }}
        rowKey={({ row, index }) => String(data.rowKey(row, index))}
        split={false}
      />
    </div>
  );
}

export function AntdDataTable<T extends Record<string, unknown>>({ data }: { data: DataSurfaceTableProps<T> }) {
  const matrix = data.format?.kind === "matrix";
  const presentation = tablePresentationForFormat(data.presentation, data.format);
  const fillRow = presentation.controlHeight === "fillRow";
  const resolvedScroll = resolveDataTableScroll(data.format, data.scroll);
  const frame = data.frame ?? (matrix ? "bordered" : undefined);
  const mobilePresentation = resolveMobilePresentation(data.mobile, matrix);
  const showMobileList = mobilePresentation === "list";
  const visible = visibleColumns(data);
  const matrixWidths = tableFormatColumnWidths(visible.length, data.format);
  const expandedKeys = data.expandedRow ? expandedRowKeys(data) : [];
  const cellClass = presentationCellClass(presentation);
  const hasActions = Boolean(data.rowActions || data.rowEditActions);

  const columns: TableColumnsType<AntdRowRecord<T>> = visible.map((column, columnIndex) => ({
    key: column.key,
    title: column.onHeaderClick ? (
      <button className="cursor-pointer border-0 bg-transparent p-0 font-inherit text-inherit" onClick={column.onHeaderClick} type="button">
        {column.label}
      </button>
    ) : column.label,
    align: column.align,
    width: matrix ? matrixWidths[columnIndex] ?? columnWidth(column.width) : columnWidth(column.width),
    fixed: matrix && columnIndex === 0 ? "left" : undefined,
    onCell: ({ row }) => ({
      className: joinClassNames(cellClass, columnClassName(column, row), disclosureColumnClass(visible, columnIndex, "body")),
      ...disclosureDataProps(column),
    }),
    onHeaderCell: () => ({
      className: joinClassNames(
        disclosureColumnClass(visible, columnIndex, "header"),
        column.onHeaderClick ? "cursor-pointer select-none" : "",
      ),
      "aria-expanded": column.disclosure?.role === "trigger" ? column.disclosure.expanded : undefined,
      ...disclosureDataProps(column),
    }),
    render: (_value, { row }) => {
      const content = renderDataSurfaceCell(column.cell(row));
      return fillRow ? <div className="flex h-full min-h-[56px] items-stretch">{content}</div> : content;
    },
  }));

  if (hasActions) {
    columns.push({
      key: data.actionsColumn?.key ?? "actions",
      title: data.actionsColumn?.label ?? "操作",
      align: data.actionsColumn?.align ?? "center",
      width: 120,
      render: (_value, { row }) => <AntdRowActionsCell data={data} row={row} />,
    });
  }

  const verticalScroll = resolvedScroll.maxHeight && resolvedScroll.y !== "hidden"
    ? SCROLL_MAX_HEIGHT_PX[resolvedScroll.maxHeight]
    : undefined;
  const horizontalScroll = resolvedScroll.x ? "max-content" : undefined;
  const rowHover = resolveRowHover(presentation, Boolean(data.onRowClick));

  const desktopTable = (
    <Table<AntdRowRecord<T>>
      bordered={presentation.grid === "cells"}
      columns={columns}
      dataSource={data.rows.map((row, index) => ({ row, index }))}
      expandable={data.expandedRow ? {
        expandedRowKeys: expandedKeys,
        expandedRowClassName: () => resolveTableDisclosureClass({ axis: "row", role: "detail" }),
        expandedRowRender: ({ row }) => renderDataSurfaceCell(data.expandedRow?.(row) ?? null),
        showExpandColumn: false,
      } : undefined}
      loading={data.loading}
      locale={{ emptyText: data.emptyText ?? data.empty ?? "暂无数据" }}
      onRow={({ row, index }) => {
        const expanded = expandedKeys.includes(String(data.rowKey(row, index)));
        return {
          ...(data.onRowClick ? {
            onClick: (event: MouseEvent<HTMLElement>) => activateAntdDataRowFromClick(event, row, data.onRowClick!),
            onKeyDown: (event: KeyboardEvent<HTMLElement>) => activateAntdDataRowFromKeyboard(event, row, data.onRowClick!),
            role: "button",
            tabIndex: 0,
          } : {}),
          ...(expanded ? {
            "data-disclosure-axis": "row",
            "data-disclosure-role": "trigger",
            "data-disclosure-expanded": true,
          } : {}),
        };
      }}
      pagination={false}
      rowClassName={({ row, index }, rowIndex) => joinClassNames(
        presentation.stripe === "subtle" && rowIndex % 2 === 1 ? STRIPE_SUBTLE_CLASS : "",
        rowStateClass(data, row),
        rowHover === "interactive" ? ROW_HOVER_INTERACTIVE_CLASS : "",
        expandedKeys.includes(String(data.rowKey(row, index)))
          ? resolveTableDisclosureClass({ axis: "row", role: "trigger", expanded: true })
          : "",
      )}
      rowKey={({ row, index }) => String(data.rowKey(row, index))}
      scroll={horizontalScroll || verticalScroll ? { x: horizontalScroll, y: verticalScroll } : undefined}
      size={presentation.density === "compact" ? "small" : "middle"}
    />
  );

  const content = (
    <div className={joinClassNames(
      TABLE_BASE_CLASS,
      presentationWrapperClass(presentation),
      antdDataFrameClass(frame, resolvedScroll, Boolean(verticalScroll)),
    )}>
      {showMobileList ? <AntdMobileTableList data={data} visible={visible} presentation={presentation} /> : null}
      <div
        className={mobilePresentation === "landscape" ? "hidden sm:block landscape:max-sm:block" : "hidden sm:block"}
        data-desktop-table="true"
      >
        {desktopTable}
      </div>
    </div>
  );
  return withMobileDataExperience(content, mobilePresentation, data.mobile);
}
