"use client";

import FilterToolbar from "./FilterToolbar";
import EditToolbar from "./EditToolbar";
import type { ColumnDef } from "./ColumnToggle";

interface EditFilterToolbarProps {
  // ── 继承 FilterToolbar ──
  keyword?: string;
  onKeywordChange?: (value: string) => void;
  searchPlaceholder?: string;
  children?: React.ReactNode;
  columns?: ColumnDef[];
  visibleColumns?: string[];
  onColumnsChange?: (visible: string[]) => void;
  pageSize?: number;
  pageSizeOptions?: number[];
  onPageSizeChange?: (value: number) => void;
  total?: number;

  // ── 编辑模式 ──
  editing?: boolean;
  onStartEdit?: () => void;
  onSave?: () => Promise<void>;
  onCancel?: () => void;
  saving?: boolean;
}

/**
 * 编辑版筛选工具栏 — FilterToolbar + EditToolbar。
 * HR/可编辑表格使用。
 *
 * 布局：
 *   搜索 | children(主K+extra) | 字段 | 每页 | flex-1 | EditToolbar | 共X条
 */
export default function EditFilterToolbar({
  keyword, onKeywordChange, searchPlaceholder,
  children,
  columns, visibleColumns, onColumnsChange,
  pageSize, pageSizeOptions, onPageSizeChange,
  total,
  editing, onStartEdit, onSave, onCancel, saving,
}: EditFilterToolbarProps) {
  return (
    <FilterToolbar
      keyword={keyword}
      onKeywordChange={onKeywordChange}
      searchPlaceholder={searchPlaceholder}
      columns={columns}
      visibleColumns={visibleColumns}
      onColumnsChange={onColumnsChange}
      pageSize={pageSize}
      pageSizeOptions={pageSizeOptions}
      onPageSizeChange={onPageSizeChange}
      total={total}
      extraRight={
        onStartEdit ? (
          <EditToolbar
            editMode={editing ?? false}
            onStartEdit={onStartEdit}
            onSave={onSave ?? (async () => {})}
            onCancel={onCancel ?? (() => {})}
            saving={saving}
          />
        ) : undefined
      }
    >
      {children}
    </FilterToolbar>
  );
}
