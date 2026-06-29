"use client";

import { Fragment } from "react";
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
    <div className="flex flex-wrap items-center gap-2">
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

  const tablePresentation = resolveTablePresentation(
    {
      ...presentation,
      rowHover: presentation?.rowHover ?? (onRowClick ? "interactive" : "neutral"),
    },
    presentation?.density,
  );
  const fieldContext = tablePresentation.density === "compact"
    ? { size: "sm" as const, density: "compact" as const }
    : { size: "md" as const, density: "normal" as const };

  return (
    <table className={tablePresentation.table}>
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
                    <FieldContextProvider value={fieldContext}>
                      {col.render(row)}
                    </FieldContextProvider>
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
}
