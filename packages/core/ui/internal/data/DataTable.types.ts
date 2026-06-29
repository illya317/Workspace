import type { ReactNode } from "react";

export interface ColumnDef {
  key: string;
  label: ReactNode;
  defaultVisible?: boolean;
  /** 必选列，不可隐藏。如科目编码、凭证号。 */
  required?: boolean;
}

/**
 * 通用表格列定义。
 * 同一份 columns 数组可同时传给列显隐控件和 <DataTable>。
 */
export interface DataTableColumn<T> extends ColumnDef {
  /** 应用到该列每个 td 的额外 className。 */
  className?: string;
  /** 应用到该列 th 的额外 className。 */
  headerClassName?: string;
  /** 应用到该列每个 td 的额外 className（与 className 合并）。 */
  cellClassName?: string;
  /** 表头点击回调，用于排序等表格级交互。 */
  onHeaderClick?: () => void;
  /** 单元格渲染函数。如需行内编辑，在此实现并处理好事件冒泡。 */
  render: (row: T) => ReactNode;
}

export interface DataTableRowEditActionConfig<T> {
  editing: boolean;
  canEdit: boolean;
  canSave?: boolean;
  disabled?: boolean;
  saving?: boolean;
  editLabel: string;
  saveLabel: string;
  cancelLabel: string;
  /** 原始行数据；提供时内部会与 current 比较，自动判断是否有修改。 */
  initial?: unknown;
  /** 当前编辑中的行数据；与 initial 一起用于自动判断 dirty。 */
  current?: unknown | null | undefined;
  onEdit: (row: T) => void;
  onSave: () => void;
  onCancel: () => void;
}

export interface DataTableActionsColumnConfig {
  key?: string;
  label?: ReactNode;
  headerClassName?: string;
  cellClassName?: string;
  /** 操作按钮在单元格内水平居中。 */
  centered?: boolean;
}

export interface DataTablePresentation {
  density?: "normal" | "compact";
  grid?: "rows" | "cells" | "none";
  header?: "tinted" | "plain" | "strong";
  rowHover?: "none" | "neutral" | "interactive";
  stripe?: "none" | "subtle";
  cellWrap?: "nowrap" | "wrap";
}

export interface DataTableProps<T> {
  rows: T[];
  columns: DataTableColumn<T>[];
  /** 可见列 key 列表。未提供时自动使用 required / defaultVisible 列。 */
  visibleColumns?: string[];
  presentation?: DataTablePresentation;
  density?: "normal" | "compact";
  loading?: boolean;
  emptyText?: string;
  rowKey: (row: T, index: number) => string | number;
  /** 行点击回调。如需阻止冒泡，在 render 的交互元素上 e.stopPropagation()。 */
  onRowClick?: (row: T) => void;
  rowClassName?: (row: T) => string;
  tableClassName?: string;
  /** 展开行的 key，与 rowKey 返回值比较。匹配时在该行下方渲染 expandedRow。 */
  expandedRowKey?: string | number | null;
  /** 多个展开行的 key。适用于权限矩阵这类可同时展开多行详情的表格。 */
  expandedRowKeys?: Array<string | number> | Set<string | number> | null;
  /** 展开行内容（colSpan 自动填满所有可见列）。 */
  renderExpandedRow?: (row: T) => ReactNode;
  /** 行级动作；DataTable 自动渲染操作列。 */
  rowActions?: (row: T) => DataTableRowAction[];
  /** 行级编辑动作；与 rowActions 同时提供时，编辑动作排在前面。 */
  rowEditActions?: (row: T) => DataTableRowEditActionConfig<T>;
  /** 自动操作列的配置。 */
  actionsColumn?: DataTableActionsColumnConfig;
}

export type DataTableActionKind = "view" | "add" | "edit" | "save" | "cancel" | "delete";

export interface DataTableRowAction {
  key: string;
  label: string;
  kind: DataTableActionKind;
  onClick: () => void;
  disabled?: boolean;
}
