"use client";

import { Fragment, type KeyboardEvent, type MouseEvent } from "react";
import { ActionButton } from "../action/ActionControls";
import { ACTION_GLYPH_ACTION_BY_KEY } from "../action/ActionGlyphs";
import { createDataTableEditActions } from "./DataTableActions";
import type { DataTableColumn, DataTableProps, DataTableRowAction } from "./DataTable.types";
import { FieldContextProvider } from "../input/field-context";
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
  const tableClassName = `${tablePresentation.table} ${matrixColWidths.length ? "table-fixed w-full" : ""}`;
  const fieldContext = tablePresentation.density === "compact"
    ? { size: "sm" as const, density: "compact" as const }
    : { size: "md" as const, density: "normal" as const };

  const desktopTable = (
    <table className={tableClassName}>
      {matrixColWidths.length ? (
        <colgroup>
          {matrixColWidths.map((width, index) => <col key={`${width ?? "auto"}-${index}`} style={width ? { width } : undefined} />)}
        </colgroup>
      ) : null}
      <thead className={tablePresentation.head}>
        <tr>
          {visible.map((col) => (
            <th
              key={col.key}
              onClick={col.onHeaderClick}
              className={`${tablePresentation.headerCell} ${resolveTableColumnClass(col)} ${col.onHeaderClick ? "cursor-pointer select-none" : ""}`}
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
                className={`${tablePresentation.getRowClassName(index)} ${resolveTableRowStateClass(rowState?.(row))}`}
                onClick={() => onRowClick?.(row)}
              >
                {visible.map((col) => (
                  <td
                    key={col.key}
                    className={`${tablePresentation.cell} ${resolveTableColumnClass(col)}`}
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

  if (format?.kind === "matrix") return desktopTable;

  return (
    <>
      <div className="divide-y divide-slate-100 bg-white sm:hidden">
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
              className={`${stateClassName} p-3.5 ${onRowClick ? "cursor-pointer transition active:bg-emerald-50" : ""}`}
              tabIndex={onRowClick ? 0 : undefined}
              onClick={onRowClick ? (event) => activateDataRowFromClick(event, row, onRowClick) : undefined}
              onKeyDown={onRowClick ? (event) => activateDataRowFromKeyboard(event, row, onRowClick) : undefined}
            >
              <dl className="space-y-2.5">
                {visible.map((col, columnIndex) => (
                  <div
                    key={col.key}
                    className={columnIndex === 0
                      ? "grid grid-cols-[4.75rem_minmax(0,1fr)] gap-3 border-b border-slate-100 pb-2.5"
                      : "grid grid-cols-[4.75rem_minmax(0,1fr)] gap-3"}
                  >
                    <dt className="min-w-0 break-words text-xs font-semibold leading-6 text-slate-500">
                      {col.label}
                    </dt>
                    <dd className={`${resolveTableColumnClass(col)} !w-auto !max-w-none min-w-0 whitespace-normal break-words text-sm leading-6`}>
                      <FieldContextProvider value={fieldContext}>
                        {col.render(row)}
                      </FieldContextProvider>
                    </dd>
                  </div>
                ))}
              </dl>
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
  return Boolean(target.closest("a,button,input,select,textarea,[role='button'],[role='link'],[contenteditable='true'],[data-row-interaction-stop]"));
}
