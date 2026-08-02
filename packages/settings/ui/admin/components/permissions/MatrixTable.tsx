"use client";

import { createStatusSection, type BodySurfaceSectionSpec, type DataSurfaceCellSpec, type DataSurfaceStructuredCellSpec } from "@workspace/core/ui";
import { createPermissionActionMatrixSurface } from "@workspace/platform/ui/PermissionActionMatrixGrid";
import type { PermissionsTabState } from "../../hooks/usePermissionsTab";

interface MatrixTableProps {
  s: PermissionsTabState;
}

type MatrixSubject = PermissionsTabState["subjects"][number];

const ACCOUNT_COLUMN_WIDTHS = ["8rem", "10rem", "12rem", "12rem", "9rem"];

function accountSettingsCellContent(s: PermissionsTabState, subject: MatrixSubject, hasUser: boolean, canLogin: boolean): DataSurfaceCellSpec {
  if (!hasUser) return { kind: "text", value: "未关联", tone: "muted" };
  return {
    kind: "actions",
    align: "center",
    actions: [
      {
        key: `account-login-${subject.id}`,
        label: canLogin ? "停用账号" : "启用账号",
        icon: canLogin ? "lock" : "unlock",
        variant: "secondary",
        size: "sm",
        onClick: () => s.updateAccountLogin(subject, !canLogin),
      },
      {
        key: `reset-key-${subject.id}`,
        label: "重置 Key",
        icon: "reset",
        variant: "secondary",
        size: "sm",
        onClick: () => s.resetAccountApiKey(subject),
      },
    ],
  };
}

function subjectContent(subject: MatrixSubject, subjectType: PermissionsTabState["subjectType"]): DataSurfaceCellSpec {
  const code = subjectType === "user" ? subject.extra?.employeeId : subject.extra?.code;
  return { kind: "stack", gap: "xs", items: [
    { kind: "text", value: subject.name, emphasis: "medium", wrap: "truncate" },
    ...(code ? [{ kind: "text" as const, value: String(code), font: "mono" as const, tone: "muted" as const }] : []),
    ...(subjectType === "user" && !subject.extra?.hasUser ? [{ kind: "text" as const, value: "未关联账号", tone: "danger" as const }] : []),
  ] };
}

function makeAccountRows(s: PermissionsTabState): DataSurfaceStructuredCellSpec[][] {
  return [
    [
      { content: "姓名", header: true, width: "content" },
      { content: "用户名", header: true },
      { content: "直属部门", header: true },
      { content: "岗位", header: true },
      { content: "设置", header: true, align: "center" },
    ],
    ...s.subjects.map((subject) => {
      const hasUser = Boolean(subject.extra?.hasUser && subject.extra?.userId);
      const canLogin = Boolean(subject.extra?.canLogin);
      const username = String(subject.extra?.username ?? "");
      const department = String(subject.extra?.department ?? "");
      const position = String(subject.extra?.position ?? "");
      return [
        { content: subjectContent(subject, s.subjectType), width: "content" as const },
        { content: { kind: "text" as const, value: username || "-", font: "mono" as const, tone: "muted" as const } },
        { content: { kind: "text" as const, value: department || "-" } },
        { content: { kind: "text" as const, value: position || "-" } },
        {
          content: accountSettingsCellContent(s, subject, hasUser, canLogin),
          align: "center" as const,
        },
      ];
    }),
  ];
}

export function createPermissionMatrixSection({ s }: MatrixTableProps): BodySurfaceSectionSpec {
  if (!s.selectedResource) {
    return {
      key: "permission-accounts",
      body: {
        kind: "data",
        data: {
          kind: "structured",
          rows: makeAccountRows(s),
          colWidths: ACCOUNT_COLUMN_WIDTHS,
          structuredScroll: false,
          presentation: { rowHover: "none" },
        },
      },
    };
  }
  if (s.subjects.length === 0) {
    return createStatusSection("empty-subjects", { kind: "empty", content: "无匹配结果" });
  }

  const subjectColumnLabel = s.subjectType === "user" ? "姓名" : s.subjectType === "position" ? "岗位" : "部门";
  return {
    key: "permission-matrix",
    visibility: "desktop",
    body: { kind: "data", data: createPermissionActionMatrixSurface({
      subjects: s.subjects,
      subjectColumnLabel,
      getSubjectKey: (subject) => String(subject.id),
      renderSubject: (subject) => subjectContent(subject, s.subjectType),
      getRecord: s.getPermissionRecord,
      expandedKeys: new Set(Array.from(s.expandedRows).map(String)),
      onToggleExpand: (subject) => s.toggleRowExpand(subject.id),
      onToggleAction: (subject, state) => s.toggleGrant(subject, state.actionKey),
      canToggleAction: (subject) => s.subjectType !== "user" || (s.canManageUserGrants && Boolean(subject.extra?.hasUser)),
      hoveredAction: s.hoveredAction,
      onHoveredActionChange: s.setHoveredAction,
      visibleActionKeys: s.resourceActions,
    }) },
  };
}
