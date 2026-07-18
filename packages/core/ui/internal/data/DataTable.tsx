"use client";

import { Fragment, type KeyboardEvent, type MouseEvent } from "react";
import { ActionButton } from "../action/ActionControls";
import { ACTION_GLYPH_ACTION_BY_KEY } from "../action/ActionGlyphs";
import { createDataTableEditActions } from "./DataTableActions";
import type { DataTableColumn, DataTableProps, DataTableRowAction } from "./DataTable.types";
import { FieldContextProvider, type FieldContextValue } from "../input/field-context";
import { resolveTableColumnClass, resolveTablePresentation, resolveTableRowStateClass } from "./table-presentation";

export type {
  ColumnDef,
  DataTableActionKind,
  DataTableActionsColumnConfig,
  DataTableColumn,
  DataTablePresentation,
  DataTableProps,
  DataTableRowAction,
  DataTableRowEditActionConfig,
} from "./DataTable.types";

/**
 * 从列定义中提取默认可见列的 key 列表。
 * required 或 defaultVisible 为 true 的列默认显示。
 */
function getDefaultVisibleColumns<T>(
  columns: DataTableColumn<T>[]
): string[] {
  return columns
    .filter((c) => c.required || c.defaultVisible)
    .map((c) => c.key);
}

export const dataTableClassNames = {
  table: resolveTablePresentation().table,
  head: resolveTablePresentation().head,
  body: resolveTablePresentation().body,
  row: resolveTablePresentation(undefined, "normal", { rowHover: "neutral" }).row,
  clickableRow: resolveTablePresentation(undefined, "normal", { rowHover: "interactive" }).row,
  headerCell: resolveTablePresentation().headerCell,
  compactHeaderCell: resolveTablePresentation({ density: "compact" }).headerCell,
  cell: resolveTablePresentation().cell,
  compactCell: resolveTablePresentation({ density: "compact" }).cell,
};

function DataTableActionsCell({ actions }: { actions: DataTableRowAction[] }) {
  return (
    <div className="flex w-max max-w-full flex-wrap items-center gap-2 overflow-hidden">
      {actions.map((action) => {
        const actionDefinition = ACTION_GLYPH_ACTION_BY_KEY[action.kind];
        return (
          <span
            key={action.key}
            className="inline-flex"
            onClick={(event) => event.stopPropagation()}
          >
            <ActionButton
              kind={actionDefinition.icon}
              label={action.label}
              variant={actionDefinition.variant}
              disabled={action.disabled}
              onClick={action.onClick}
            />
          </span>
        );
      })}
    </div>
  );
}

function tableFormatColumnWidths(
  columnCount: number,
  format: DataTableProps<unknown>["format"],
) {
  if (columnCount <= 0) return [];
  if (format?.kind !== "matrix") return [];
  const columnWidths = format.columnWidths?.length ? format.columnWidths : [format.rowHeaderWidth ?? "20rem"];
  return [
    ...columnWidths.slice(0, columnCount),
    ...Array.from({ length: Math.max(0, columnCount - columnWidths.length) }, () => null),
  ];
}

function tablePresentationForFormat(
  presentation: DataTableProps<unknown>["presentation"],
  format: DataTableProps<unknown>["format"],
) {
  if (format?.kind !== "matrix") return presentation;
  return {
    density: "compact" as const,
    grid: "cells" as const,
    header: "tinted" as const,
    cellWrap: "wrap" as const,
    controlHeight: "auto" as const,
    ...presentation,
  };
}

/**
 * 通用数据表格。
 *
 * 不负责：筛选、分页、列切换、行内编辑逻辑。
 * 只负责：表头渲染、数据行渲染、加载态、空状态、列可见性。
 *
 * 典型组合：
 *   Toolbar + DataTable + Pagination
 */
function getRowActions<T>(
  row: T,
  rowActions: DataTableProps<T>["rowActions"],
  rowEditActions: DataTableProps<T>["rowEditActions"]
): DataTableRowAction[] {
  const actions: DataTableRowAction[] = [];
  if (rowEditActions) {
    actions.push(...createDataTableEditActions({ ...rowEditActions(row), row }));
  }
  if (rowActions) {
    actions.push(...rowActions(row));
  }
  return actions;
}

export default function DataTable<T>({
  rows,
  columns,
  visibleColumns,
  format,
  presentation,
  loading,
  emptyText,
  rowKey,
  onRowClick,
  rowState,
  expandedRowKey,
  expandedRowKeys,
  renderExpandedRow,
  rowActions,
  rowEditActions,
  actionsColumn,
}: DataTableProps<T>) {
  const hasActions = Boolean(rowActions || rowEditActions);
  const actionsKey = actionsColumn?.key ?? "actions";
  // 自动追加操作列；业务不再需要在 columns 里手写操作列
  const allColumns = hasActions
    ? [
        ...columns,
        {
          key: actionsKey,
          label: actionsColumn?.label ?? "操作",
          required: true,
          align: actionsColumn?.align ?? "center",
          render: (row: T) => {
            const actions = getRowActions(row, rowActions, rowEditActions);
            if (actions.length === 0) return null;
            const cell = <DataTableActionsCell actions={actions} />;
            return actionsColumn?.align === "center" || !actionsColumn?.align ? (
              <div className="flex min-w-0 max-w-full justify-center overflow-hidden">{cell}</div>
            ) : (
              cell
            );
          },
        } as DataTableColumn<T>,
      ]
    : columns;

  // required 列始终显示，不依赖 visibleColumns 是否包含它
  const resolvedVisibleColumns = visibleColumns ?? getDefaultVisibleColumns(allColumns);
  const visible = allColumns.filter(
    (c) => c.required || resolvedVisibleColumns.includes(c.key)
  );

  if (loading) {
    return <p className="p-8 text-center text-gray-500">加载中...</p>;
  }

  const resolvedPresentation = tablePresentationForFormat(presentation, format);
  const matrixColWidths = tableFormatColumnWidths(visible.length, format);
  const tablePresentation = resolveTablePresentation(
    {
      ...resolvedPresentation,
      rowHover: resolvedPresentation?.rowHover ?? (onRowClick ? "interactive" : "neutral"),
    },
    resolvedPresentation?.density,
  );
  const tableClassName = `${tablePresentation.table} ${matrixColWidths.length ? "table-fixed min-w-max w-full" : ""}`;
  const fieldContext = tablePresentation.density === "compact"
    ? { size: "sm" as const, density: "compact" as const }
    : { size: "md" as const, density: "normal" as const };
  const mobileContentColumns = visible.filter((column) => !hasActions || column.key !== actionsKey);
  const mobileTitleColumn = mobileContentColumns[0];
  const mobileSummaryColumns = mobileContentColumns.slice(1, 4);
  const mobileDetailColumns = mobileContentColumns.slice(4);
  const mobileActionsColumn = hasActions ? visible.find((column) => column.key === actionsKey) : undefined;

  const desktopTable = (
    <table className={tableClassName}>
      {matrixColWidths.length ? (
        <colgroup>
          {matrixColWidths.map((width, index) => <col key={`${width ?? "auto"}-${index}`} style={width ? { width } : undefined} />)}
        </colgroup>
      ) : null}
      <thead className={tablePresentation.head}>
        <tr>
          {visible.map((col, columnIndex) => (
            <th
              key={col.key}
              onClick={col.onHeaderClick}
              className={`${tablePresentation.headerCell} ${resolveTableColumnClass(col)} ${matrixPinnedColumnClass(columnIndex, true, matrixColWidths.length > 0)} ${col.onHeaderClick ? "cursor-pointer select-none" : ""}`}
            >
              {col.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className={tablePresentation.body}>
        {rows.map((row, index) => {
          const key = rowKey(row, index);
          const isExpanded =
            (expandedRowKey != null && expandedRowKey === key)
            || (expandedRowKeys instanceof Set
              ? expandedRowKeys.has(key)
              : Array.isArray(expandedRowKeys) && expandedRowKeys.includes(key));
          return (
            <Fragment key={key}>
              <tr
                className={`group ${matrixColWidths.length ? "bg-white" : ""} ${tablePresentation.getRowClassName(index)} ${resolveTableRowStateClass(rowState?.(row))}`}
                onClick={() => onRowClick?.(row)}
              >
                {visible.map((col, columnIndex) => (
                  <td
                    key={col.key}
                    className={`${tablePresentation.cell} ${resolveTableColumnClass(col)} ${matrixPinnedColumnClass(columnIndex, false, matrixColWidths.length > 0)}`}
                  >
                    <div className={tablePresentation.cellContent}>
                      <FieldContextProvider value={fieldContext}>
                        {col.render(row)}
                      </FieldContextProvider>
                    </div>
                  </td>
                ))}
              </tr>
              {isExpanded && renderExpandedRow && (
                <tr className={tablePresentation.expandedRow}>
                  <td colSpan={visible.length} className={tablePresentation.cell}>
                    {renderExpandedRow(row)}
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
        {rows.length === 0 && (
          <tr>
            <td
              colSpan={visible.length || 1}
              className={tablePresentation.emptyCell}
            >
              {emptyText ?? "暂无数据"}
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );

  if (format?.kind === "matrix") {
    return (
      <>
        <MobileHorizontalScrollHint />
        {desktopTable}
      </>
    );
  }

  return (
    <>
      <div className="space-y-2.5 bg-slate-50/70 p-2.5 sm:hidden">
        {rows.map((row, index) => {
          const key = rowKey(row, index);
          const isExpanded =
            (expandedRowKey != null && expandedRowKey === key)
            || (expandedRowKeys instanceof Set
              ? expandedRowKeys.has(key)
              : Array.isArray(expandedRowKeys) && expandedRowKeys.includes(key));
          const stateClassName = resolveTableRowStateClass(rowState?.(row));
          return (
            <article
              key={key}
              className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ${stateClassName} ${onRowClick ? "cursor-pointer transition active:border-emerald-200 active:bg-emerald-50" : ""}`}
              tabIndex={onRowClick ? 0 : undefined}
              onClick={onRowClick ? (event) => activateDataRowFromClick(event, row, onRowClick) : undefined}
              onKeyDown={onRowClick ? (event) => activateDataRowFromKeyboard(event, row, onRowClick) : undefined}
            >
              <div className="min-w-0">
                <span className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">
                  {mobileTitleColumn?.label ?? "记录"}
                </span>
                <div className="mt-1 min-w-0 break-words text-base font-bold leading-6 text-slate-900">
                  {mobileTitleColumn
                    ? <MobileTableValue column={mobileTitleColumn} row={row} fieldContext={fieldContext} />
                    : `记录 ${index + 1}`}
                </div>
              </div>

              {mobileSummaryColumns.length > 0 ? (
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-slate-100 pt-3">
                  {mobileSummaryColumns.map((column) => (
                    <MobileTableFact key={column.key} column={column} row={row} fieldContext={fieldContext} />
                  ))}
                </dl>
              ) : null}

              {mobileDetailColumns.length > 0 ? (
                <details className="group mt-3 border-t border-slate-100 pt-2">
                  <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between rounded-lg px-1 text-xs font-semibold text-slate-500 marker:hidden">
                    <span>更多信息</span>
                    <span className="text-slate-400 transition group-open:rotate-180">⌄</span>
                  </summary>
                  <dl className="grid gap-3 px-1 pb-1 pt-2">
                    {mobileDetailColumns.map((column) => (
                      <MobileTableFact key={column.key} column={column} row={row} fieldContext={fieldContext} detail />
                    ))}
                  </dl>
                </details>
              ) : null}

              {mobileActionsColumn ? (
                <div className="mt-3 flex justify-end border-t border-slate-100 pt-3">
                  <MobileTableValue column={mobileActionsColumn} row={row} fieldContext={fieldContext} />
                </div>
              ) : null}
              {isExpanded && renderExpandedRow ? (
                <div className="mt-3 border-t border-slate-200 bg-slate-50 px-1 pt-3">
                  {renderExpandedRow(row)}
                </div>
              ) : null}
            </article>
          );
        })}
        {rows.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-slate-400">
            {emptyText ?? "暂无数据"}
          </div>
        ) : null}
      </div>
      <div className="hidden sm:block">{desktopTable}</div>
    </>
  );
}

function activateDataRowFromClick<T>(
  event: MouseEvent<HTMLElement>,
  row: T,
  onRowClick: (row: T) => void,
) {
  if (isNestedInteractiveTarget(event.target, event.currentTarget)) return;
  onRowClick(row);
}

function activateDataRowFromKeyboard<T>(
  event: KeyboardEvent<HTMLElement>,
  row: T,
  onRowClick: (row: T) => void,
) {
  if (event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== " ")) return;
  event.preventDefault();
  onRowClick(row);
}

function isNestedInteractiveTarget(target: EventTarget | null, row: Element) {
  if (!(target instanceof Element) || target === row) return false;
  return Boolean(target.closest("a,button,input,select,textarea,summary,details,[role='button'],[role='link'],[contenteditable='true'],[data-row-interaction-stop]"));
}

function MobileTableFact<T>({
  column,
  row,
  fieldContext,
  detail = false,
}: {
  column: DataTableColumn<T>;
  row: T;
  fieldContext: FieldContextValue;
  detail?: boolean;
}) {
  return (
    <div className={detail ? "grid grid-cols-[5rem_minmax(0,1fr)] gap-3" : "min-w-0"}>
      <dt className="min-w-0 break-words text-xs font-semibold leading-5 text-slate-400">{column.label}</dt>
      <dd className={`${detail ? "" : "mt-0.5"} ${resolveTableColumnClass(column)} !w-auto !max-w-none min-w-0 whitespace-normal break-words text-sm leading-5 text-slate-700`}>
        <MobileTableValue column={column} row={row} fieldContext={fieldContext} />
      </dd>
    </div>
  );
}

function MobileTableValue<T>({
  column,
  row,
  fieldContext,
}: {
  column: DataTableColumn<T>;
  row: T;
  fieldContext: FieldContextValue;
}) {
  return <FieldContextProvider value={fieldContext}>{column.render(row)}</FieldContextProvider>;
}

function MobileHorizontalScrollHint() {
  return (
    <div className="sticky left-0 z-20 flex w-[calc(100vw-2rem)] items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500 sm:hidden">
      <span>对比表</span>
      <span>左右滑动查看完整数据 ↔</span>
    </div>
  );
}

function matrixPinnedColumnClass(columnIndex: number, header: boolean, matrix: boolean) {
  if (!matrix || columnIndex !== 0) return "";
  return header
    ? "sticky left-0 z-30 bg-slate-50 shadow-[8px_0_14px_-12px_rgba(15,23,42,0.55)]"
    : "sticky left-0 z-10 bg-inherit shadow-[8px_0_14px_-12px_rgba(15,23,42,0.45)]";
}
