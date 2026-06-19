"use client";

import { useMemo, useState } from "react";
import DeptNode from "./DeptNode";
import type { Department, EDP } from "./useAnalyticsData";

export default function DepartmentAnalytics({ departments, edps }: { departments: Department[]; edps: EDP[] }) {
  const [search, setSearch] = useState("");

  const activeEdps = useMemo(() => edps.filter((e) => !e.endDate), [edps]);

  const stats = useMemo(() => {
    const l1 = departments.filter((d) => d.level === 1).length;
    const l2 = departments.filter((d) => d.level === 2).length;
    const l3 = departments.filter((d) => d.level === 3).length;

    const deptActualMap = new Map<number, Set<number>>();
    activeEdps.filter((e) => e.isPrimary && e.departmentId).forEach((e) => {
      const set = deptActualMap.get(e.departmentId!) || new Set();
      set.add(e.employeeId);
      deptActualMap.set(e.departmentId!, set);
    });
    const deptWithHeadcount = departments
      .map((d) => ({ ...d, actual: deptActualMap.get(d.id)?.size || 0 }))
      .sort((a, b) => b.actual - a.actual);

    return { l1, l2, l3, deptWithHeadcount };
  }, [departments, activeEdps]);

  const rootDepts = useMemo(() => {
    let roots = departments.filter((d) => !d.parentId).sort((a, b) => a.id - b.id);
    if (search.trim()) {
      const q = search.toLowerCase();
      const matched = new Set<number>();
      departments.forEach((d) => {
        if (
          d.name.toLowerCase().includes(q) ||
          (d.alias || "").toLowerCase().includes(q) ||
          d.code.toLowerCase().includes(q)
        ) {
          matched.add(d.id);
          let curr = d;
          while (curr.parentId) {
            matched.add(curr.parentId);
            const parent = departments.find((p) => p.id === curr.parentId);
            if (!parent) break;
            curr = parent;
          }
        }
      });
      roots = roots.filter((d) => matched.has(d.id));
    }
    return roots;
  }, [departments, search]);

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <div className="text-2xl font-bold text-gray-800">{departments.length}</div>
          <div className="mt-1 text-xs text-gray-500">部门总数</div>
        </div>
        <div className="bg-blue-50 rounded-lg p-4">
          <div className="text-2xl font-bold text-blue-700">{stats.l1}</div>
          <div className="mt-1 text-xs text-blue-600">事业部(L1)</div>
        </div>
        <div className="bg-emerald-50 rounded-lg p-4">
          <div className="text-2xl font-bold text-emerald-700">{stats.l2}</div>
          <div className="mt-1 text-xs text-emerald-600">部门(L2)</div>
        </div>
        <div className="bg-amber-50 rounded-lg p-4">
          <div className="text-2xl font-bold text-amber-700">{stats.l3}</div>
          <div className="mt-1 text-xs text-amber-600">子部门(L3)</div>
        </div>
        <div className="bg-purple-50 rounded-lg p-4">
          <div className="text-2xl font-bold text-purple-700">{new Set(activeEdps.filter((e) => e.isPrimary).map((e) => e.employeeId)).size}</div>
          <div className="mt-1 text-xs text-purple-600">在职主岗人数</div>
        </div>
      </div>

      {/* Search */}
      <div className="bg-white rounded-lg shadow-sm p-4">
        <div className="flex items-center gap-3 mb-4">
          <h3 className="text-sm font-semibold text-gray-700">部门架构</h3>
          <input
            type="text"
            placeholder="搜索部门名称、编码、别名..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 max-w-sm px-3 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:border-emerald-400"
          />
        </div>

        <div className="max-h-[600px] overflow-y-auto pr-2">
          {rootDepts.map((d) => (
            <DeptNode key={d.id} dept={d} allDepts={departments} edps={activeEdps} level={0} />
          ))}
          {rootDepts.length === 0 && <p className="text-center text-gray-400 py-8 text-sm">无匹配部门</p>}
        </div>
      </div>

      {/* Dept headcount table */}
      <div className="bg-white rounded-lg shadow-sm p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">部门人数排行（主岗）</h3>
        <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b text-gray-500">
                <th className="text-left py-2 px-2">部门</th>
                <th className="text-left py-2 px-2">层级</th>
                <th className="text-left py-2 px-2">公司</th>
                <th className="text-right py-2 px-2">实际人数</th>
                <th className="text-right py-2 px-2">编制</th>
                <th className="text-left py-2 px-2">差异</th>
              </tr>
            </thead>
            <tbody>
              {stats.deptWithHeadcount.slice(0, 30).map((d) => {
                const diff = d.actual - (d.headcount || 0);
                return (
                  <tr key={d.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-2 px-2 font-medium">{d.name}</td>
                    <td className="py-2 px-2">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                        d.level === 1 ? "bg-blue-100 text-blue-700" :
                        d.level === 2 ? "bg-emerald-100 text-emerald-700" :
                        "bg-amber-100 text-amber-700"
                      }`}>
                        L{d.level}
                      </span>
                    </td>
                    <td className="py-2 px-2 text-gray-500">{d.company}</td>
                    <td className="py-2 px-2 text-right font-medium">{d.actual}</td>
                    <td className="py-2 px-2 text-right text-gray-500">{d.headcount || "—"}</td>
                    <td className="py-2 px-2">
                      {diff > 0 ? (
                        <span className="text-rose-600">+{diff} 超编</span>
                      ) : diff < 0 ? (
                        <span className="text-amber-600">{diff} 缺编</span>
                      ) : (
                        <span className="text-emerald-600">✓ 正常</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
