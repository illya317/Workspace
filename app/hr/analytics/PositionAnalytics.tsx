"use client";

import { useMemo, useState } from "react";
import type { Position, EDP, Department } from "./useAnalyticsData";

function StatCard({ label, value, sub, color = "emerald" }: { label: string; value: string | number; sub?: string; color?: string }) {
  const colorMap: Record<string, string> = {
    emerald: "bg-emerald-50 text-emerald-700",
    blue: "bg-blue-50 text-blue-700",
    amber: "bg-amber-50 text-amber-700",
    rose: "bg-rose-50 text-rose-700",
    purple: "bg-purple-50 text-purple-700",
  };
  return (
    <div className={`rounded-lg p-4 ${colorMap[color] || colorMap.emerald}`}>
      <div className="text-2xl font-bold">{value}</div>
      {sub && <div className="mt-1 text-[10px] opacity-70">{sub}</div>}
      <div className="mt-0.5 text-xs opacity-80">{label}</div>
    </div>
  );
}

export default function PositionAnalytics({ positions, edps, departments }: { positions: Position[]; edps: EDP[]; departments: Department[] }) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<"code" | "name" | "actual" | "headcount" | "diff" | "dept">("actual");
  const [sortDesc, setSortDesc] = useState(true);

  const activeEdps = useMemo(() => edps.filter((e) => !e.endDate), [edps]);

  const enriched = useMemo(() => {
    // 每个岗位的实际人数（仅在职、主岗）
    const actualMap = new Map<number, number>();
    const posPeople = new Map<number, Set<number>>();
    activeEdps.forEach((e) => {
      if (e.positionId && e.isPrimary) {
        const set = posPeople.get(e.positionId) || new Set();
        set.add(e.employeeId);
        posPeople.set(e.positionId, set);
      }
    });
    for (const [pid, s] of posPeople) actualMap.set(pid, s.size);

    return positions.map((p) => {
      const actual = actualMap.get(p.id) || 0;
      const hc = p.headcount || 0;
      const diff = actual - hc;
      return {
        ...p,
        actual,
        diff,
        status: hc > 0 ? (diff > 0 ? "超编" : diff < 0 ? "缺编" : "满编") : (actual > 0 ? "有任职" : "空岗"),
      };
    }) as (Position & { actual: number; diff: number; status: string })[];
  }, [positions, activeEdps]);

  const stats = useMemo(() => {
    const total = enriched.length;
    const occupied = enriched.filter((p) => p.actual > 0).length;
    const vacant = enriched.filter((p) => p.actual === 0).length;
    const overStaffed = enriched.filter((p) => p.headcount > 0 && p.actual > p.headcount).length;
    const underStaffed = enriched.filter((p) => p.headcount > 0 && p.actual < p.headcount).length;
    const hasHeadcount = enriched.filter((p) => p.headcount > 0).length;

    // 部门维度：每个部门的实际人数 vs 编制
    const deptMap = new Map<string, { actual: number; headcount: number; positions: number }>();
    enriched.forEach((p) => {
      const dn = p.departmentName || "未分配";
      const curr = deptMap.get(dn) || { actual: 0, headcount: 0, positions: 0 };
      curr.actual += p.actual;
      curr.headcount += p.headcount || 0;
      curr.positions++;
      deptMap.set(dn, curr);
    });

    const deptEntries = [...deptMap.entries()]
      .map(([name, d]) => ({ name, ...d, diff: d.actual - d.headcount }))
      .sort((a, b) => b.positions - a.positions);

    return { total, occupied, vacant, overStaffed, underStaffed, hasHeadcount, deptEntries };
  }, [enriched]);

  const filtered = useMemo(() => {
    let list = [...enriched];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.code.toLowerCase().includes(q) ||
          (p.alias || "").toLowerCase().includes(q) ||
          (p.departmentName || "").toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) => {
      let av: any, bv: any;
      switch (sortKey) {
        case "code": av = a.code; bv = b.code; break;
        case "name": av = a.name; bv = b.name; break;
        case "actual": av = a.actual; bv = b.actual; break;
        case "headcount": av = a.headcount; bv = b.headcount; break;
        case "diff": av = a.diff; bv = b.diff; break;
        case "dept": av = a.departmentName || ""; bv = b.departmentName || ""; break;
        default: av = a.actual; bv = b.actual;
      }
      if (typeof av === "string") return sortDesc ? bv.localeCompare(av) : av.localeCompare(bv);
      return sortDesc ? bv - av : av - bv;
    });
  }, [enriched, search, sortKey, sortDesc]);

  const handleSort = (key: typeof sortKey) => {
    if (sortKey === key) setSortDesc(!sortDesc);
    else { setSortKey(key); setSortDesc(true); }
  };

  const sortIcon = (key: typeof sortKey) => {
    if (sortKey !== key) return "↕";
    return sortDesc ? "↓" : "↑";
  };

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard label="岗位总数" value={stats.total} color="emerald" sub={`${stats.hasHeadcount} 个有编制`} />
        <StatCard label="有任职" value={stats.occupied} color="blue" sub={`占比 ${stats.total > 0 ? Math.round((stats.occupied / stats.total) * 100) : 0}%`} />
        <StatCard label="空岗" value={stats.vacant} color="amber" />
        <StatCard label="超编" value={stats.overStaffed} color="rose" sub="实际 > 编制" />
        <StatCard label="缺编" value={stats.underStaffed} color="purple" sub="实际 < 编制" />
      </div>

      {/* 部门编制对比 */}
      <div className="bg-white rounded-lg shadow-sm p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">各部门编制 vs 实际</h3>
        <div className="space-y-3">
          {stats.deptEntries.slice(0, 12).map((d) => {
            const maxBar = Math.max(d.headcount, d.actual, 1);
            const hcPct = Math.round((d.headcount / maxBar) * 100);
            const acPct = Math.round((d.actual / maxBar) * 100);
            return (
              <div key={d.name} className="flex items-center gap-3">
                <span className="w-28 shrink-0 text-xs text-gray-600 truncate" title={d.name}>{d.name}</span>
                <div className="flex-1 space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-gray-400 w-8">编制</span>
                    <div className="flex-1 h-4 bg-gray-100 rounded overflow-hidden">
                      <div className="h-full bg-sky-300 rounded" style={{ width: `${hcPct}%` }} />
                    </div>
                    <span className="text-[10px] text-gray-600 w-6 text-right">{d.headcount}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-gray-400 w-8">实际</span>
                    <div className="flex-1 h-4 bg-gray-100 rounded overflow-hidden">
                      <div className={`h-full rounded ${d.diff > 0 ? "bg-rose-400" : d.diff < 0 ? "bg-amber-400" : "bg-emerald-400"}`} style={{ width: `${acPct}%` }} />
                    </div>
                    <span className="text-[10px] text-gray-600 w-6 text-right">{d.actual}</span>
                  </div>
                </div>
                <span className={`text-[10px] w-12 text-right font-medium ${d.diff > 0 ? "text-rose-600" : d.diff < 0 ? "text-amber-600" : "text-emerald-600"}`}>
                  {d.diff > 0 ? `+${d.diff}` : d.diff === 0 ? "平衡" : d.diff}
                </span>
              </div>
            );
          })}
          {stats.deptEntries.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-4">暂无数据</p>
          )}
        </div>
      </div>

      {/* Position table */}
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

        <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
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
    </div>
  );
}
