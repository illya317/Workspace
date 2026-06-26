"use client";

import { Badge, CommandButton, FormField, InputControl, PanelCard } from "@workspace/core/ui";
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
  return <>
      <PanelCard bodyClassName="flex flex-wrap items-center gap-3 p-3">
        <FormField label="研发项目" layout="inline">
          <InputControl spec={{ valueType: "string", editor: "select", options: { source: "static", mode: "dropdown", items: projectOptions.map(p => ({ value: p, label: p })) } }} value={projectFilter} onChange={(value) => setProjectFilter(String(value ?? ""))} placeholder="全部项目" />
        </FormField>
        <FormField label="产品类别" layout="inline">
          <InputControl spec={{ valueType: "string", editor: "select", options: { source: "static", mode: "dropdown", items: categoryOptions.map(c => ({ value: c, label: c })) } }} value={categoryFilter} onChange={(value) => setCategoryFilter(String(value ?? ""))} placeholder="全部类别" />
        </FormField>
        {(projectFilter || categoryFilter) && <CommandButton onClick={() => {
        setProjectFilter("");
        setCategoryFilter("");
      }} className="border-0 px-2 py-1 text-xs shadow-none">
            重置筛选
          </CommandButton>}
        <span className="ml-auto text-xs text-gray-400">
          共 {count} 条，合计 {total.toFixed(2)} 万元
        </span>
      </PanelCard>
      {(projectFilter || categoryFilter) && <div className="flex flex-wrap gap-2 text-xs text-gray-500">
          <span>当前筛选：</span>
          {projectFilter && <Badge label={`项目：${projectFilter}`} tone="gray" />}
          {categoryFilter && <Badge label={`类别：${categoryFilter}`} tone="gray" />}
        </div>}
    </>;
}
