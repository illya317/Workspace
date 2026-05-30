"use client";

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
      <div className="flex flex-wrap items-center gap-3 rounded-lg bg-white p-3 shadow-sm">
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500">研发项目</label>
          <select
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1 text-xs focus:border-emerald-400 focus:outline-none"
          >
            <option value="">全部项目</option>
            {projectOptions.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500">产品类别</label>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1 text-xs focus:border-emerald-400 focus:outline-none"
          >
            <option value="">全部类别</option>
            {categoryOptions.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
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
      </div>
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
