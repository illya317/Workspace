"use client";

import {
  ActionButton,
  EmptyStateCard,
  PanelCard,
  SearchInput,
  SelectorCard,
  type SplitWorkspaceMode,
} from "@workspace/core/ui";
import { projectCode, type ProjectItem } from "./model";

export default function ProjectListPanel({
  mode,
  keyword,
  onKeywordChange,
  projects,
  selection,
  onSelect,
  onClose,
}: {
  mode: SplitWorkspaceMode;
  keyword: string;
  onKeywordChange: (value: string) => void;
  projects: ProjectItem[];
  selection: number | null;
  onSelect: (projectId: number) => void;
  onClose: () => void;
}) {
  return (
    <PanelCard
      className={mode === "drawer" ? "h-full overflow-hidden" : ""}
      title="工作计划列表"
      subtitle="选择计划后维护主数据和人员角色。"
      actions={mode === "drawer" ? (
        <ActionButton onClick={onClose} className="px-2 py-1">
          关闭
        </ActionButton>
      ) : undefined}
    >
      <div className="border-b border-slate-200 p-3">
        <div className="space-y-3">
          <SearchInput
            value={keyword}
            onChange={onKeywordChange}
            placeholder="搜索计划名称、编码"
            size="page"
          />
        </div>
      </div>
      <div className={`${mode === "drawer" ? "h-[calc(100%-140px)]" : "max-h-[760px]"} space-y-2 overflow-auto p-3`}>
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
          <EmptyStateCard compact>暂无工作计划</EmptyStateCard>
        )}
      </div>
    </PanelCard>
  );
}
