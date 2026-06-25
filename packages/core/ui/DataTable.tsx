"use client";

import { Fragment } from "react";
import { ActionButton } from "./ActionControls";
import type { ActionGlyphKind } from "./ActionGlyphs";
import { createDataTableEditActions } from "./DataTableActions";
import type { DataTableActionKind, DataTableColumn, DataTableProps, DataTableRowAction } from "./DataTable.types";

export type {
  ColumnDef,
  DataTableActionKind,
  DataTableActionsColumnConfig,
  DataTableColumn,
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
  table: "min-w-full text-left text-sm",
  head: "border-b border-slate-200 bg-slate-50 text-slate-500",
  body: "divide-y divide-slate-100 text-slate-800",
  row: "transition hover:bg-slate-50/60",
  clickableRow: "cursor-pointer transition hover:bg-emerald-50/60",
  headerCell: "whitespace-nowrap px-4 py-3 font-medium",
  compactHeaderCell: "whitespace-nowrap px-4 py-2.5 font-medium",
  cell: "whitespace-nowrap px-4 py-3",
  compactCell: "whitespace-nowrap px-4 py-2.5",
};

const ACTION_KIND_MAP: Record<DataTableActionKind, ActionGlyphKind> = {
  view: "view",
  add: "add",
  edit: "edit",
  save: "check",
  cancel: "cancel",
  delete: "delete",
};

function actionVariant(kind: DataTableActionKind) {
  if (kind === "delete") return "danger";
  if (kind === "add" || kind === "save") return "primary";
  return "secondary";
}

function DataTableActionsCell({ actions }: { actions: DataTableRowAction[] }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {actions.map((action) => (
        <span
          key={action.key}
          className="inline-flex"
          onClick={(event) => event.stopPropagation()}
        >
          <ActionButton
            kind={ACTION_KIND_MAP[action.kind]}
            label={action.label}
            variant={actionVariant(action.kind)}
            disabled={action.disabled}
            onClick={action.onClick}
          />
        </span>
      ))}
    </div>
  );
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
  density = "normal",
  loading,
  emptyText,
  rowKey,
  onRowClick,
  rowClassName,
  tableClassName,
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
          headerClassName: actionsColumn?.headerClassName,
          cellClassName: actionsColumn?.cellClassName,
          render: (row: T) => {
            const actions = getRowActions(row, rowActions, rowEditActions);
            if (actions.length === 0) return null;
            const cell = <DataTableActionsCell actions={actions} />;
            return actionsColumn?.centered ? (
              <div className="flex justify-center">{cell}</div>
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

  const headerPadding = density === "compact" ? "px-4 py-2.5" : "px-4 py-3";
  const cellPadding = density === "compact" ? "px-4 py-2.5" : "px-4 py-3";

  return (
    <table className={`${dataTableClassNames.table} ${tableClassName ?? ""}`}>
      <thead className={dataTableClassNames.head}>
        <tr>
          {visible.map((col) => (
            <th
              key={col.key}
              onClick={col.onHeaderClick}
              className={`whitespace-nowrap ${headerPadding} font-medium ${col.onHeaderClick ? "cursor-pointer select-none" : ""} ${col.headerClassName ?? ""}`}
            >
              {col.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className={dataTableClassNames.body}>
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
                className={`${onRowClick ? dataTableClassNames.clickableRow : dataTableClassNames.row} ${rowClassName?.(row) ?? ""}`}
                onClick={() => onRowClick?.(row)}
              >
                {visible.map((col) => (
                  <td
                    key={col.key}
                    className={`whitespace-nowrap ${cellPadding} ${col.className ?? ""} ${col.cellClassName ?? ""}`}
                  >
                    {col.render(row)}
                  </td>
                ))}
              </tr>
              {isExpanded && renderExpandedRow && (
                <tr className="bg-slate-50">
                  <td colSpan={visible.length} className="px-4 py-3">
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
              className="px-4 py-12 text-center text-slate-400"
            >
              {emptyText ?? "暂无数据"}
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
