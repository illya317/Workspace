"use client";

import type { EnrichedPosition, SortKey } from "./usePositionData";

export default function PositionTable({
  filtered,
  search,
  setSearch,
  sortKey,
  sortDesc,
  handleSort,
  sortIcon,
}: {
  filtered: EnrichedPosition[];
  search: string;
  setSearch: (v: string) => void;
  sortKey: SortKey;
  sortDesc: boolean;
  handleSort: (key: SortKey) => void;
  sortIcon: (key: SortKey) => string;
}) {
  return (
    <div className="bg-white rounded-lg shadow-sm p-5">
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <h3 className="text-sm font-semibold text-gray-700">岗位明细</h3>
        <input
          type="text"
          placeholder="搜索岗位名、编码、部门..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 max-w-sm px-3 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:border-emerald-400"
        />
        <span className="text-xs text-gray-400">共 {filtered.length} 个岗位</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-white">
            <tr className="border-b text-gray-500">
              <th className="text-left py-2 px-2 cursor-pointer hover:bg-gray-50" onClick={() => handleSort("code")}>
                编码 {sortIcon("code")}
              </th>
              <th className="text-left py-2 px-2 cursor-pointer hover:bg-gray-50" onClick={() => handleSort("name")}>
                岗位名 {sortIcon("name")}
              </th>
              <th className="text-left py-2 px-2 cursor-pointer hover:bg-gray-50" onClick={() => handleSort("dept")}>
                部门 {sortIcon("dept")}
              </th>
              <th className="text-right py-2 px-2 cursor-pointer hover:bg-gray-50" onClick={() => handleSort("headcount")}>
                编制 {sortIcon("headcount")}
              </th>
              <th className="text-right py-2 px-2 cursor-pointer hover:bg-gray-50" onClick={() => handleSort("actual")}>
                实际 {sortIcon("actual")}
              </th>
              <th className="text-right py-2 px-2 cursor-pointer hover:bg-gray-50" onClick={() => handleSort("diff")}>
                差异 {sortIcon("diff")}
              </th>
              <th className="text-left py-2 px-2">状态</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.id} className={`border-b border-gray-50 hover:bg-gray-50 ${
                p.status === "空岗" ? "bg-amber-50/30" : p.status === "超编" ? "bg-rose-50/30" : p.status === "缺编" ? "bg-purple-50/20" : ""
              }`}>
                <td className="py-2 px-2 font-mono text-gray-500">{p.code}</td>
                <td className="py-2 px-2 font-medium">{p.name}</td>
                <td className="py-2 px-2 text-gray-500">{p.departmentName || "—"}</td>
                <td className="py-2 px-2 text-right text-gray-500">{p.headcount || "—"}</td>
                <td className="py-2 px-2 text-right font-medium">{p.actual || "—"}</td>
                <td className="py-2 px-2 text-right">
                  {p.headcount > 0 ? (
                    <span className={`font-medium ${p.diff > 0 ? "text-rose-600" : p.diff < 0 ? "text-amber-600" : "text-emerald-600"}`}>
                      {p.diff > 0 ? `+${p.diff}` : p.diff === 0 ? "0" : p.diff}
                    </span>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </td>
                <td className="py-2 px-2">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                    p.status === "超编" ? "bg-rose-100 text-rose-700" :
                    p.status === "缺编" ? "bg-purple-100 text-purple-700" :
                    p.status === "满编" ? "bg-emerald-100 text-emerald-700" :
                    p.status === "有任职" ? "bg-blue-100 text-blue-700" :
                    "bg-amber-100 text-amber-700"
                  }`}>{p.status}</span>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={7} className="py-4 text-center text-gray-400">暂无匹配数据</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
