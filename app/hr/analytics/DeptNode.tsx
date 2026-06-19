"use client";

import { useState } from "react";
import type { Department, EDP } from "./useAnalyticsData";

export default function DeptNode({
  dept,
  allDepts,
  edps,
  level = 0,
}: {
  dept: Department;
  allDepts: Department[];
  edps: EDP[];
  level?: number;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const children = allDepts.filter((d) => d.parentId === dept.id).sort((a, b) => a.id - b.id);
  const hasChildren = children.length > 0;

  const deptEdps = edps.filter((e) => e.departmentId === dept.id);
  const primaryCount = new Set(deptEdps.filter((e) => e.isPrimary).map((e) => e.employeeId)).size;

  const levelColors = [
    "bg-blue-50 text-blue-700 border-blue-200",
    "bg-emerald-50 text-emerald-700 border-emerald-200",
    "bg-amber-50 text-amber-700 border-amber-200",
  ];
  const badgeColors = [
    "bg-blue-100 text-blue-700",
    "bg-emerald-100 text-emerald-700",
    "bg-amber-100 text-amber-700",
  ];
  const colorCls = levelColors[level] || levelColors[2];
  const badgeCls = badgeColors[level] || badgeColors[2];

  return (
    <div className={`${level > 0 ? "ml-6 border-l-2 border-gray-200 pl-4" : ""}`}>
      <div className={`flex items-center gap-3 rounded-lg border p-3 my-2 ${colorCls} ${hasChildren ? "cursor-pointer" : ""}`}
        onClick={() => hasChildren && setCollapsed(!collapsed)}>
        {hasChildren && (
          <span className="text-xs text-gray-500 w-4 text-center select-none">{collapsed ? "▸" : "▾"}</span>
        )}
        {!hasChildren && <span className="w-4" />}
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${badgeCls}`}>
          L{level + 1}
        </span>
        <span className="text-sm font-medium flex-1">{dept.name}</span>
        <div className="flex gap-2">
          {dept.headcount > 0 && (
            <span className="text-xs bg-white/60 px-2 py-0.5 rounded font-medium">
              编制 {dept.headcount}
            </span>
          )}
          {primaryCount > 0 && (
            <span className="text-xs bg-white/60 px-2 py-0.5 rounded font-medium">
              主岗 {primaryCount}
            </span>
          )}
        </div>
        {dept.managerName && (
          <span className="text-xs opacity-60">负责人: {dept.managerName}</span>
        )}
      </div>

      {!collapsed && hasChildren && (
        <div>{children.map((child) => (
          <DeptNode key={child.id} dept={child} allDepts={allDepts} edps={edps} level={level + 1} />
        ))}</div>
      )}
    </div>
  );
}
