"use client";

import { createPageBody, createPageDataBlock, type DataSurfaceColumnSpec, type DataSurfaceProps, PageSurface } from "@workspace/core/ui";
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
  return <PageSurface embedded kind="list" body={createPageBody([createPageDataBlock("rasci", buildProjectRasciMatrixSurface(rows))])} />;
}

export function buildProjectRasciMatrixSurface(rows: ProjectRasciRow[]): DataSurfaceProps<ProjectRasciRow> {
  const columns: DataSurfaceColumnSpec<ProjectRasciRow>[] = [
    {
      key: "name",
      label: "项目名称",
      required: true,
      cell: (row) => (
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-slate-900" title={row.name}>{row.name}</div>
          {row.subtitle && <div className="mt-1 text-xs font-medium text-emerald-600">{row.subtitle}</div>}
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
      cellClassName: "min-w-0",
      cell: (row) => <NameChips members={membersForColumn(row, column.role)} />,
    })),
  ];

  return {
    kind: "table",
    framed: true,
    title: "RASCI 矩阵",
    rows,
    columns,
    rowKey: (row) => `${row.kind}:${row.id}`,
    visibleColumns: PROJECT_RASCI_COLUMN_DEFS.map((column) => column.key),
    emptyText: "暂无项目",
    scrollClassName: "overflow-hidden",
  };
}

function membersForColumn(row: ProjectRasciRow, role: RasciColumn["role"]) {
  if (role === "负责人") return row.leader ? [row.leader] : [];
  return row.roleGroups[role] || [];
}

function NameChips({ members }: { members: EmployeeTag[] }) {
  if (members.length === 0) return <span className="block pt-2 text-center text-xs text-slate-300">-</span>;
  return (
    <div className="flex flex-wrap justify-center gap-1.5">
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
