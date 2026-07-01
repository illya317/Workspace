"use client";

import { createPageBody, PageSurface, createInlineFieldsSection } from "@workspace/core/ui";
import type { BodySurfaceSectionSpec } from "@workspace/core/ui";
interface DeptBudgetFiltersProps {
  deptFilter: string;
  setDeptFilter: (v: string) => void;
  typeFilter: string;
  setTypeFilter: (v: string) => void;
  accountFilter: string;
  setAccountFilter: (v: string) => void;
  deptOptions: string[];
  typeOptions: string[];
  accountOptions: string[];
  count: number;
  total: number;
}
export default function DeptBudgetFilters({
  deptFilter,
  setDeptFilter,
  typeFilter,
  setTypeFilter,
  accountFilter,
  setAccountFilter,
  deptOptions,
  typeOptions,
  accountOptions,
  count,
  total
}: DeptBudgetFiltersProps) {
  return <PageSurface kind="standard" embedded body={createPageBody(createDeptBudgetFilterSections({
    deptFilter,
    setDeptFilter,
    typeFilter,
    setTypeFilter,
    accountFilter,
    setAccountFilter,
    deptOptions,
    typeOptions,
    accountOptions,
    count,
    total,
  }))} />;
}

export function createDeptBudgetFilterSections({
  deptFilter,
  setDeptFilter,
  typeFilter,
  setTypeFilter,
  accountFilter,
  setAccountFilter,
  deptOptions,
  typeOptions,
  accountOptions,
  count,
  total
}: DeptBudgetFiltersProps): BodySurfaceSectionSpec[] {
  const hasFilters = Boolean(deptFilter || typeFilter || accountFilter);
  return [
    createInlineFieldsSection("dept-budget-filters", [
      {
        key: "dept",
        label: "部门",
        spec: { valueType: "string", control: "choice", options: { source: "static", mode: "dropdown", items: deptOptions.map(d => ({ value: d, label: d })) } },
        value: deptFilter,
        onChange: (value) => setDeptFilter(String(value ?? "")),
        placeholder: "全部部门",
      },
      {
        key: "type",
        label: "费用类型",
        spec: { valueType: "string", control: "choice", options: { source: "static", mode: "dropdown", items: typeOptions.map(t => ({ value: t, label: t })) } },
        value: typeFilter,
        onChange: (value) => setTypeFilter(String(value ?? "")),
        placeholder: "全部类型",
      },
      {
        key: "account",
        label: "科目",
        spec: { valueType: "string", control: "choice", options: { source: "static", mode: "dropdown", items: accountOptions.map(a => ({ value: a, label: a })) } },
        value: accountFilter,
        onChange: (value) => setAccountFilter(String(value ?? "")),
        placeholder: "全部科目",
      },
    ], {
      kind: "filters",
      commands: hasFilters ? [{
        key: "reset",
        label: "重置筛选",
        icon: "reset",
        onClick: () => {
          setDeptFilter("");
          setTypeFilter("");
          setAccountFilter("");
        },
      }] : undefined,
    }),
    {
      key: "dept-budget-filter-summary",
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
                  {deptFilter && <span className="rounded bg-slate-100 px-2 py-0.5">部门：{deptFilter}</span>}
                  {typeFilter && <span className="rounded bg-slate-100 px-2 py-0.5">类型：{typeFilter}</span>}
                  {accountFilter && <span className="rounded bg-slate-100 px-2 py-0.5">科目：{accountFilter}</span>}
                </div>
              )}
            </div>
          ),
        },
      },
    },
  ];
}
