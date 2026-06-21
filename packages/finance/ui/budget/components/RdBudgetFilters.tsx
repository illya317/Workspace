"use client";

import { ActionButton, FormField, PanelCard, SelectField, StatusBadge } from "@workspace/core/ui";

interface RdBudgetFiltersProps {
  projectFilter: string;
  setProjectFilter: (v: string) => void;
  categoryFilter: string;
  setCategoryFilter: (v: string) => void;
  projectOptions: string[];
  categoryOptions: string[];
  count: number;
  total: number;
}

export default function RdBudgetFilters({
  projectFilter,
  setProjectFilter,
  categoryFilter,
  setCategoryFilter,
  projectOptions,
  categoryOptions,
  count,
  total,
}: RdBudgetFiltersProps) {
  return (
    <>
      <PanelCard bodyClassName="flex flex-wrap items-center gap-3 p-3">
        <FormField label="研发项目" layout="inline">
          <SelectField
            value={projectFilter}
            onChange={setProjectFilter}
            placeholder="全部项目"
            options={projectOptions.map((p) => ({ value: p, label: p }))}
            selectClassName="min-w-28 px-2 py-1 text-xs"
          />
        </FormField>
        <FormField label="产品类别" layout="inline">
          <SelectField
            value={categoryFilter}
            onChange={setCategoryFilter}
            placeholder="全部类别"
            options={categoryOptions.map((c) => ({ value: c, label: c }))}
            selectClassName="min-w-28 px-2 py-1 text-xs"
          />
        </FormField>
        {(projectFilter || categoryFilter) && (
          <ActionButton
            onClick={() => { setProjectFilter(""); setCategoryFilter(""); }}
            className="border-0 px-2 py-1 text-xs shadow-none"
          >
            重置筛选
          </ActionButton>
        )}
        <span className="ml-auto text-xs text-gray-400">
          共 {count} 条，合计 {total.toFixed(2)} 万元
        </span>
      </PanelCard>
      {(projectFilter || categoryFilter) && (
        <div className="flex flex-wrap gap-2 text-xs text-gray-500">
          <span>当前筛选：</span>
          {projectFilter && <StatusBadge label={`项目：${projectFilter}`} variant="gray" />}
          {categoryFilter && <StatusBadge label={`类别：${categoryFilter}`} variant="gray" />}
        </div>
      )}
    </>
  );
}
