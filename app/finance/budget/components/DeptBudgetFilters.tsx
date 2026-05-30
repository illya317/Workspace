"use client";

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
          <select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1 text-xs focus:border-emerald-400 focus:outline-none"
          >
            <option value="">全部部门</option>
            {deptOptions.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500">费用类型</label>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1 text-xs focus:border-emerald-400 focus:outline-none"
          >
            <option value="">全部类型</option>
            {typeOptions.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500">科目</label>
          <select
            value={accountFilter}
            onChange={(e) => setAccountFilter(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1 text-xs focus:border-emerald-400 focus:outline-none"
          >
            <option value="">全部科目</option>
            {accountOptions.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
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
