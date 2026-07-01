"use client";

import { createPageBody, PageSurface, createInlineFieldsSection } from "@workspace/core/ui";
import type { BodySurfaceSectionSpec } from "@workspace/core/ui";
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
  return <PageSurface kind="standard" embedded body={createPageBody(createRdBudgetFilterSections({
    projectFilter,
    setProjectFilter,
    categoryFilter,
    setCategoryFilter,
    projectOptions,
    categoryOptions,
    count,
    total,
  }))} />;
}

export function createRdBudgetFilterSections({
  projectFilter,
  setProjectFilter,
  categoryFilter,
  setCategoryFilter,
  projectOptions,
  categoryOptions,
  count,
  total
}: RdBudgetFiltersProps): BodySurfaceSectionSpec[] {
  const hasFilters = Boolean(projectFilter || categoryFilter);
  return [
    createInlineFieldsSection("rd-budget-filters", [
      {
        key: "project",
        label: "研发项目",
        spec: { valueType: "string", control: "choice", options: { source: "static", mode: "dropdown", items: projectOptions.map(p => ({ value: p, label: p })) } },
        value: projectFilter,
        onChange: (value) => setProjectFilter(String(value ?? "")),
        placeholder: "全部项目",
      },
      {
        key: "category",
        label: "产品类别",
        spec: { valueType: "string", control: "choice", options: { source: "static", mode: "dropdown", items: categoryOptions.map(c => ({ value: c, label: c })) } },
        value: categoryFilter,
        onChange: (value) => setCategoryFilter(String(value ?? "")),
        placeholder: "全部类别",
      },
    ], {
      kind: "filters",
      commands: hasFilters ? [{
        key: "reset",
        label: "重置筛选",
        icon: "reset",
        onClick: () => {
          setProjectFilter("");
          setCategoryFilter("");
        },
      }] : undefined,
    }),
    {
      key: "rd-budget-filter-summary",
      body: {
        kind: "section",
        message: {
          tone: "muted",
          content: (
            <div className="space-y-2">
              <div>共 {count} 条，合计 {total.toFixed(2)} 万元</div>
              {hasFilters && (
                <div className="flex flex-wrap gap-2 text-xs">
                  <span>当前筛选：</span>
                  {projectFilter && <span className="rounded bg-slate-100 px-2 py-0.5">项目：{projectFilter}</span>}
                  {categoryFilter && <span className="rounded bg-slate-100 px-2 py-0.5">类别：{categoryFilter}</span>}
                </div>
              )}
            </div>
          ),
        },
      },
    },
  ];
}
