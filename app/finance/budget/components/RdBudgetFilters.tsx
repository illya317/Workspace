"use client";

import { PanelCard, SelectField } from "@workspace/core/ui";

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
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500">研发项目</label>
          <SelectField
            value={projectFilter}
            onChange={setProjectFilter}
            placeholder="全部项目"
            options={projectOptions.map((p) => ({ value: p, label: p }))}
            selectClassName="min-w-28 px-2 py-1 text-xs"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500">产品类别</label>
          <SelectField
            value={categoryFilter}
            onChange={setCategoryFilter}
            placeholder="全部类别"
            options={categoryOptions.map((c) => ({ value: c, label: c }))}
            selectClassName="min-w-28 px-2 py-1 text-xs"
          />
        </div>
        {(projectFilter || categoryFilter) && (
          <button
            onClick={() => { setProjectFilter(""); setCategoryFilter(""); }}
            className="text-xs text-emerald-600 hover:text-emerald-700"
          >
            重置筛选
          </button>
        )}
        <span className="ml-auto text-xs text-gray-400">
          共 {count} 条，合计 {total.toFixed(2)} 万元
        </span>
      </PanelCard>
      {(projectFilter || categoryFilter) && (
        <div className="flex flex-wrap gap-2 text-xs text-gray-500">
          <span>当前筛选：</span>
          {projectFilter && <span className="rounded bg-gray-100 px-2 py-0.5">项目：{projectFilter}</span>}
          {categoryFilter && <span className="rounded bg-gray-100 px-2 py-0.5">类别：{categoryFilter}</span>}
        </div>
      )}
    </>
  );
}
