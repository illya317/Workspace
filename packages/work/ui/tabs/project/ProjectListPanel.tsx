"use client";

import { SelectorPanel, type SplitWorkspaceMode } from "@workspace/core/ui";
import { projectCode, type ProjectItem, type ProjectListFilter } from "./model";

export default function ProjectListPanel({
  mode,
  projects,
  filter,
  selection,
  onSelect,
}: {
  mode: SplitWorkspaceMode;
  projects: ProjectItem[];
  filter: ProjectListFilter;
  selection: number | null;
  onSelect: (projectId: number) => void;
}) {
  return (
    <SelectorPanel
      className={mode === "drawer" ? "h-full overflow-hidden" : ""}
      bodyClassName={`${mode === "drawer" ? "h-full" : "max-h-[760px]"} overflow-auto p-3`}
      contentClassName="space-y-2"
      items={projects}
      selectedId={selection}
      onSelect={(project) => onSelect(project.id)}
      getKey={(project) => project.id}
      renderItem={(project) => ({
        title: <ProjectTitle name={project.name} status={project.status} />,
        subtitle: projectCode(project, null),
        archived: project.isArchived,
      })}
      emptyText={emptyTextForFilter(filter)}
    />
  );
}

function ProjectTitle({ name, status }: { name: string; status: string | null }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className="truncate">{name}</span>
      {status && (
        <span className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-medium ${projectStatusClassName(status)}`}>
          {status}
        </span>
      )}
    </span>
  );
}

function projectStatusClassName(status: string) {
  if (status === "进行中") return "bg-emerald-50 text-emerald-700";
  if (status === "已完成") return "bg-slate-100 text-slate-500";
  if (status === "已终止") return "bg-rose-50 text-rose-600";
  return "bg-sky-50 text-sky-700";
}

function emptyTextForFilter(filter: ProjectListFilter) {
  if (filter === "普通") return "暂无普通项目";
  if (filter === "重点") return "暂无重点项目";
  return "暂无项目";
}
