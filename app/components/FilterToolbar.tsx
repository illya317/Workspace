"use client";

import FilterBar from "./FilterBar";
import SearchBox from "./SearchBox";
import SelectField from "./SelectField";
import ColumnToggle, { type ColumnDef } from "./ColumnToggle";

interface FilterToolbarProps {
  // ── 搜索 ──
  keyword?: string;
  onKeywordChange?: (value: string) => void;
  searchPlaceholder?: string;

  // ── 主K + extra 插槽 ──
  children?: React.ReactNode;

  // ── 字段 ──
  columns?: ColumnDef[];
  visibleColumns?: string[];
  onColumnsChange?: (visible: string[]) => void;

  // ── 分页 ──
  pageSize?: number;
  pageSizeOptions?: number[];
  onPageSizeChange?: (value: number) => void;

  // ── 总数 ──
  total?: number;
}

/**
 * 全局统一筛选工具栏。
 *
 * 布局：
 *   搜索 | children(主K+extra) | 字段 | 每页 | flex-1 | 共X条
 *
 * 使用：
 *   <FilterToolbar keyword={kw} onKeywordChange={setKw}
 *     columns={COLS} visibleColumns={vis} onColumnsChange={setVis}
 *     pageSize={ps} onPageSizeChange={setPs} total={t}>
 *     <SelectField label="公司" ... />
 *     <SelectField label="年度" ... />
 *   </FilterToolbar>
 */
export default function FilterToolbar({
  keyword = "",
  onKeywordChange,
  searchPlaceholder = "搜索...",
  children,
  columns,
  visibleColumns,
  onColumnsChange,
  pageSize = 50,
  pageSizeOptions = [20, 50, 100, 200],
  onPageSizeChange,
  total,
}: FilterToolbarProps) {
  const sizeOptions = pageSizeOptions.map((s) => ({
    value: String(s),
    label: `${s}条/页`,
  }));

  return (
    <FilterBar>
      {/* 搜索 */}
      {onKeywordChange && (
        <SearchBox
          compact
          query={keyword}
          onQueryChange={onKeywordChange}
          placeholder={searchPlaceholder}
          inputClassName="rounded border border-gray-200 px-2 py-1 text-xs w-36 focus:border-emerald-400 focus:outline-none"
        />
      )}

      {/* 主K + extra（调用方自行组合 SelectField / FilterField） */}
      {children}

      {/* 字段 */}
      {columns && onColumnsChange && visibleColumns && (
        <ColumnToggle
          columns={columns}
          visible={visibleColumns}
          onChange={onColumnsChange}
        />
      )}

      {/* 每页 */}
      {onPageSizeChange && (
        <SelectField
          options={sizeOptions}
          value={String(pageSize)}
          onChange={(v) => onPageSizeChange(Number(v))}
        />
      )}

      <div className="flex-1" />

      {/* 共X条 */}
      {total !== undefined && (
        <span className="text-[11px] text-gray-400">共 {total} 条</span>
      )}
    </FilterBar>
  );
}
