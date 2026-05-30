"use client";

import PermissionCell from "./PermissionCell";
import PermissionDetails from "./PermissionDetails";
import type { PermissionsTabState } from "../../hooks/usePermissionsTab";

interface MatrixRowProps {
  subject: { id: number; name: string; extra?: Record<string, unknown> };
  s: PermissionsTabState;
}

export default function MatrixRow({ subject, s }: MatrixRowProps) {
  const isExpanded = s.expandedRows.has(subject.id);
  const hasNoUser = s.subjectType === "user" && !subject.extra?.hasUser;

  const ROLE_HIERARCHY: Record<string, number> = { access: 0, write: 1, delete: 2, admin: 3 };
  const maxLevel = ROLE_HIERARCHY[s.maxRoleKey] ?? 3;
  const isSysAdminSubject = s.subjectType === "user" && s.systemAdminIds.has(subject.id);

  return (
    <>
      <tr className="border-b border-gray-100 hover:bg-gray-50">
        <td className="whitespace-nowrap py-2 pr-3">
          <div className="flex flex-col">
            <span className="font-medium text-gray-800">{subject.name}</span>
            {s.subjectType === "user" && !!subject.extra?.employeeId && (
              <span className="text-xs text-gray-400">{String(subject.extra.employeeId)}</span>
            )}
            {s.subjectType !== "user" && !!subject.extra?.code && (
              <span className="text-xs text-gray-400">{String(subject.extra.code)}</span>
            )}
            {hasNoUser && (
              <span className="text-xs text-red-500">未关联账号</span>
            )}
          </div>
        </td>
        {s.roles.map((role) => {
          const state = s.getPermissionState(subject, role.key);
          const roleLevel = ROLE_HIERARCHY[role.key] ?? 0;
          const exceeds = (role.key !== "admin" && roleLevel > maxLevel)
            || (role.key === "admin" && !s.isSystemAdmin)
            || (role.key === "admin" && isSysAdminSubject);
          return (
            <td key={role.key} className="whitespace-nowrap py-2 pr-3 text-center">
              {exceeds ? (
                <span className="text-xs text-gray-300" title={role.key === "admin" ? "仅系统管理员可分配管理权限" : `最高仅${s.maxRoleKey === "access" ? "访问" : s.maxRoleKey === "write" ? "编辑" : s.maxRoleKey === "delete" ? "删除" : "管理"}`}>—</span>
              ) : (
                <PermissionCell
                  state={state}
                  disabled={hasNoUser}
                  onClick={() => s.toggleGrant(subject, role.key)}
                />
              )}
            </td>
          );
        })}
        <td className="whitespace-nowrap py-2 pr-3 text-center">
          <span className="text-xs text-gray-400">
            {s.maxRoleKey === "access" ? "访问" : s.maxRoleKey === "write" ? "编辑" : s.maxRoleKey === "delete" ? "删除" : "管理"}
          </span>
        </td>
        <td className="whitespace-nowrap py-2">
          <button
            onClick={() => s.toggleRowExpand(subject.id)}
            className="text-xs text-gray-400 hover:text-emerald-600"
          >
            {isExpanded ? "收起" : "详情"}
          </button>
        </td>
      </tr>
      {isExpanded && (
        <tr>
          <td colSpan={s.roles.length + 3} className="border-b border-gray-100 bg-gray-50 px-3 py-3">
            <PermissionDetails subject={subject} s={s} />
          </td>
        </tr>
      )}
    </>
  );
}
