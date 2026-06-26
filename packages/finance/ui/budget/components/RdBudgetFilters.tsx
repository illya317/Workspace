"use client";

import { FormSurface } from "@workspace/core/ui";
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
  total
}: RdBudgetFiltersProps) {
  const hasFilters = Boolean(projectFilter || categoryFilter);
  return <>
      <FormSurface
        kind="filters"
        fields={[
          {
            key: "project",
            label: "研发项目",
            spec: { valueType: "string", editor: "select", options: { source: "static", mode: "dropdown", items: projectOptions.map(p => ({ value: p, label: p })) } },
            value: projectFilter,
            onChange: (value) => setProjectFilter(String(value ?? "")),
            placeholder: "全部项目",
          },
          {
            key: "category",
            label: "产品类别",
            spec: { valueType: "string", editor: "select", options: { source: "static", mode: "dropdown", items: categoryOptions.map(c => ({ value: c, label: c })) } },
            value: categoryFilter,
            onChange: (value) => setCategoryFilter(String(value ?? "")),
            placeholder: "全部类别",
          },
        ]}
        actions={hasFilters ? [{
          key: "reset",
          label: "重置筛选",
          onClick: () => {
            setProjectFilter("");
            setCategoryFilter("");
          },
        }] : undefined}
      />
        <span className="ml-auto text-xs text-gray-400">
          共 {count} 条，合计 {total.toFixed(2)} 万元
        </span>
      {hasFilters && <div className="flex flex-wrap gap-2 text-xs text-gray-500">
          <span>当前筛选：</span>
          {projectFilter && <span className="rounded bg-slate-100 px-2 py-0.5">项目：{projectFilter}</span>}
          {categoryFilter && <span className="rounded bg-slate-100 px-2 py-0.5">类别：{categoryFilter}</span>}
        </div>}
    </>;
}
