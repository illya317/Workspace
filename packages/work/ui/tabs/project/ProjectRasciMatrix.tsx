"use client";

import { createPageBody, createPageDataSection, type BodySurfaceSectionSpec, type DataSurfaceColumnSpec, type DataSurfaceProps, PageSurface } from "@workspace/core/ui";
import type { EmployeeTag, MultiProjectRole } from "./model";
import { PROJECT_RASCI_COLUMN_DEFS, type RasciColumn } from "./project-rasci-config";

export type ProjectRasciRow = {
  kind: "project" | "task";
  id: number;
  name: string;
  subtitle?: string | null;
  leader: EmployeeTag | null;
  roleGroups: Record<MultiProjectRole, EmployeeTag[]>;
};

export default function ProjectRasciMatrix({ rows }: { rows: ProjectRasciRow[] }) {
  return <PageSurface kind="standard" embedded body={createPageBody([createProjectRasciMatrixSection(rows)])} />;
}

export function createProjectRasciMatrixSection(rows: ProjectRasciRow[]): BodySurfaceSectionSpec {
  return {
    ...createPageDataSection("rasci", buildProjectRasciMatrixSurface(rows)),
    header: { title: "职责表" },
  };
}

export function buildProjectRasciMatrixSurface(rows: ProjectRasciRow[]): DataSurfaceProps<ProjectRasciRow> {
  const columns: DataSurfaceColumnSpec<ProjectRasciRow>[] = [
    {
      key: "name",
      label: "项目名称",
      required: true,
      width: "sm",
      wrap: "nowrap",
      cell: (row) => (
        <div className="flex min-w-[8em] max-w-44 items-center gap-2">
          <span className="truncate text-sm font-medium text-slate-900" title={row.name}>{row.name}</span>
          {row.subtitle ? (
            <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
              {row.subtitle}
            </span>
          ) : null}
        </div>
      ),
    },
    ...PROJECT_RASCI_COLUMN_DEFS.map((column): DataSurfaceColumnSpec<ProjectRasciRow> => ({
      key: column.key,
      label: (
        <div className="text-center">
          <div>{column.key}</div>
          <div className="mt-1 font-medium">{column.label}</div>
        </div>
      ),
      defaultVisible: true,
      align: "center",
      width: "xs",
      wrap: "wrap",
      cell: (row) => <NameChips members={membersForColumn(row, column.role)} />,
    })),
  ];

  return {
    kind: "table",
    rows,
    columns,
    rowKey: (row) => `${row.kind}:${row.id}`,
    visibleColumns: PROJECT_RASCI_COLUMN_DEFS.map((column) => column.key),
    emptyText: "暂无项目",
    scroll: { x: false },
  };
}

function membersForColumn(row: ProjectRasciRow, role: RasciColumn["role"]) {
  if (role === "负责人") return row.leader ? [row.leader] : [];
  return row.roleGroups[role] || [];
}

function NameChips({ members }: { members: EmployeeTag[] }) {
  if (members.length === 0) return <span className="block pt-2 text-center text-xs text-slate-300">-</span>;
  return (
    <div className="flex min-w-0 flex-wrap justify-center gap-1.5">
      {members.map((member) => (
        <span
          key={member.id}
          className="inline-flex max-w-full items-center rounded-full bg-sky-50 px-2.5 py-1 text-xs font-semibold text-slate-700 ring-1 ring-sky-100"
          title={member.employeeNumber ? `${member.name} ${member.employeeNumber}` : member.name}
        >
          <span className="truncate">{member.name}</span>
        </span>
      ))}
    </div>
  );
}
