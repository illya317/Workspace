"use client";

import { ActionButton, DataTable, EmptyStateCard, PanelCard, type DataTableColumn } from "@workspace/core/ui";
import PermissionCell from "./PermissionCell";
import PermissionDetails from "./PermissionDetails";
import type { PermissionsTabState } from "../../hooks/usePermissionsTab";

interface MatrixTableProps {
  s: PermissionsTabState;
}

type MatrixSubject = PermissionsTabState["subjects"][number];

const ROLE_HIERARCHY: Record<string, number> = { access: 0, write: 1, delete: 2, admin: 3 };

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

  const maxLevel = ROLE_HIERARCHY[s.maxRoleKey] ?? 3;
  const subjectColumnLabel =
    s.subjectType === "user" ? "姓名" : s.subjectType === "position" ? "岗位" : "部门";

  const columns: DataTableColumn<MatrixSubject>[] = [
    {
      key: "subject",
      label: subjectColumnLabel,
      required: true,
      render: (subject) => {
        const hasNoUser = s.subjectType === "user" && !subject.extra?.hasUser;
        return (
          <div className="flex flex-col">
            <span className="font-medium text-slate-800">{subject.name}</span>
            {s.subjectType === "user" && !!subject.extra?.employeeId && (
              <span className="text-xs text-slate-400">{String(subject.extra.employeeId)}</span>
            )}
            {s.subjectType !== "user" && !!subject.extra?.code && (
              <span className="text-xs text-slate-400">{String(subject.extra.code)}</span>
            )}
            {hasNoUser && <span className="text-xs text-red-500">未关联账号</span>}
          </div>
        );
      },
    },
    ...s.roles.map<DataTableColumn<MatrixSubject>>((role) => ({
      key: role.key,
      label: role.name,
      required: true,
      headerClassName: "text-center",
      cellClassName: "text-center",
      render: (subject) => {
        const hasNoUser = s.subjectType === "user" && !subject.extra?.hasUser;
        const state = s.getPermissionState(subject, role.key);
        const roleLevel = ROLE_HIERARCHY[role.key] ?? 0;
        const exceeds = (role.key !== "admin" && roleLevel > maxLevel)
          || (role.key === "admin" && (!s.isSystemAdmin || s.selectedResource === "system"));

        if (exceeds) {
          return (
            <span
              className="text-xs text-slate-300"
              title={role.key === "admin" ? "仅系统管理员可分配管理权限" : `最高仅${s.maxRoleKey === "access" ? "访问" : s.maxRoleKey === "write" ? "编辑" : s.maxRoleKey === "delete" ? "删除" : "管理"}`}
            >
              —
            </span>
          );
        }

        return (
          <PermissionCell
            state={state}
            disabled={hasNoUser}
            onClick={() => s.toggleGrant(subject, role.key)}
          />
        );
      },
    })),
    {
      key: "maxRole",
      label: "最高业务权限",
      required: true,
      headerClassName: "text-center",
      cellClassName: "text-center",
      render: () => (
        <span className="text-xs text-slate-400">
          {s.maxRoleKey === "access" ? "访问" : s.maxRoleKey === "write" ? "编辑" : s.maxRoleKey === "delete" ? "删除" : "管理"}
        </span>
      ),
    },
    {
      key: "actions",
      label: "",
      required: true,
      cellClassName: "text-right",
      render: (subject) => (
        <ActionButton className="px-2 py-1 text-xs" onClick={() => s.toggleRowExpand(subject.id)}>
          {s.expandedRows.has(subject.id) ? "收起" : "详情"}
        </ActionButton>
      ),
    },
  ];

  return (
    <PanelCard className="mt-4">
      <DataTable
        rows={s.subjects}
        columns={columns}
        visibleColumns={columns.map((column) => column.key)}
        rowKey={(subject) => subject.id}
        expandedRowKeys={s.expandedRows}
        renderExpandedRow={(subject) => <PermissionDetails subject={subject} s={s} />}
      />
    </PanelCard>
  );
}
