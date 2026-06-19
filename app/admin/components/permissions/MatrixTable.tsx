"use client";

import { EmptyStateCard, PanelCard } from "@workspace/core/ui";
import MatrixRow from "./MatrixRow";
import type { PermissionsTabState } from "../../hooks/usePermissionsTab";

interface MatrixTableProps {
  s: PermissionsTabState;
}

export default function MatrixTable({ s }: MatrixTableProps) {
  if (!s.selectedResource) {
    return (
      <EmptyStateCard className="mt-4">请选择左侧资源模块</EmptyStateCard>
    );
  }

  if (s.subjects.length === 0) {
    return (
      <EmptyStateCard className="mt-4">无匹配结果</EmptyStateCard>
    );
  }

  return (
    <PanelCard className="mt-4" bodyClassName="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left text-xs font-medium text-gray-500">
            <th className="whitespace-nowrap pb-2 pr-3">
              {s.subjectType === "user"
                ? "姓名"
                : s.subjectType === "position"
                  ? "岗位"
                  : "部门"}
            </th>
            {s.roles.map((r) => (
              <th key={r.key} className="whitespace-nowrap pb-2 pr-3 text-center">
                {r.name}
              </th>
            ))}
            <th className="whitespace-nowrap pb-2 pr-3 text-center text-xs">最高业务权限</th>
            <th className="whitespace-nowrap pb-2"></th>
          </tr>
        </thead>
        <tbody>
          {s.subjects.map((subject) => (
            <MatrixRow key={subject.id} subject={subject} s={s} />
          ))}
        </tbody>
      </table>
    </PanelCard>
  );
}
