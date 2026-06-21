"use client";

import {
  EmptyStateCard,
  PanelCard,
  SelectorCard,
  type SplitWorkspaceMode,
} from "@workspace/core/ui";
import { projectCode, type ProjectItem } from "./model";

export default function ProjectListPanel({
  mode,
  projects,
  selection,
  onSelect,
}: {
  mode: SplitWorkspaceMode;
  projects: ProjectItem[];
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
            ...(project.priority ? [project.priority] : []),
          ]}
          onClick={() => onSelect(project.id)}
        />
      ))}
      {projects.length === 0 && (
        <EmptyStateCard compact>暂无项目</EmptyStateCard>
      )}
    </PanelCard>
  );
}
