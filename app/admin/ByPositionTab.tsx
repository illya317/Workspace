"use client";

import FilterBar from "@/app/components/FilterBar";
import { useByPositionTab } from "./useByPositionTab";

interface Props {
  user: { id: number; name: string; isWorkListAdmin: boolean; isAnyGroupAdmin: boolean };
  resources: Array<{ id: number; key: string; name: string; description: string | null }>;
  showToast: (msg: string, type?: "success" | "error") => void;
}

export default function ByPositionTab({ user: _user, resources, showToast }: Props) {
  const {
    loading,
    filterCompany,
    setFilterCompany,
    filterDept,
    setFilterDept,
    searchText,
    setSearchText,
    companies,
    allDeptNames,
    filteredPositions,
    positionDeptMap,
    resourceGroups,
    grants,
    togglePerm,
    positionHasPerm,
  } = useByPositionTab(resources, showToast);

  if (loading) {
    return <p className="text-sm text-gray-500">加载中...</p>;
  }

  return (
    <div className="space-y-4">
      <FilterBar>
        <select
          value={filterCompany}
          onChange={(e) => {
            setFilterCompany(e.target.value);
            setFilterDept("");
          }}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none"
        >
          <option value="">全部公司</option>
          {companies.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={filterDept}
          onChange={(e) => setFilterDept(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none"
        >
          <option value="">全部部门</option>
          {allDeptNames.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder="搜索岗位编码/名称..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none"
        />
      </FilterBar>

      {filteredPositions.length === 0 && (
        <p className="py-8 text-center text-sm text-gray-400">暂无数据</p>
      )}

      {filteredPositions.map((pos) => {
        const depts = positionDeptMap.get(pos.id) || [];
        return (
          <div key={pos.id} className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <span className="mr-2 text-xs text-gray-400">{pos.code}</span>
                <span className="font-medium text-gray-800">{pos.name}</span>
                <span className="ml-2 text-xs text-gray-400">{pos.company}</span>
                {depts.length > 0 && (
                  <span className="ml-2 text-xs text-gray-400">
                    ({depts.join(", ")})
                  </span>
                )}
              </div>
              <span className="text-xs text-gray-400">{pos.headcount}人</span>
            </div>
            <div className="space-y-1.5">
              {(() => {
                const grouped = resourceGroups.filter((g) => g.children.length > 0);
                const standalone = resourceGroups.filter((g) => g.children.length === 0);
                return (
                  <>
                    {grouped.map(({ parent, children }) => (
                      <div key={parent.key} className="flex items-center gap-2">
                        <button
                          onClick={() =>
                            togglePerm(
                              pos.id,
                              parent.key,
                              !positionHasPerm(grants, pos.id, parent.key, "access")
                            )
                          }
                          className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
                            positionHasPerm(grants, pos.id, parent.key, "access")
                              ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                              : "border border-gray-200 bg-gray-50 text-gray-500 hover:bg-gray-100"
                          }`}
                        >
                          {parent.name}
                        </button>
                        <div className="flex flex-wrap gap-1.5">
                          {children.map((child) => {
                            const has = positionHasPerm(grants, pos.id, child.key, "access");
                            return (
                              <button
                                key={child.key}
                                onClick={() => togglePerm(pos.id, child.key, !has)}
                                className={`rounded-full px-2.5 py-0.5 text-xs transition-colors ${
                                  has
                                    ? "border border-emerald-200 bg-emerald-100 text-emerald-700"
                                    : "border border-gray-200 bg-gray-50 text-gray-400 hover:bg-gray-100"
                                }`}
                              >
                                {child.name}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                    {standalone.length > 0 && (
                      <div className="flex items-center gap-2">
                        <span className="shrink-0 rounded-lg border border-gray-100 bg-gray-50 px-3 py-1.5 text-sm font-semibold text-gray-400">
                          其他
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {standalone.map(({ parent }) => {
                            const has = positionHasPerm(grants, pos.id, parent.key, "access");
                            return (
                              <button
                                key={parent.key}
                                onClick={() => togglePerm(pos.id, parent.key, !has)}
                                className={`rounded-full px-2.5 py-0.5 text-xs transition-colors ${
                                  has
                                    ? "border border-emerald-200 bg-emerald-100 text-emerald-700"
                                    : "border border-gray-200 bg-gray-50 text-gray-400 hover:bg-gray-100"
                                }`}
                              >
                                {parent.name}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        );
      })}
    </div>
  );
}
