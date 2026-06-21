"use client";

import type { ReactNode } from "react";
import { TreeNodeBranch, TreeNodeCard } from "@workspace/core/ui";
import { departmentManagerPositionName } from "./draft-utils";
import type { Department, DepartmentPositionStats, Selection } from "./types";

const emptyStats: DepartmentPositionStats = {
  directPositions: 0,
  totalPositions: 0,
  directHeadcount: 0,
  totalHeadcount: 0,
};

export function DepartmentNode({
  department,
  level = 0,
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
  level?: number;
  departments: Department[];
  visibleDepartmentIds: Set<number> | null;
  selection: Selection;
  collapsedDepartments: Set<number>;
  search: string;
  departmentStats: Map<number, DepartmentPositionStats>;
  onSelect: (selection: Selection) => void;
  onToggle: (departmentId: number) => void;
}) {
  if (visibleDepartmentIds && !visibleDepartmentIds.has(department.id)) return null;
  const children = departments.filter((item) => item.parentId === department.id).sort((a, b) => a.id - b.id);
  const isSelected = selection?.type === "department" && selection.id === department.id;
  const hasChildren = children.length > 0;
  const isCollapsed = !search.trim() && collapsedDepartments.has(department.id);
  const stats = departmentStats.get(department.id) ?? emptyStats;

  return (
    <div className={level > 0 ? "ml-3 border-l border-slate-200 pl-2" : ""}>
      <TreeNodeCard
        title={department.name}
        code={department.code}
        level={department.level}
        active={isSelected}
        onClick={() => onSelect({ type: "department", id: department.id })}
        toggle={{
          enabled: hasChildren,
          expanded: !isCollapsed,
          label: isCollapsed ? "展开部门" : "收起部门",
          onClick: () => onToggle(department.id),
        }}
        meta={
          <span className="flex flex-wrap gap-2">
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600" title="含下级部门总岗位">
              总岗位 {stats.totalPositions}
            </span>
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600" title="含下级部门总编制">
              总编制 {stats.totalHeadcount}
            </span>
          </span>
        }
        className="my-2"
      />

      {!isCollapsed && children.map((child) => (
        <DepartmentNode
          key={child.id}
          department={child}
          level={level + 1}
          departments={departments}
          visibleDepartmentIds={visibleDepartmentIds}
          selection={selection}
          collapsedDepartments={collapsedDepartments}
          search={search}
          departmentStats={departmentStats}
          onSelect={onSelect}
          onToggle={onToggle}
        />
      ))}
    </div>
  );
}

export function OrganizationBranchNode({
  department,
  level = 0,
  departments,
  visibleDepartmentIds,
  collapsedDepartments,
  search,
  onToggle,
}: {
  department: Department;
  level?: number;
  departments: Department[];
  visibleDepartmentIds: Set<number> | null;
  collapsedDepartments: Set<number>;
  search: string;
  onToggle: (departmentId: number) => void;
}) {
  if (visibleDepartmentIds && !visibleDepartmentIds.has(department.id)) return null;
  const children = departments.filter((item) => item.parentId === department.id).sort((a, b) => a.id - b.id);
  const hasChildren = children.length > 0;
  const isCollapsed = !search.trim() && collapsedDepartments.has(department.id);
  const managerName = departmentManagerPositionName(department);
  const childNodes: ReactNode[] = !isCollapsed
    ? children.map((child) => (
      <OrganizationBranchNode
        key={child.id}
        department={child}
        level={level + 1}
        departments={departments}
        visibleDepartmentIds={visibleDepartmentIds}
        collapsedDepartments={collapsedDepartments}
        search={search}
        onToggle={onToggle}
      />
    )).filter(Boolean)
    : [];

  return (
    <TreeNodeBranch>
      <TreeNodeCard
        title={department.name}
        code={department.code}
        level={department.level}
        tone={level === 1 ? "blue" : "amber"}
        meta={managerName ? `负责人：${managerName} · 下级 ${children.length}` : `下级 ${children.length}`}
        titleClassName="text-sm"
        toggle={{
          enabled: hasChildren,
          expanded: !isCollapsed,
          label: isCollapsed ? "展开部门" : "收起部门",
          onClick: () => onToggle(department.id),
        }}
        onClick={() => hasChildren && onToggle(department.id)}
      >
        {childNodes.length > 0 ? childNodes : null}
      </TreeNodeCard>
    </TreeNodeBranch>
  );
}

export function OrganizationRootCard({
  department,
  active,
  departments,
  onSelect,
}: {
  department: Department;
  active: boolean;
  departments: Department[];
  onSelect: (departmentId: number) => void;
}) {
  const children = departments.filter((item) => item.parentId === department.id).sort((a, b) => a.id - b.id);
  const managerName = departmentManagerPositionName(department);

  return (
    <TreeNodeCard
      title={department.name}
      code={department.code}
      level={1}
      showToggle={false}
      active={active}
      meta={
        <span className="flex min-w-0 items-center gap-2">
          {managerName && <span className="min-w-0 flex-1 truncate whitespace-nowrap" title={`负责人：${managerName}`}>负责人：{managerName}</span>}
          <span className="shrink-0 whitespace-nowrap">下级 {children.length}</span>
        </span>
      }
      onClick={() => onSelect(department.id)}
    />
  );
}
