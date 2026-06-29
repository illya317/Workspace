"use client";

import { useMemo, useState } from "react";
import { createPageBody, createAnalysisSection, createMetricsSection, PageSurface, type DataSurfaceColumnSpec, type PageSurfaceSectionSpec, type VisualizationTreeNodeSpec } from "@workspace/core/ui";
import { matchSearchFields } from "@workspace/platform/search";
import type { Department, EDP } from "./useAnalyticsData";

export function useDepartmentAnalyticsBlocks({ departments, edps }: { departments: Department[]; edps: EDP[] }): PageSurfaceSectionSpec[] {
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
  const departmentTree = useMemo<VisualizationTreeNodeSpec[]>(() => {
    const departmentsByParent = new Map<number | null, Department[]>();
    departments.forEach((department) => {
      const siblings = departmentsByParent.get(department.parentId) ?? [];
      siblings.push(department);
      departmentsByParent.set(department.parentId, siblings);
    });
    departmentsByParent.forEach((siblings) => siblings.sort((a, b) => a.id - b.id));

    const primaryCountByDepartment = new Map<number, Set<number>>();
    activeEdps.forEach((edp) => {
      if (!edp.isPrimary || !edp.departmentId) return;
      const employeeIds = primaryCountByDepartment.get(edp.departmentId) ?? new Set<number>();
      employeeIds.add(edp.employeeId);
      primaryCountByDepartment.set(edp.departmentId, employeeIds);
    });

    const toTreeNode = (department: Department, level: number): VisualizationTreeNodeSpec => {
      const primaryCount = primaryCountByDepartment.get(department.id)?.size ?? 0;
      return {
        key: String(department.id),
        label: department.name,
        subtitle: department.managerName ? `负责人: ${department.managerName}` : undefined,
        level,
        badges: [
          ...(department.headcount > 0 ? [{ key: "headcount", label: `编制 ${department.headcount}` }] : []),
          ...(primaryCount > 0 ? [{ key: "primary", label: `主岗 ${primaryCount}` }] : []),
        ],
        children: (departmentsByParent.get(department.id) ?? []).map((child) => toTreeNode(child, level + 1)),
      };
    };

    return rootDepts.map((department) => toTreeNode(department, 0));
  }, [activeEdps, departments, rootDepts]);
  const columns = useMemo<DataSurfaceColumnSpec<(typeof stats.deptWithHeadcount)[number]>[]>(() => [
    { key: "name", label: "部门", required: true, emphasis: "medium", cell: (department) => department.name },
    {
      key: "level",
      label: "层级",
      required: true,
      cell: (department) => ({ kind: "badge", level: department.level }),
    },
    { key: "company", label: "公司", required: true, tone: "muted", cell: (department) => department.company },
    { key: "actual", label: "实际人数", required: true, align: "right",  emphasis: "medium", cell: (department) => department.actual },
    { key: "headcount", label: "编制", required: true, align: "right",  tone: "muted", cell: (department) => department.headcount || "—" },
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

  return [
        createMetricsSection("stats", {
            metrics: [
              { key: "departments", label: "部门总数", value: departments.length },
              { key: "l1", label: "事业部(L1)", value: stats.l1 },
              { key: "l2", label: "部门(L2)", value: stats.l2 },
              { key: "l3", label: "子部门(L3)", value: stats.l3 },
              { key: "primaryActive", label: "在职主岗人数", value: new Set(activeEdps.filter((e) => e.isPrimary).map((e) => e.employeeId)).size },
            ],
          }),
        createAnalysisSection("department-tree", {
          title: "部门架构",
          toolbar: {
            items: [
              { kind: "search", key: "search", value: search, onChange: setSearch, placeholder: "搜索部门名称、编码、别名..." },
            ],
          },

          sections: [{
            key: "tree",
            body: { kind: "visualization", visualization: {
              kind: "chart",
              chart: {
                visual: {
                  kind: "tree",
                  nodes: departmentTree,
                  emptyText: "无匹配部门",
                  maxHeight: 600,
                },
              },
            } },
          }],
        }),
        createAnalysisSection("department-headcount", {
          title: "部门人数排行（主岗）",
          sections: [{
            key: "department-headcount-table",
            body: { kind: "data", data: {
              kind: "table",
              rows: stats.deptWithHeadcount.slice(0, 30),
              columns,
              visibleColumns: columns.map((column) => column.key),
              rowKey: (department) => department.id,
            } },
          }],
        }),
      ];
}

export default function DepartmentAnalytics(props: { departments: Department[]; edps: EDP[] }) {
  return <PageSurface kind="standard" body={createPageBody(useDepartmentAnalyticsBlocks(props))} />;
}
