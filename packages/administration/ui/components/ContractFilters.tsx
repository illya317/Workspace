"use client";

import { ActionButton, FilterToolbar, SelectField } from "@workspace/core/ui";

interface ContractFiltersProps {
  q: string;
  onQChange: (value: string) => void;
  locationFilter: string;
  onLocationChange: (value: string) => void;
  categoryFilter: string;
  onCategoryChange: (value: string) => void;
  statusFilter: string;
  onStatusChange: (value: string) => void;
  locations: string[];
  categories: string[];
  statuses: string[];
  onCreate: () => void;
}

export default function ContractFilters({
  q, onQChange,
  locationFilter, onLocationChange,
  categoryFilter, onCategoryChange,
  statusFilter, onStatusChange,
  locations, categories, statuses,
  onCreate,
}: ContractFiltersProps) {
  return (
    <div className="mb-4">
      <FilterToolbar
        keyword={q}
        onKeywordChange={onQChange}
        searchPlaceholder="搜索合同名称、签署方、内容..."
        extraRight={(
          <ActionButton onClick={onCreate} variant="primary">
            + 新增合同
          </ActionButton>
        )}
      >
        <SelectField
          value={locationFilter}
          onChange={onLocationChange}
          placeholder="全部位置"
          options={locations.map((value) => ({ value, label: value }))}
          size="toolbar"
          selectClassName="w-40"
        />
        <SelectField
          value={categoryFilter}
          onChange={onCategoryChange}
          placeholder="全部类型"
          options={categories.map((value) => ({ value, label: value }))}
          size="toolbar"
          selectClassName="w-40"
        />
        <SelectField
          value={statusFilter}
          onChange={onStatusChange}
          placeholder="全部状态"
          options={statuses.map((value) => ({ value, label: value }))}
          size="toolbar"
          selectClassName="w-40"
        />
      </FilterToolbar>
    </div>
  );
}
