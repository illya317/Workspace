"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createBlockSurfaceSection, createPageBody, createPageTabsNavigation, createSplitPageBody, PageSurface, useFeedback } from "@workspace/core/ui";
import type { PageSurfaceProps, SelectorSurfaceProps } from "@workspace/core/ui";
import { getPageViewTabs } from "@workspace/platform/view-registry";
import type { WorkUser } from "@workspace/work/types";
import { useProjectDetailEditorBlock } from "./project/ProjectDetailEditor";
import ProjectGanttTab from "./project/ProjectGanttTab";
import ProjectPlanGanttTab from "./project/ProjectPlanGanttTab";
import { PROJECT_LIST_FILTER_OPTIONS, projectCode, type ProjectItem, type ProjectListFilter } from "./project/model";
import { useProjectTabModel } from "./project/use-project-tab-model";

export default function ProjectTab({ user }: { user: WorkUser }) {
  const tabs = useMemo(() => getPageViewTabs("/work/projects"), []);
  const [activeChild, setActiveChild] = useState("projects");
  const surface = {
    navigation: createPageTabsNavigation({
      items: tabs,
      active: "projects",
      activeChild,
      onChange: () => setActiveChild("projects"),
      onChildChange: setActiveChild,
    }),
  } satisfies ProjectChildSurfaceProps;
  if (activeChild === "projects-gantt") return <ProjectGanttTab user={user} surface={surface} />;
  if (activeChild === "project-plan-gantt") {
    return <ProjectPlanGanttTab requestedProjectId={requestedProjectId()} surface={surface} />;
  }
  return <ProjectLedgerTab user={user} surface={surface} />;
}

function requestedProjectId() {
  if (typeof window === "undefined") return null;
  const value = Number(new URLSearchParams(window.location.search).get("projectId") || "");
  return Number.isInteger(value) && value > 0 ? value : null;
}

type ProjectChildSurfaceProps = Pick<PageSurfaceProps, "navigation">;

function ProjectLedgerTab({ user, surface }: { user: WorkUser; surface?: ProjectChildSurfaceProps }) {
  const searchParams = useSearchParams();
  const requestedProjectId = Number(searchParams.get("projectId") || "");
  const model = useProjectTabModel(user, Number.isInteger(requestedProjectId) && requestedProjectId > 0 ? requestedProjectId : null);
  const feedback = useFeedback();
  const editorTitle = model.creating ? "新建项目" : model.selectedProject ? "项目信息" : "项目详情";
  const startDepartmentProjectCreate = () => {
    model.setProjectListFilter("普通");
    model.setProjectListOpen(true);
    model.setProjectListDrawerOpen(false);
    model.startCreateProject();
  };
  const confirmDeleteProject = async () => {
    if (!model.selectedProject) return;
    const ok = await feedback.confirmDelete({
      title: "删除项目",
      message: `确定删除项目「${model.selectedProject.name}」吗？此操作不可撤销。`,
      confirmLabel: "删除项目",
    });
    if (!ok) return;
    const result = await model.deleteSelectedProject();
    if (!result?.ok) {
      await feedback.confirm({
        title: "删除失败",
        message: result?.error || "删除项目失败",
        confirmLabel: "关闭",
        confirmDanger: true,
        showCancel: false,
      });
    }
  };
  const projectDetailBlock = useProjectDetailEditorBlock({
    editorTitle,
    dirty: model.dirty,
    draft: model.draft,
    selectedProject: model.selectedProject,
    canEditCurrent: model.canEditCurrent,
    canManageCurrent: model.canManageCurrent,
    canDeleteCurrent: model.canDeleteCurrent,
    saving: model.saving,
    canSave: model.canSave,
    rasciRows: model.rasciRows,
    creating: model.creating,
    onCancelCreate: model.cancelCreateProject,
    onDeleteProject: () => void confirmDeleteProject(),
    onSave: () => void model.saveProject(),
    onDraftChange: model.updateDraft,
    onLeaderChange: model.setLeader,
    onRoleMembersChange: model.setRoleMembers,
    onCreateChildProject: model.startCreateChildProject,
    onOpenProject: (projectId) => {
      model.setCreating(false);
      model.setProjectListFilter("all");
      model.setSelection(projectId);
    },
    onProjectTasksChanged: (projectId) => void model.loadSelectedTasks(projectId),
    onToast: model.setToast,
  });

  return (
    <PageSurface kind="standard"
      {...surface}
      toolbar={model.loading || model.error ? undefined : {
        items: [
              {
                kind: "panel-toggle",
                key: "mobile-side-toggle",
                icon: "panel-open",
                label: "显示项目列表",
                visibility: "mobile",
                onClick: () => model.setProjectListDrawerOpen(true),
              },
              {
                kind: "panel-toggle",
                key: "desktop-side-toggle",
                icon: model.projectListOpen ? "panel-open" : "panel-close",
                label: `${model.projectListOpen ? "隐藏" : "显示"}项目列表`,
                variant: model.projectListOpen ? "primary" : "secondary",
                visibility: "desktop",
                onClick: () => model.setProjectListOpen(!model.projectListOpen),
              },
              {
                kind: "option-group",
                key: "project-filter",
                section: "filter",
                value: model.projectListFilter,
                options: PROJECT_LIST_FILTER_OPTIONS,
                onChange: (value) => model.setProjectListFilter(value as ProjectListFilter),
                ariaLabel: "项目筛选",
              },
              ...(model.canCreateProject
                ? [{
                    kind: "create" as const,
                    key: "create-project",
                    label: "新建部门项目",
                    active: model.creating,
                    onClick: startDepartmentProjectCreate,
                  }]
                : []),
            ],
      }}
      body={createSplitPageBody({
        selector: projectListSelector(model.filteredProjects, model.projectListFilter, model.selection, (projectId) => {
          model.setCreating(false);
          model.setSelection(projectId);
          model.setProjectListDrawerOpen(false);
        }, model.loading, model.error),
        drawerSelector: projectListSelector(model.filteredProjects, model.projectListFilter, model.selection, (projectId) => {
          model.setCreating(false);
          model.setSelection(projectId);
          model.setProjectListDrawerOpen(false);
        }, model.loading, model.error),
        right: model.loading || model.error ? createPageBody([createBlockSurfaceSection("project-loading", {
          kind: "message",
          content: model.error || "加载中...",
          tone: model.error ? "danger" : "muted"
        })]) : projectDetailBlock,
        side: {
          label: "项目列表",
          open: model.projectListOpen,
          drawerOpen: model.projectListDrawerOpen,
          onOpenChange: model.setProjectListOpen,
          onDrawerOpenChange: model.setProjectListDrawerOpen,
          showControls: false,
        },
        layout: { ratio: [2, 8] },
      })}
			    />
  );
}

function projectListSelector(
  projects: ProjectItem[],
  filter: ProjectListFilter,
  selection: number | null,
  onSelect: (projectId: number) => void,
  loading: boolean,
  error: string | null,
): SelectorSurfaceProps<ProjectItem> {
  return {
    kind: "list",
    loading,
    loadingText: "加载中...",
    items: error ? [] : projects,
    selectedId: selection,
    onSelect: (project: ProjectItem) => onSelect(project.id),
    getKey: (project: ProjectItem) => project.id,
    renderItem: (project: ProjectItem) => ({
      title: project.name,
      code: project.status ?? undefined,
      subtitle: projectCode(project, null),
      archived: project.isArchived,
    }),
    emptyText: error || emptyTextForFilter(filter),
  };
}

function emptyTextForFilter(filter: ProjectListFilter) {
  if (filter === "普通") return "暂无普通项目";
  if (filter === "重点") return "暂无重点项目";
  return "暂无项目";
}
