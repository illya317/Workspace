"use client";

import { ActionGlyph, createStatusSection, type DataSurfaceColumnSpec, type BodySurfaceSectionSpec } from "@workspace/core/ui";
import PermissionCell from "./PermissionCell";
import PermissionDetails from "./PermissionDetails";
import type { PermissionsTabState } from "../../hooks/usePermissionsTab";
interface MatrixTableProps {
  s: PermissionsTabState;
}
type MatrixSubject = PermissionsTabState["subjects"][number];
const ROLE_HIERARCHY: Record<string, number> = {
  access: 0,
  write: 1,
  delete: 2,
  admin: 3
};

export function createPermissionMatrixSection({
  s
}: MatrixTableProps): BodySurfaceSectionSpec {
  if (!s.selectedResource) {
    return createStatusSection("empty-resource", { kind: "empty", content: "请选择左侧资源模块" });
  }
  if (s.subjects.length === 0) {
    return createStatusSection("empty-subjects", { kind: "empty", content: "无匹配结果" });
  }
  const maxLevel = ROLE_HIERARCHY[s.maxRoleKey] ?? 3;
  const subjectColumnLabel = s.subjectType === "user" ? "姓名" : s.subjectType === "position" ? "岗位" : "部门";
  const columns: DataSurfaceColumnSpec<MatrixSubject>[] = [{
    key: "subject",
    label: subjectColumnLabel,
    required: true,
    cell: subject => {
      const hasNoUser = s.subjectType === "user" && !subject.extra?.hasUser;
      return <div className="flex flex-col">
            <span className="font-medium text-slate-800">{subject.name}</span>
            {s.subjectType === "user" && !!subject.extra?.employeeId && <span className="text-xs text-slate-400">{String(subject.extra.employeeId)}</span>}
            {s.subjectType !== "user" && !!subject.extra?.code && <span className="text-xs text-slate-400">{String(subject.extra.code)}</span>}
            {hasNoUser && <span className="text-xs text-red-500">未关联账号</span>}
          </div>;
    }
  }, ...s.roles.map<DataSurfaceColumnSpec<MatrixSubject>>(role => ({
    key: role.key,
    label: role.name,
    required: true,
    align: "center",

    cell: subject => {
      const hasNoUser = s.subjectType === "user" && !subject.extra?.hasUser;
      const state = s.getPermissionState(subject, role.key);
      const roleLevel = ROLE_HIERARCHY[role.key] ?? 0;
      const exceeds = role.key !== "admin" && roleLevel > maxLevel || role.key === "admin" && !s.isSystemAdmin;
      if (exceeds) {
        return <span className="text-xs text-slate-300" title={role.key === "admin" ? "仅系统管理员可分配管理权限" : `最高仅${s.maxRoleKey === "access" ? "访问" : s.maxRoleKey === "write" ? "编辑" : s.maxRoleKey === "delete" ? "删除" : "管理"}`}>
              —
            </span>;
      }
      return <PermissionCell state={state} disabled={hasNoUser} onClick={() => s.toggleGrant(subject, role.key)} />;
    }
  })), {
    key: "maxRole",
    label: "最高业务权限",
    required: true,
    align: "center",

    cell: () => <span className="text-xs text-slate-400">
          {s.maxRoleKey === "access" ? "访问" : s.maxRoleKey === "write" ? "编辑" : s.maxRoleKey === "delete" ? "删除" : "管理"}
        </span>
  }, {
    key: "actions",
    label: "",
    required: true,
    align: "right",
    cell: subject => {
      const label = s.expandedRows.has(subject.id) ? "收起详情" : "查看详情";
      return (
        <button
          type="button"
          onClick={() => s.toggleRowExpand(subject.id)}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700"
          aria-label={label}
          title={label}
        >
          <ActionGlyph kind="view" className="h-4 w-4" />
        </button>
      );
    }
  }];
  return {
    key: "permission-matrix",
    body: { kind: "data", data: {
      kind: "table",
      rows: s.subjects,
      columns,
      visibleColumns: columns.map(column => column.key),
      rowKey: subject => subject.id,
      expandedRowKeys: s.expandedRows,
      expandedRowContent: subject => <PermissionDetails subject={subject} s={s} />,
    } },
  };
}
