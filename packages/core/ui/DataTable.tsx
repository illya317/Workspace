"use client";

import { type ReactNode, Fragment } from "react";
import type { ColumnDef } from "./ColumnToggle";

/**
 * 通用表格列定义，兼容 ColumnToggle。
 * 同一份 columns 数组可同时传给 <ColumnToggle> 和 <DataTable>。
 */
export interface DataTableColumn<T> extends ColumnDef {
  /** 应用到该列每个 td 的额外 className。 */
  className?: string;
  /** 应用到该列 th 的额外 className。 */
  headerClassName?: string;
  /** 应用到该列每个 td 的额外 className（与 className 合并）。 */
  cellClassName?: string;
  /** 单元格渲染函数。如需行内编辑，在此实现并处理好事件冒泡。 */
  render: (row: T) => ReactNode;
}

export interface DataTableProps<T> {
  rows: T[];
  columns: DataTableColumn<T>[];
  visibleColumns: string[];
  density?: "normal" | "compact";
  loading?: boolean;
  emptyText?: string;
  rowKey: (row: T) => string | number;
  /** 行点击回调。如需阻止冒泡，在 render 的交互元素上 e.stopPropagation()。 */
  onRowClick?: (row: T) => void;
  rowClassName?: (row: T) => string;
  tableClassName?: string;
  /** 展开行的 key，与 rowKey 返回值比较。匹配时在该行下方渲染 expandedRow。 */
  expandedRowKey?: string | number | null;
  /** 展开行内容（colSpan 自动填满所有可见列）。 */
  renderExpandedRow?: (row: T) => ReactNode;
}

/**
 * 从列定义中提取默认可见列的 key 列表。
 * required 或 defaultVisible 为 true 的列默认显示。
 */
export function getDefaultVisibleColumns<T>(
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

/**
 * 通用数据表格。
 *
 * 不负责：筛选、分页、列切换（ColumnToggle）、行内编辑逻辑。
 * 只负责：表头渲染、数据行渲染、加载态、空状态、列可见性。
 *
 * 典型组合：
 *   FinanceFilters + ColumnToggle + DataTable + Pagination
 */
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
  renderExpandedRow,
}: DataTableProps<T>) {
  // required 列始终显示，不依赖 visibleColumns 是否包含它
  const visible = columns.filter(
    (c) => c.required || visibleColumns.includes(c.key)
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
              className={`whitespace-nowrap ${headerPadding} font-medium ${col.headerClassName ?? ""}`}
            >
              {col.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className={dataTableClassNames.body}>
        {rows.map((row) => {
          const key = rowKey(row);
          const isExpanded = expandedRowKey != null && expandedRowKey === key;
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
