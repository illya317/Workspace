"use client";

import {
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
      kind: "create",
      key: "create",
      section: "view",
      label: "新增合同",
      onClick: onCreate,
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
        </>
      ),
    },
    {
      kind: "action-group",
      key: "reset",
      actions: [{ key: "reset", kind: "refresh", label: "重置", onClick: onReset }],
    },
    {
      kind: "column-toggle",
      key: "columns",
      columns,
      visible: visibleColumns,
      onChange: onColumnsChange,
    },
  ];

  return (
    <div className="mb-4">
      <Toolbar items={items} />
    </div>
  );
}
