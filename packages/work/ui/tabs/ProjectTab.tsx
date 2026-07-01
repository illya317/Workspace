"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createBodySplitSection, createMessageSection, createPageBody, PageSurface, useFeedback } from "@workspace/core/ui";
import type { PageSurfaceProps, SelectorSurfaceProps } from "@workspace/core/ui";
import { createSpaceKindNavigation, createSpaceViewToolbarItem, type SpaceWorkbenchKindOption } from "@workspace/platform/ui";
import { getPageViewTabs } from "@workspace/platform/view-registry";
import type { WorkUser } from "@workspace/work/types";
import { useProjectDetailEditorSection } from "./project/ProjectDetailEditor";
import ProjectGanttTab from "./project/ProjectGanttTab";
import ProjectPlanGanttTab from "./project/ProjectPlanGanttTab";
import { PROJECT_LIST_FILTER_OPTIONS, projectCode, type ProjectItem, type ProjectListFilter } from "./project/model";
import { useProjectTabModel } from "./project/use-project-tab-model";

export default function ProjectTab({ user }: { user: WorkUser }) {
  const searchParams = useSearchParams();
  const tabs = useMemo(() => getPageViewTabs("/work/projects"), []);
  const [activeChild, setActiveChild] = useState("projects");
  const requestedProjectIdValue = Number(searchParams.get("projectId") || "");
  const requestedProjectId = Number.isInteger(requestedProjectIdValue) && requestedProjectIdValue > 0 ? requestedProjectIdValue : null;
  const surface = {
    toolbar: {
      items: [
        createSpaceViewToolbarItem({
          key: "project-view",
          value: activeChild,
          options: tabs.flatMap((tab) => tab.children?.length
            ? tab.children.map((child) => ({ key: child.key, label: String(child.label) }))
            : [{ key: tab.key, label: String(tab.label) }]),
          onChange: setActiveChild,
          ariaLabel: "项目视图",
        }),
      ],
    },
  } satisfies ProjectChildSurfaceProps;
  if (activeChild === "projects-gantt") return <ProjectGanttTab user={user} surface={surface} />;
  if (activeChild === "project-plan-gantt") {
    return <ProjectPlanGanttTab requestedProjectId={requestedProjectId} surface={surface} />;
  }
  return <ProjectLedgerTab user={user} surface={surface} />;
}

type ProjectChildSurfaceProps = Pick<PageSurfaceProps, "navigation" | "toolbar">;

const PROJECT_SCOPE_OPTIONS: SpaceWorkbenchKindOption[] = [
  { key: "company", label: "运营委员会" },
  { key: "department", label: "部门" },
  { key: "other", label: "其他" },
];

function ProjectLedgerTab({ user, surface }: { user: WorkUser; surface?: ProjectChildSurfaceProps }) {
  const searchParams = useSearchParams();
  const requestedProjectId = Number(searchParams.get("projectId") || "");
  const model = useProjectTabModel(user, Number.isInteger(requestedProjectId) && requestedProjectId > 0 ? requestedProjectId : null);
  const feedback = useFeedback();
  const editorTitle = model.creating ? "新建项目" : model.selectedProject ? "项目信息" : "项目详情";
  const startProjectCreate = () => {
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
  const projectDetailSection = useProjectDetailEditorSection({
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
              ...(surface?.toolbar?.items ?? []),
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
                value: model.projectListFilter,
                options: PROJECT_LIST_FILTER_OPTIONS,
                onChange: (value) => model.setProjectListFilter(value as ProjectListFilter),
                ariaLabel: "项目筛选",
              },
              ...(model.canCreateProject
                ? [{
                    kind: "create" as const,
                    key: "create-project",
                    label: `新建${PROJECT_SCOPE_OPTIONS.find((option) => option.key === model.projectTypeFilter)?.label ?? ""}项目`,
                    active: model.creating,
                    onClick: startProjectCreate,
                  }]
                : []),
            ],
      }}
      navigation={createSpaceKindNavigation({
        items: PROJECT_SCOPE_OPTIONS,
        active: model.projectTypeFilter,
        onChange: (key) => model.setProjectTypeFilter(key as ProjectItem["projectType"]),
        ariaLabel: "项目空间类型",
      })}
      body={createBodySplitSection({
        left: { kind: "selector", selector: projectListSelector(model.filteredProjects, model.projectListFilter, model.selection, (projectId) => {
          model.setCreating(false);
          model.setSelection(projectId);
          model.setProjectListDrawerOpen(false);
        }, model.loading, model.error) },
        drawerLeft: { kind: "selector", selector: projectListSelector(model.filteredProjects, model.projectListFilter, model.selection, (projectId) => {
          model.setCreating(false);
          model.setSelection(projectId);
          model.setProjectListDrawerOpen(false);
        }, model.loading, model.error) },
        right: model.loading || model.error ? createPageBody([createMessageSection("project-loading", {
          content: model.error || "加载中...",
          tone: model.error ? "danger" : "muted"
        })]) : projectDetailSection,
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
