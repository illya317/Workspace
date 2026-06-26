"use client";

import { useMemo, useState } from "react";
import { PageSurface, type DataSurfaceColumnSpec } from "@workspace/core/ui";
import { matchSearchFields } from "@workspace/platform/search";
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
      const matched = new Set<number>();
      departments.forEach((d) => {
        if (matchSearchFields(d, search, ["name", "alias", "code"])) {
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
  const columns = useMemo<DataSurfaceColumnSpec<(typeof stats.deptWithHeadcount)[number]>[]>(() => [
    { key: "name", label: "部门", required: true, cellClassName: "font-medium", cell: (department) => department.name },
    {
      key: "level",
      label: "层级",
      required: true,
      cell: (department) => ({ kind: "badge", level: department.level }),
    },
    { key: "company", label: "公司", required: true, cellClassName: "text-slate-500", cell: (department) => department.company },
    { key: "actual", label: "实际人数", required: true, headerClassName: "text-right", cellClassName: "text-right font-medium", cell: (department) => department.actual },
    { key: "headcount", label: "编制", required: true, headerClassName: "text-right", cellClassName: "text-right text-slate-500", cell: (department) => department.headcount || "—" },
    {
      key: "diff",
      label: "差异",
      required: true,
      cell: (department) => {
        const diff = department.actual - (department.headcount || 0);
        if (diff > 0) return <span className="text-rose-600">+{diff} 超编</span>;
        if (diff < 0) return <span className="text-amber-600">{diff} 缺编</span>;
        return <span className="text-emerald-600">正常</span>;
      },
    },
  ], []);

  return (
    <PageSurface
      kind="analysis"
      blocks={[
        {
          kind: "data",
          key: "stats",
          surface: {
            kind: "metrics",
            metrics: [
              { key: "departments", label: "部门总数", value: departments.length },
              { key: "l1", label: "事业部(L1)", value: stats.l1 },
              { key: "l2", label: "部门(L2)", value: stats.l2 },
              { key: "l3", label: "子部门(L3)", value: stats.l3 },
              { key: "primaryActive", label: "在职主岗人数", value: new Set(activeEdps.filter((e) => e.isPrimary).map((e) => e.employeeId)).size },
            ],
          },
        },
        {
          kind: "analysis",
          key: "department-tree",
          title: "部门架构",
          toolbar: {
            items: [
              { kind: "search", key: "search", value: search, onChange: setSearch, placeholder: "搜索部门名称、编码、别名...", className: "max-w-sm" },
            ],
          },
          bodyClassName: "p-4",
          blocks: [{
            kind: "moduleView",
            key: "tree",
            view: (
              <div className="max-h-[600px] overflow-y-auto pr-2">
                {rootDepts.map((d) => (
                  <DeptNode key={d.id} dept={d} allDepts={departments} edps={activeEdps} level={0} />
                ))}
                {rootDepts.length === 0 && <p className="text-center text-gray-400 py-8 text-sm">无匹配部门</p>}
              </div>
            ),
          }],
        },
        {
          kind: "analysis",
          key: "department-headcount",
          title: "部门人数排行（主岗）",
          blocks: [{
            kind: "data",
            key: "department-headcount-table",
            surface: {
              kind: "table",
              rows: stats.deptWithHeadcount.slice(0, 30),
              columns,
              visibleColumns: columns.map((column) => column.key),
              rowKey: (department) => department.id,
            },
          }],
        },
      ]}
    />
  );
}
