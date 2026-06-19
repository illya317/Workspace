"use client";

import { AnalysisBlock, SearchInput } from "@workspace/core/ui";
import type { EnrichedPosition, SortKey } from "./usePositionData";

export default function PositionTable({
  filtered,
  search,
  setSearch,
  sortKey: _sortKey,
  sortDesc: _sortDesc,
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
    <AnalysisBlock
      title="岗位明细"
      toolbar={
        <div className="flex items-center gap-3">
        <SearchInput
          placeholder="搜索岗位名、编码、部门..."
          value={search}
          onChange={setSearch}
          size="toolbar"
          className="max-w-sm"
        />
        <span className="text-xs text-gray-400">共 {filtered.length} 个岗位</span>
        </div>
      }
    >

      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="sticky top-0 border-b border-slate-200 bg-slate-50 text-slate-500">
            <tr>
              <th className="cursor-pointer px-4 py-3 font-medium hover:bg-slate-100" onClick={() => handleSort("code")}>
                编码 {sortIcon("code")}
              </th>
              <th className="cursor-pointer px-4 py-3 font-medium hover:bg-slate-100" onClick={() => handleSort("name")}>
                岗位名 {sortIcon("name")}
              </th>
              <th className="cursor-pointer px-4 py-3 font-medium hover:bg-slate-100" onClick={() => handleSort("dept")}>
                部门 {sortIcon("dept")}
              </th>
              <th className="cursor-pointer px-4 py-3 text-right font-medium hover:bg-slate-100" onClick={() => handleSort("headcount")}>
                编制 {sortIcon("headcount")}
              </th>
              <th className="cursor-pointer px-4 py-3 text-right font-medium hover:bg-slate-100" onClick={() => handleSort("actual")}>
                实际 {sortIcon("actual")}
              </th>
              <th className="cursor-pointer px-4 py-3 text-right font-medium hover:bg-slate-100" onClick={() => handleSort("diff")}>
                差异 {sortIcon("diff")}
              </th>
              <th className="px-4 py-3 font-medium">状态</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-800">
            {filtered.map((p) => (
              <tr key={p.id} className={`hover:bg-emerald-50/20 ${
                p.status === "空岗" ? "bg-amber-50/30" : p.status === "超编" ? "bg-rose-50/30" : p.status === "缺编" ? "bg-purple-50/20" : ""
              }`}>
                <td className="px-4 py-3 font-mono text-slate-500">{p.code}</td>
                <td className="px-4 py-3 font-medium">{p.name}</td>
                <td className="px-4 py-3 text-slate-500">{p.departmentName || "—"}</td>
                <td className="px-4 py-3 text-right text-slate-500">{p.headcount || "—"}</td>
                <td className="px-4 py-3 text-right font-medium">{p.actual || "—"}</td>
                <td className="px-4 py-3 text-right">
                  {p.headcount > 0 ? (
                    <span className={`font-medium ${p.diff > 0 ? "text-rose-600" : p.diff < 0 ? "text-amber-600" : "text-emerald-600"}`}>
                      {p.diff > 0 ? `+${p.diff}` : p.diff === 0 ? "0" : p.diff}
                    </span>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-1.5 py-0.5 rounded ${
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
              <tr><td colSpan={7} className="py-8 text-center text-gray-400">暂无匹配数据</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </AnalysisBlock>
  );
}
