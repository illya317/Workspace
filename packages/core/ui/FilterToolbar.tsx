"use client";

import FilterBar from "./FilterBar";
import SelectField from "./SelectField";
import ColumnToggle, { type ColumnDef } from "./ColumnToggle";
import SearchInput, { type SearchInputSize } from "./SearchInput";
import type { SelectFieldSize } from "./SelectField";
import { ActionButton, type ToolbarAction } from "./ActionControls";
import ToolbarOptionGroup, { type ToolbarOption } from "./ToolbarOptionGroup";

export interface FilterToolbarProps {
  keyword?: string;
  onKeywordChange?: (value: string) => void;
  searchScope?: "full" | readonly string[];
  searchPlaceholder?: string;
  children?: React.ReactNode;
  columns?: ColumnDef[];
  visibleColumns?: string[];
  onColumnsChange?: (visible: string[]) => void;
  pageSize?: number;
  pageSizeOptions?: number[];
  onPageSizeChange?: (value: number) => void;
  meta?: React.ReactNode;
  onReset?: () => void;
  resetLabel?: React.ReactNode;
  primaryAction?: ToolbarAction;
  optionGroups?: Array<{
    value: string;
    options: ToolbarOption[];
    onChange: (value: string) => void;
    ariaLabel?: string;
  }>;
  secondaryActions?: ToolbarAction[];
  extraRight?: React.ReactNode;
  controlSize?: SelectFieldSize;
  searchSize?: SearchInputSize;
  searchClassName?: string;
}

export default function FilterToolbar({
  keyword = "",
  onKeywordChange,
  searchScope = "full",
  searchPlaceholder = "搜索",
  children,
  columns,
  visibleColumns,
  onColumnsChange,
  pageSize = 50,
  pageSizeOptions = [20, 50, 100, 200],
  onPageSizeChange,
  meta,
  onReset,
  resetLabel = "重置",
  primaryAction,
  optionGroups = [],
  secondaryActions = [],
  extraRight,
  controlSize = "toolbar",
  searchSize = "toolbar",
  searchClassName,
}: FilterToolbarProps) {
  const sizeOptions = pageSizeOptions.map((size) => ({
    value: String(size),
    label: `${size}条/页`,
  }));
  const searchAriaLabel = searchScope === "full" ? "搜索全部字段" : `搜索${searchScope.join("、")}`;
  const resetText = typeof resetLabel === "string" ? resetLabel : "清除筛选";

  return (
    <FilterBar>
      {primaryAction && (
        <ActionButton
          onClick={primaryAction.onClick}
          disabled={primaryAction.disabled}
          type={primaryAction.type}
          variant={primaryAction.variant ?? "primary"}
        >
          {primaryAction.label}
        </ActionButton>
      )}

      {onKeywordChange && (
        <SearchInput
          value={keyword}
          onChange={onKeywordChange}
          placeholder={searchPlaceholder}
          ariaLabel={searchAriaLabel}
          size={searchSize}
          className={searchClassName ?? "min-w-0"}
        />
      )}

      {optionGroups.map((group, index) => (
        <ToolbarOptionGroup
          key={`option-group-${index}`}
          value={group.value}
          options={group.options}
          onChange={group.onChange}
          ariaLabel={group.ariaLabel}
        />
      ))}

      {children}

      {onReset && (
        <ActionButton
          onClick={onReset}
          aria-label={resetText}
          title={resetText}
        >
          {resetText}
        </ActionButton>
      )}

      {secondaryActions.map((action, index) => (
        <ActionButton
          key={`secondary-${index}`}
          onClick={action.onClick}
          disabled={action.disabled}
          type={action.type}
          variant={action.variant ?? "secondary"}
        >
          {action.label}
        </ActionButton>
      ))}

      <div className="flex-1" />

      {meta && <div className="shrink-0 text-xs font-medium text-slate-500">{meta}</div>}

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
          size={controlSize}
          selectClassName="!w-[6.5rem] !min-w-[6.5rem]"
        />
      )}

      {extraRight}
    </FilterBar>
  );
}
