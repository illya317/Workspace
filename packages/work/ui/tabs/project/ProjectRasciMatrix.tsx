"use client";

import { createPageBody, createPageDataSection, type BodySurfaceSectionSpec, type DataSurfaceCellSpec, type DataSurfaceColumnSpec, type DataSurfaceProps, BodySurface } from "@workspace/core/ui";
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
  return <BodySurface {...createPageBody([createProjectRasciMatrixSection(rows)])} />;
}

export function createProjectRasciMatrixSection(rows: ProjectRasciRow[]): BodySurfaceSectionSpec {
  return {
    ...createPageDataSection("rasci", createProjectRasciMatrixSurface(rows)),
    header: { title: "职责表" },
  };
}

export function createProjectRasciMatrixSurface(rows: ProjectRasciRow[]): DataSurfaceProps<ProjectRasciRow> {
  const columns: DataSurfaceColumnSpec<ProjectRasciRow>[] = [
    {
      key: "name",
      label: "项目名称",
      required: true,
      width: "sm",
      wrap: "nowrap",
      cell: (row): DataSurfaceCellSpec => ({
        kind: "group",
        items: [
          { kind: "text", value: row.name, emphasis: "strong", wrap: "nowrap" },
          ...(row.subtitle ? [{ kind: "badge" as const, label: row.subtitle, tone: "emerald" as const }] : []),
        ],
      }),
    },
    ...PROJECT_RASCI_COLUMN_DEFS.map((column): DataSurfaceColumnSpec<ProjectRasciRow> => ({
      key: column.key,
      label: `${column.key} · ${column.label}`,
      defaultVisible: true,
      align: "center",
      width: "xs",
      wrap: "wrap",
      cell: (row): DataSurfaceCellSpec => ({
        kind: "selectionGrid",
        options: membersForColumn(row, column.role).map((member) => ({
          value: String(member.id),
          label: member.name,
          code: member.employeeNumber || undefined,
        })),
        mode: "readOnly",
        layout: "auto",
        truncate: true,
        emptyText: "-",
        ariaLabel: `${column.label}人员`,
      }),
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
