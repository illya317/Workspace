"use client";

import { SelectField } from "@workspace/core/ui";

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
  total,
}: DeptBudgetFiltersProps) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-3 rounded-lg bg-white p-3 shadow-sm">
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500">部门</label>
          <SelectField
            value={deptFilter}
            onChange={setDeptFilter}
            placeholder="全部部门"
            options={deptOptions.map((d) => ({ value: d, label: d }))}
            selectClassName="min-w-28 px-2 py-1 text-xs"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500">费用类型</label>
          <SelectField
            value={typeFilter}
            onChange={setTypeFilter}
            placeholder="全部类型"
            options={typeOptions.map((t) => ({ value: t, label: t }))}
            selectClassName="min-w-28 px-2 py-1 text-xs"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500">科目</label>
          <SelectField
            value={accountFilter}
            onChange={setAccountFilter}
            placeholder="全部科目"
            options={accountOptions.map((a) => ({ value: a, label: a }))}
            selectClassName="min-w-28 px-2 py-1 text-xs"
          />
        </div>
        {(deptFilter || typeFilter || accountFilter) && (
          <button
            onClick={() => { setDeptFilter(""); setTypeFilter(""); setAccountFilter(""); }}
            className="text-xs text-emerald-600 hover:text-emerald-700"
          >
            重置筛选
          </button>
        )}
        <span className="ml-auto text-xs text-gray-400">
          共 {count} 条，合计 {total.toFixed(2)} 万元
        </span>
      </div>
      {(deptFilter || typeFilter || accountFilter) && (
        <div className="flex flex-wrap gap-2 text-xs text-gray-500">
          <span>当前筛选：</span>
          {deptFilter && <span className="rounded bg-gray-100 px-2 py-0.5">部门：{deptFilter}</span>}
          {typeFilter && <span className="rounded bg-gray-100 px-2 py-0.5">类型：{typeFilter}</span>}
          {accountFilter && <span className="rounded bg-gray-100 px-2 py-0.5">科目：{accountFilter}</span>}
        </div>
      )}
    </>
  );
}
