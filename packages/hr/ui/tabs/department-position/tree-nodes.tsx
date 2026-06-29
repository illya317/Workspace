"use client";

import type { ReactNode } from "react";
import type { BodySurfaceSectionSpec } from "@workspace/core/ui";
import { departmentManagerPositionName } from "./draft-utils";
import type { Department, DepartmentPositionStats, Selection } from "./types";

const emptyStats: DepartmentPositionStats = {
  directPositions: 0,
  totalPositions: 0,
  directHeadcount: 0,
  totalHeadcount: 0,
};

function departmentChildren(departments: Department[], department: Department): Department[] {
  return departments.filter((item) => item.parentId === department.id).sort((a, b) => a.id - b.id);
}

function departmentStatsMeta(stats: DepartmentPositionStats): ReactNode {
  return (
    <span className="flex flex-wrap gap-2">
      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600" title="含下级部门总岗位">
        总岗位 {stats.totalPositions}
      </span>
      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600" title="含下级部门总编制">
        总编制 {stats.totalHeadcount}
      </span>
    </span>
  );
}

export function createDepartmentNodeSection({
  department,
  departments,
  visibleDepartmentIds,
  selection,
  collapsedDepartments,
  search,
  departmentStats,
  onSelect,
  onToggle,
}: {
  department: Department;
  departments: Department[];
  visibleDepartmentIds: Set<number> | null;
  selection: Selection;
  collapsedDepartments: Set<number>;
  search: string;
  departmentStats: Map<number, DepartmentPositionStats>;
  onSelect: (selection: Selection) => void;
  onToggle: (departmentId: number) => void;
}): BodySurfaceSectionSpec | null {
  if (visibleDepartmentIds && !visibleDepartmentIds.has(department.id)) return null;
  const isCollapsed = !search.trim() && collapsedDepartments.has(department.id);
  const expandedIds = isCollapsed
    ? new Set<number>()
    : new Set(
        departments
          .filter((d) => !collapsedDepartments.has(d.id))
          .map((d) => d.id),
      );

  function getChildren(item: Department): Department[] | undefined {
    const children = departmentChildren(departments, item);
    return children.length > 0 ? children : undefined;
  }

  return {
    key: `department-${department.id}`,
    body: {
      kind: "selector",
      selector: {
        kind: "tree",
        items: [department],
        selectedId: selection?.type === "department" ? selection.id : null,
        onSelect: (item: Department) => onSelect({ type: "department", id: item.id }),
        getKey: (item: Department) => item.id,
        getChildren,
        expandedIds,
        onToggle: (id: string | number) => onToggle(Number(id)),
        renderItem: (item: Department) => {
          const stats = departmentStats.get(item.id) ?? emptyStats;
          return {
            title: item.name,
            code: item.code,
            level: item.level,
            meta: departmentStatsMeta(stats),
          };
        },
      },
    },
  };
}

export function createOrganizationBranchSection({
  department,
  departments,
  visibleDepartmentIds,
  collapsedDepartments,
  search,
  onToggle,
}: {
  department: Department;
  departments: Department[];
  visibleDepartmentIds: Set<number> | null;
  collapsedDepartments: Set<number>;
  search: string;
  onToggle: (departmentId: number) => void;
}): BodySurfaceSectionSpec | null {
  if (visibleDepartmentIds && !visibleDepartmentIds.has(department.id)) return null;
  const isCollapsed = !search.trim() && collapsedDepartments.has(department.id);
  const expandedIds = isCollapsed
    ? new Set<number>()
    : new Set(
        departments
          .filter((d) => !collapsedDepartments.has(d.id))
          .map((d) => d.id),
      );

  function getChildren(item: Department): Department[] | undefined {
    const children = departmentChildren(departments, item);
    return children.length > 0 ? children : undefined;
  }

  return {
    key: `organization-branch-${department.id}`,
    body: {
      kind: "selector",
      selector: {
        kind: "tree",
        items: [department],
        selectedId: null,
        onSelect: (item: Department) => {
          const children = departmentChildren(departments, item);
          if (children.length > 0) onToggle(item.id);
        },
        getKey: (item: Department) => item.id,
        getChildren,
        expandedIds,
        onToggle: (id: string | number) => onToggle(Number(id)),
        renderItem: (item: Department, ctx) => {
          const children = departmentChildren(departments, item);
          const managerName = departmentManagerPositionName(item);
          return {
            title: item.name,
            code: item.code,
            level: item.level,
            tone: ctx.level === 1 ? "blue" : "amber",
            meta: managerName ? `负责人：${managerName} · 下级 ${children.length}` : `下级 ${children.length}`,
          };
        },
      },
    },
  };
}

export function createOrganizationRootSection({
  department,
  active,
  departments,
  onSelect,
}: {
  department: Department;
  active: boolean;
  departments: Department[];
  onSelect: (departmentId: number) => void;
}): BodySurfaceSectionSpec {
  const children = departmentChildren(departments, department);
  const managerName = departmentManagerPositionName(department);

  return {
    key: `organization-root-${department.id}`,
    body: {
      kind: "selector",
      selector: {
        kind: "list",
        items: [department],
        selectedId: active ? department.id : null,
        onSelect: (item: Department) => onSelect(item.id),
        getKey: (item: Department) => item.id,
        renderItem: () => ({
          title: department.name,
          code: department.code,
          level: 1,
          meta: [
            managerName && <span key="manager" className="min-w-0 flex-1 truncate whitespace-nowrap" title={`负责人：${managerName}`}>负责人：{managerName}</span>,
            <span key="children" className="shrink-0 whitespace-nowrap">下级 {children.length}</span>,
          ],
        }),
      },
    },
  };
}
