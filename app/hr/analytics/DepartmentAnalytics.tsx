"use client";

import { useMemo, useState } from "react";
import { AnalysisBlock, MetricCard, SearchInput } from "@workspace/core/ui";
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
        <MetricCard label="部门总数" value={departments.length} />
        <MetricCard label="事业部(L1)" value={stats.l1} />
        <MetricCard label="部门(L2)" value={stats.l2} />
        <MetricCard label="子部门(L3)" value={stats.l3} />
        <MetricCard label="在职主岗人数" value={new Set(activeEdps.filter((e) => e.isPrimary).map((e) => e.employeeId)).size} />
      </div>

      {/* Search */}
      <AnalysisBlock
        title="部门架构"
        toolbar={
          <SearchInput
            placeholder="搜索部门名称、编码、别名..."
            value={search}
            onChange={setSearch}
            size="toolbar"
            className="max-w-sm"
          />
        }
        bodyClassName="p-4"
      >

        <div className="max-h-[600px] overflow-y-auto pr-2">
          {rootDepts.map((d) => (
            <DeptNode key={d.id} dept={d} allDepts={departments} edps={activeEdps} level={0} />
          ))}
          {rootDepts.length === 0 && <p className="text-center text-gray-400 py-8 text-sm">无匹配部门</p>}
        </div>
      </AnalysisBlock>

      {/* Dept headcount table */}
      <AnalysisBlock title="部门人数排行（主岗）">
        <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="sticky top-0 border-b border-slate-200 bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">部门</th>
                <th className="px-4 py-3 font-medium">层级</th>
                <th className="px-4 py-3 font-medium">公司</th>
                <th className="px-4 py-3 text-right font-medium">实际人数</th>
                <th className="px-4 py-3 text-right font-medium">编制</th>
                <th className="px-4 py-3 font-medium">差异</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-800">
              {stats.deptWithHeadcount.slice(0, 30).map((d) => {
                const diff = d.actual - (d.headcount || 0);
                return (
                  <tr key={d.id} className="hover:bg-emerald-50/20">
                    <td className="px-4 py-3 font-medium">{d.name}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        d.level === 1 ? "bg-blue-100 text-blue-700" :
                        d.level === 2 ? "bg-emerald-100 text-emerald-700" :
                        "bg-amber-100 text-amber-700"
                      }`}>
                        L{d.level}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{d.company}</td>
                    <td className="px-4 py-3 text-right font-medium">{d.actual}</td>
                    <td className="px-4 py-3 text-right text-slate-500">{d.headcount || "—"}</td>
                    <td className="px-4 py-3">
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
      </AnalysisBlock>
    </div>
  );
}
