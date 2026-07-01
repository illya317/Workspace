"use client";

import { createStatusSection, type BodySurfaceSectionSpec, type DataSurfaceStructuredCellSpec } from "@workspace/core/ui";
import { PermissionActionMatrixGrid } from "../../../PermissionActionMatrixGrid";
import type { PermissionsTabState } from "../../hooks/usePermissionsTab";

interface MatrixTableProps {
  s: PermissionsTabState;
}

type MatrixSubject = PermissionsTabState["subjects"][number];

const ACCOUNT_COLUMN_WIDTHS = ["10rem", "10rem", "12rem", "12rem", "8rem", "9rem"];

function subjectContent(subject: MatrixSubject, subjectType: PermissionsTabState["subjectType"]) {
  return (
    <div className="flex min-w-0 flex-col">
      <span className="truncate font-medium text-slate-800">{subject.name}</span>
      {subjectType === "user" && subject.extra?.employeeId ? (
        <span className="truncate font-mono text-xs text-slate-400">{String(subject.extra.employeeId)}</span>
      ) : null}
      {subjectType !== "user" && subject.extra?.code ? (
        <span className="truncate font-mono text-xs text-slate-400">{String(subject.extra.code)}</span>
      ) : null}
      {subjectType === "user" && !subject.extra?.hasUser ? (
        <span className="truncate text-xs text-red-500">未关联账号</span>
      ) : null}
    </div>
  );
}

function accountActionClass(enabled = true) {
  return `inline-flex items-center justify-center rounded px-2 py-1 text-xs font-medium transition ${enabled ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100" : "bg-gray-100 text-gray-400"}`;
}

function makeAccountRows(s: PermissionsTabState): DataSurfaceStructuredCellSpec[][] {
  return [
    [
      { content: "姓名", header: true, width: "content" },
      { content: "用户名", header: true },
      { content: "直属部门", header: true },
      { content: "岗位", header: true },
      { content: "账号权限", header: true, align: "center" },
      { content: "重置密码", header: true, align: "center" },
    ],
    ...s.subjects.map((subject) => {
      const hasUser = Boolean(subject.extra?.hasUser && subject.extra?.userId);
      const canLogin = Boolean(subject.extra?.canLogin);
      const username = String(subject.extra?.username ?? "");
      const department = String(subject.extra?.department ?? "");
      const position = String(subject.extra?.position ?? "");
      return [
        { content: subjectContent(subject, s.subjectType), width: "content" as const },
        { content: <span className="font-mono text-slate-500">{username || "-"}</span> },
        { content: <span className="text-slate-600">{department || "-"}</span> },
        { content: <span className="text-slate-600">{position || "-"}</span> },
        {
          content: hasUser ? (
            <button
              type="button"
              className={accountActionClass(canLogin)}
              onClick={() => s.updateAccountLogin(subject, !canLogin)}
            >
              {canLogin ? "启用" : "停用"}
            </button>
          ) : (
            <span className="text-xs text-slate-400">未关联</span>
          ),
          align: "center" as const,
        },
        {
          content: hasUser ? (
            <button
              type="button"
              className={accountActionClass(true)}
              onClick={() => s.resetAccountPassword(subject)}
            >
              重置密码
            </button>
          ) : (
            <span className="text-xs text-slate-400">-</span>
          ),
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
    body: {
      kind: "document",
      document: {
        kind: "pages",
        pages: {
          items: [{
            key: "permission-matrix-grid",
            size: "fluid",
            content: (
              <PermissionActionMatrixGrid
                subjects={s.subjects}
                subjectColumnLabel={subjectColumnLabel}
                getSubjectKey={(subject) => String(subject.id)}
                renderSubject={(subject) => subjectContent(subject, s.subjectType)}
                getRecord={s.getPermissionRecord}
                expandedKeys={new Set(Array.from(s.expandedRows).map(String))}
                onToggleExpand={(subject) => s.toggleRowExpand(subject.id)}
                onToggleAction={(subject, state) => s.toggleGrant(subject, state.actionKey)}
                canToggleAction={(subject) => !(s.subjectType === "user" && !subject.extra?.hasUser)}
              />
            ),
          }],
        },
      },
    },
  };
}
