"use client";

import FilterBar from "./FilterBar";
import SelectField from "./SelectField";
import ColumnToggle, { type ColumnDef } from "./ColumnToggle";
import SearchInput from "./SearchInput";

export interface FilterToolbarProps {
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
  extraRight?: React.ReactNode;
}

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
  extraRight,
}: FilterToolbarProps) {
  const sizeOptions = pageSizeOptions.map((size) => ({
    value: String(size),
    label: `${size}条/页`,
  }));

  return (
    <FilterBar>
      {onKeywordChange && (
        <SearchInput
          value={keyword}
          onChange={onKeywordChange}
          placeholder={searchPlaceholder}
        />
      )}

      {children}

      <div className="flex-1" />

      {columns && onColumnsChange && visibleColumns && (
        <ColumnToggle
          columns={columns}
          visible={visibleColumns}
          onChange={onColumnsChange}
        />
      )}

      {onPageSizeChange && (
        <SelectField
          options={sizeOptions}
          value={String(pageSize)}
          onChange={(value) => onPageSizeChange(Number(value))}
        />
      )}

      {extraRight}
    </FilterBar>
  );
}
