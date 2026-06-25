"use client";

import {
  ColumnToggle,
  CommandToolbar,
  CreateStartButton,
  RefreshActionButton,
  SearchInput,
  ToolbarSelectFilter,
} from "@workspace/core/ui";
import type { ColumnDef } from "@workspace/core/ui";

interface ContractFiltersProps {
  q: string;
  onQChange: (value: string) => void;
  categoryFilter: string;
  onCategoryChange: (value: string) => void;
  statusFilter: string;
  onStatusChange: (value: string) => void;
  categories: string[];
  statuses: string[];
  columns: ColumnDef[];
  visibleColumns: string[];
  onColumnsChange: (value: string[]) => void;
  onCreate: () => void;
  onReset: () => void;
}

export default function ContractFilters({
  q, onQChange,
  categoryFilter, onCategoryChange,
  statusFilter, onStatusChange,
  categories, statuses,
  columns, visibleColumns, onColumnsChange,
  onCreate, onReset,
}: ContractFiltersProps) {
  return (
    <div className="mb-4">
      <CommandToolbar
        viewControls={<CreateStartButton label="新增合同" onClick={onCreate} />}
        filters={(
          <>
            <SearchInput
              value={q}
              onChange={onQChange}
              placeholder="搜索合同名称、签署方、内容..."
            />
            <ToolbarSelectFilter
              label="类型"
              value={categoryFilter}
              onChange={onCategoryChange}
              placeholder="全部"
              options={categories.map((value) => ({ value, label: value }))}
            />
            <ToolbarSelectFilter
              label="状态"
              value={statusFilter}
              onChange={onStatusChange}
              placeholder="全部"
              options={statuses.map((value) => ({ value, label: value }))}
            />
            <ColumnToggle columns={columns} visible={visibleColumns} onChange={onColumnsChange} />
            <RefreshActionButton onClick={onReset} label="重置" />
          </>
        )}
      />
    </div>
  );
}
