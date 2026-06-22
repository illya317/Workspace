"use client";

import {
  EmptyStateCard,
  PanelCard,
  SelectorCard,
  type SplitWorkspaceMode,
} from "@workspace/core/ui";
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
    <PanelCard
      className={mode === "drawer" ? "h-full overflow-hidden" : ""}
      bodyClassName={`${mode === "drawer" ? "h-full" : "max-h-[760px]"} space-y-2 overflow-auto p-3`}
    >
      {projects.map((project) => (
        <SelectorCard
          key={project.id}
          title={project.name}
          subtitle={projectCode(project, null)}
          active={selection === project.id}
          archived={project.isArchived}
          trailing={`人 ${project.employeeCount}`}
          meta={[
            ...(project.status ? [project.status] : []),
            ...(project.isMilestone ? ["里程碑"] : []),
          ]}
          onClick={() => onSelect(project.id)}
        />
      ))}
      {projects.length === 0 && (
        <EmptyStateCard compact>{emptyTextForFilter(filter)}</EmptyStateCard>
      )}
    </PanelCard>
  );
}

function emptyTextForFilter(filter: ProjectListFilter) {
  if (filter === "department") return "暂无部门项目";
  if (filter === "subproject") return "暂无子项目";
  if (filter === "other") return "暂无其他项目";
  return "暂无项目";
}
