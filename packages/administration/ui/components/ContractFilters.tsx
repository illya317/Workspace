"use client";

import {
  CreateStartButton,
  RefreshActionButton,
  SearchInput,
  SelectField,
  Toolbar,
} from "@workspace/core/ui";
import type { ColumnDef, ToolbarItem } from "@workspace/core/ui";

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
  const items: ToolbarItem[] = [
    {
      kind: "custom",
      key: "create",
      section: "view",
      content: <CreateStartButton label="新增合同" onClick={onCreate} />,
    },
    {
      kind: "custom",
      key: "filters",
      section: "filter",
      content: (
        <>
          <SearchInput
            value={q}
            onChange={onQChange}
            placeholder="搜索合同名称、签署方、内容..."
          />
          <SelectField
            label="类型"
            value={categoryFilter}
            onChange={onCategoryChange}
            placeholder="全部"
            options={categories.map((value) => ({ value, label: value }))}
          />
          <SelectField
            label="状态"
            value={statusFilter}
            onChange={onStatusChange}
            placeholder="全部"
            options={statuses.map((value) => ({ value, label: value }))}
          />
          <SelectField
            multiple
            summaryMode="count"
            label="字段"
            options={columns.map((column) => ({
              value: column.key,
              label: String(column.label),
              disabled: column.required,
            }))}
            value={visibleColumns}
            onChange={onColumnsChange}
          />
          <RefreshActionButton onClick={onReset} label="重置" />
        </>
      ),
    },
  ];

  return (
    <div className="mb-4">
      <Toolbar items={items} />
    </div>
  );
}
