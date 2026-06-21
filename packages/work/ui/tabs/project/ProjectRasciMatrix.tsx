"use client";

import { SectionCard } from "@workspace/core/ui";
import type { EmployeeTag, MultiProjectRole } from "./model";

export type ProjectRasciRow = {
  id: number;
  name: string;
  subtitle?: string | null;
  leader: EmployeeTag | null;
  roleGroups: Record<MultiProjectRole, EmployeeTag[]>;
};

type RasciColumn = {
  key: "A" | "R" | "S" | "C" | "I";
  label: string;
  role: "负责人" | MultiProjectRole;
};

const RASCI_COLUMNS: RasciColumn[] = [
  { key: "A", label: "负责", role: "负责人" },
  { key: "R", label: "执行", role: "执行负责" },
  { key: "S", label: "协作", role: "支持协作" },
  { key: "C", label: "咨询", role: "咨询参与" },
  { key: "I", label: "知会", role: "知会" },
];
const gridClassName = "grid-cols-[112px_repeat(5,minmax(0,1fr))] sm:grid-cols-[128px_repeat(5,minmax(0,1fr))]";

export default function ProjectRasciMatrix({ rows }: { rows: ProjectRasciRow[] }) {
  return (
    <SectionCard title="RASCI 矩阵" bodyClassName="p-0">
      {rows.length === 0 ? (
        <div className="px-4 py-8 text-sm text-slate-400">暂无项目</div>
      ) : (
        <div className="overflow-hidden">
          <div className="w-full">
            <div className={`grid ${gridClassName} border-b border-slate-100 bg-slate-50/80 text-xs font-semibold text-slate-500`}>
              <div className="px-3 py-3">项目名称</div>
              {RASCI_COLUMNS.map((column) => (
                <div key={column.key} className="px-2 py-3 text-center">
                  <div>{column.key}</div>
                  <div className="mt-1 font-medium">{column.label}</div>
                </div>
              ))}
            </div>
            {rows.map((row) => (
              <div key={row.id} className={`grid ${gridClassName} border-b border-slate-100 last:border-b-0`}>
                <div className="min-w-0 px-3 py-4">
                  <div className="truncate text-sm font-semibold text-slate-900" title={row.name}>{row.name}</div>
                  {row.subtitle && <div className="mt-1 text-xs font-medium text-emerald-600">{row.subtitle}</div>}
                </div>
                {RASCI_COLUMNS.map((column) => (
                  <div key={column.key} className="min-w-0 px-2 py-3">
                    <NameChips members={membersForColumn(row, column.role)} />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </SectionCard>
  );
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
