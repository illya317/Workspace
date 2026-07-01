"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createMessageSection, createPageBody, PageSurface, useFeedback } from "@workspace/core/ui";
import type { PageSurfaceProps, SelectorSurfaceProps } from "@workspace/core/ui";
import {
  createSpaceKindNavigation,
  createSpaceViewToolbarItem,
  createSpaceWorkbenchBody,
  spaceWorkbenchPanelToolbarItems,
  type SpaceWorkbenchKindOption,
} from "@workspace/platform/ui";
import { useSpacePermissionsSections, type SpacePermissionToggleInput } from "@workspace/platform/ui/SpacePermissionsPanel";
import { getPageViewTabs } from "@workspace/platform/view-registry";
import type { WorkProjectActionPermissions, WorkUser } from "@workspace/work/types";
import { useProjectDetailEditorSection, type ProjectDetailViewKey } from "./project/ProjectDetailEditor";
import ProjectGanttTab from "./project/ProjectGanttTab";
import ProjectPlanGanttTab from "./project/ProjectPlanGanttTab";
import { listProjectPermissions, setProjectPermissionGrant } from "./project/api";
import { PROJECT_LIST_FILTER_OPTIONS, projectCode, type ProjectItem, type ProjectListFilter } from "./project/model";
import { useProjectTabModel } from "./project/use-project-tab-model";

export default function ProjectTab({ user, actionPermissions }: { user: WorkUser; actionPermissions: WorkProjectActionPermissions }) {
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
  return <ProjectLedgerTab user={user} actionPermissions={actionPermissions} surface={surface} />;
}

type ProjectChildSurfaceProps = Pick<PageSurfaceProps, "navigation" | "toolbar">;

const PROJECT_SCOPE_OPTIONS: SpaceWorkbenchKindOption[] = [
  { key: "company", label: "运营委员会" },
  { key: "other", label: "其他" },
];

function ProjectLedgerTab({ user, actionPermissions, surface }: { user: WorkUser; actionPermissions: WorkProjectActionPermissions; surface?: ProjectChildSurfaceProps }) {
  const searchParams = useSearchParams();
  const requestedProjectId = Number(searchParams.get("projectId") || "");
  const model = useProjectTabModel(user, actionPermissions, Number.isInteger(requestedProjectId) && requestedProjectId > 0 ? requestedProjectId : null);
  const feedback = useFeedback();
  const [activeProjectDetailView, setActiveProjectDetailView] = useState<ProjectDetailViewKey>("overview");
  const editorTitle = model.creating ? "新建项目" : model.selectedProject ? "项目信息" : "项目详情";
  const projectScopeOptions = useMemo(() => projectScopeOptionsForDepartments(model.projectDepartmentOptions), [model.projectDepartmentOptions]);
  const activeProjectScopeKey = model.projectTypeFilter === "department"
    ? model.projectDepartmentFilter !== null ? departmentScopeKey(model.projectDepartmentFilter) : "department"
    : model.projectTypeFilter;
  const activeProjectScopeLabel = projectScopeOptions.find((option) => option.key === activeProjectScopeKey)?.label ?? "";
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
  const selectedProjectPermissionTarget = useMemo(
    () => model.selectedProject ? { id: model.selectedProject.id } : null,
    [model.selectedProject],
  );
  const listProjectPermissionTarget = useCallback(
    (target: { id: number }) => listProjectPermissions(target.id),
    [],
  );
  const setProjectPermissionTargetGrant = useCallback(
    (target: { id: number }, input: SpacePermissionToggleInput) => setProjectPermissionGrant(target.id, input),
    [],
  );
  const projectPermissionSections = useSpacePermissionsSections({
    target: selectedProjectPermissionTarget,
    canManage: model.canManageCurrent,
    enabled: Boolean(model.selectedProject && model.canManageCurrent),
    onToast: model.setToast,
    listPermissions: listProjectPermissionTarget,
    setPermissionActionGrant: setProjectPermissionTargetGrant,
    deniedText: "仅项目管理员可维护权限。",
    loadErrorText: "加载项目权限失败",
    saveErrorText: "保存项目权限失败",
    saveSuccessText: "项目权限已更新",
  });
  const projectDetailViewOptions = useMemo(() => [
    { value: "overview", label: editorTitle },
    { value: "plan", label: "项目计划" },
    ...(model.selectedProject && model.canManageCurrent ? [{ value: "permissions", label: "权限设置" }] : []),
  ], [editorTitle, model.canManageCurrent, model.selectedProject]);
  useEffect(() => {
    if (!projectDetailViewOptions.some((option) => option.value === activeProjectDetailView)) {
      setActiveProjectDetailView("overview");
    }
  }, [activeProjectDetailView, projectDetailViewOptions]);
  const projectDetailSection = useProjectDetailEditorSection({
    activeView: activeProjectDetailView,
    editorTitle,
    dirty: model.dirty,
    draft: model.draft,
    selectedProject: model.selectedProject,
    canEditCurrent: model.canEditCurrent,
    canManageCurrent: model.canManageCurrent,
    canDeleteCurrent: model.canDeleteCurrent,
    canCreateCurrent: model.canCreateCurrent,
    canDeleteSubresourceCurrent: model.canDeleteSubresourceCurrent,
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
    onActiveViewChange: setActiveProjectDetailView,
    permissionSections: projectPermissionSections,
    onToast: model.setToast,
  });

  return (
    <PageSurface kind="standard"
      {...surface}
      toolbar={model.loading || model.error ? undefined : {
        items: [
              ...(surface?.toolbar?.items ?? []),
              ...spaceWorkbenchPanelToolbarItems({
                label: "项目列表",
                open: model.projectListOpen,
                onOpenDrawer: () => model.setProjectListDrawerOpen(true),
                onToggleSide: () => model.setProjectListOpen(!model.projectListOpen),
              }),
              ...(model.draft ? [{
                kind: "option-group" as const,
                key: "project-detail-view",
                value: activeProjectDetailView,
                options: projectDetailViewOptions,
                presentation: "segmented" as const,
                onChange: (value: string) => setActiveProjectDetailView(value as ProjectDetailViewKey),
                ariaLabel: "项目详情视图",
              }] : []),
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
                    label: `新建${activeProjectScopeLabel}项目`,
                    active: model.creating,
                    onClick: startProjectCreate,
                  }]
                : []),
            ],
      }}
      navigation={createSpaceKindNavigation({
        items: projectScopeOptions,
        active: activeProjectScopeKey,
        onChange: (key) => {
          const scope = parseProjectScopeKey(key);
          model.setProjectTypeFilter(scope.projectType);
          model.setProjectDepartmentFilter(scope.departmentId);
        },
        ariaLabel: "项目空间类型",
      })}
      body={createSpaceWorkbenchBody({
        left: { kind: "selector", selector: projectListSelector(model.filteredProjects, model.projectListFilter, model.selection, (projectId) => {
          model.setCreating(false);
          model.setSelection(projectId);
          model.setProjectListDrawerOpen(false);
        }, model.loading, model.error) },
        right: model.loading || model.error ? createPageBody([createMessageSection("project-loading", {
          content: model.error || "加载中...",
          tone: model.error ? "danger" : "muted"
        })]) : projectDetailSection,
        label: "项目列表",
        open: model.projectListOpen,
        drawerOpen: model.projectListDrawerOpen,
        onOpenChange: model.setProjectListOpen,
        onDrawerOpenChange: model.setProjectListDrawerOpen,
        ratio: [0.2, 0.8],
        showControls: false,
      })}
			    />
  );
}

function departmentScopeKey(departmentId: number) {
  return `department:${departmentId}`;
}

function projectScopeOptionsForDepartments(departments: Array<{ id: number; name: string; code: string | null }>): SpaceWorkbenchKindOption[] {
  return [
    PROJECT_SCOPE_OPTIONS[0],
    ...departments.map((department) => ({ key: departmentScopeKey(department.id), label: department.name })),
    ...(departments.length === 0 ? [{ key: "department", label: "部门" }] : []),
    PROJECT_SCOPE_OPTIONS[1],
  ];
}

function parseProjectScopeKey(key: string): { projectType: ProjectItem["projectType"]; departmentId: number | null } {
  if (key.startsWith("department:")) {
    const departmentId = Number(key.slice("department:".length));
    return { projectType: "department", departmentId: Number.isFinite(departmentId) ? departmentId : null };
  }
  if (key === "company" || key === "other") return { projectType: key, departmentId: null };
  return { projectType: "department", departmentId: null };
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
