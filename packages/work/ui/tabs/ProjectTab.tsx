"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { workspacePath } from "@workspace/core/routing";
import { createMessageSection, createPageBody, createPageTabBar, createStatusSection, PageSurface } from "@workspace/core/ui";
import type { PageSurfaceTabBarItemSpec, SelectorSurfaceProps } from "@workspace/core/ui";
import type { SessionUser } from "@workspace/platform/types";
import {
  createSpaceWorkbenchBody,
  createStandardBusinessSpaceNavigationSelector,
  spaceWorkbenchPanelToolbarItems,
} from "@workspace/platform/ui";
import { renderAppShellPage } from "@workspace/platform/ui/app-shell-page";
import { getPageViewTabs } from "@workspace/platform/view-registry";
import type { WorkProjectActionPermissions, WorkUser } from "@workspace/work/types";
import { useWorkGanttViewport } from "../gantt";
import { getWorkSpacePath } from "../works/model";
import type { WorkTaskSpace } from "../works/types";
import { useProjectDetailEditorSection } from "./project/ProjectDetailEditor";
import { listProjectPlanGantt } from "./project/api";
import type { ProjectPlanGanttData } from "./project/plan-gantt-model";
import { buildTimelineRows } from "./project/plan-gantt-timeline-model";
import { PROJECT_LIST_FILTER_OPTIONS, projectCode, type ProjectItem, type ProjectListFilter } from "./project/model";
import { useProjectTabModel } from "./project/use-project-tab-model";

type ProjectViewKey = "projects";
type ProjectDetailViewKey = "overview" | "gantt";

const PROJECT_DETAIL_VIEW_ITEMS: PageSurfaceTabBarItemSpec[] = [
  { key: "overview", label: "项目总览", children: PROJECT_LIST_FILTER_OPTIONS.map((option) => ({ key: option.value, label: option.label })) },
  { key: "gantt", label: "项目甘特" },
];

export type WorkProjectPageNavigationData = {
  spaces: WorkTaskSpace[];
  preferredDepartmentIds: number[];
  preferredProjectIds: number[];
};

export default function ProjectTab({
  shellUser,
  shellTitle,
  user,
  actionPermissions,
  initialProjectId,
  navigation,
}: {
  shellUser: SessionUser;
  shellTitle: string;
  user: WorkUser;
  actionPermissions: WorkProjectActionPermissions;
  initialProjectId?: number | null;
  navigation: WorkProjectPageNavigationData;
}) {
  const searchParams = useSearchParams();
  const tabs = useMemo(() => getPageViewTabs("/work/project"), []);
  const [activeView, setActiveView] = useState<ProjectViewKey>(() => projectViewFromQuery(searchParams.get("view")));
  const requestedProjectIdValue = Number(searchParams.get("projectId") || "");
  const requestedProjectId = initialProjectId ?? (Number.isInteger(requestedProjectIdValue) && requestedProjectIdValue > 0 ? requestedProjectIdValue : null);
  const projectViewItems = useMemo(
    () => tabs.flatMap((tab) => tab.children?.length
      ? tab.children.map((child) => ({ key: child.key, label: String(child.label) }))
      : [{ key: tab.key, label: String(tab.label) }])
      .map((item) => item.key === "projects"
        ? {
            ...item,
            children: PROJECT_LIST_FILTER_OPTIONS.map((option) => ({ key: option.value, label: option.label })),
          }
        : item),
    [tabs],
  );
  const preferredProjectIds = requestedProjectId
    ? [requestedProjectId, ...navigation.preferredProjectIds.filter((id) => id !== requestedProjectId)]
    : navigation.preferredProjectIds;
  const spaceSelector = createStandardBusinessSpaceNavigationSelector({
    spaces: navigation.spaces,
    preferredDepartmentIds: navigation.preferredDepartmentIds,
    preferredProjectIds,
    active: requestedProjectId ? { targetType: "project", targetId: requestedProjectId } : null,
    label: "工作空间",
    order: ["personal", "departments", "projects"],
    onChange: (space) => window.location.assign(workspacePath(getWorkSpacePath(space.targetType, space.targetId))),
  });
  const headerSelector = spaceSelector && !requestedProjectId
    ? {
        ...spaceSelector,
        value: "project-home",
        options: [{ value: "project-home", label: "项目" }, ...spaceSelector.options],
        onChange: (value: string) => {
          if (value !== "project-home") spaceSelector.onChange(value);
        },
      }
    : spaceSelector;

  return renderAppShellPage({
    title: shellTitle,
    backHref: "/work",
    user: shellUser,
    headerSelector,
    children: <ProjectLedgerTab
      user={user}
      actionPermissions={actionPermissions}
      initialProjectId={requestedProjectId}
      projectViewItems={projectViewItems}
      activeView={activeView}
      onActiveViewChange={setActiveView}
    />,
  });
}

function ProjectLedgerTab({
  user,
  actionPermissions,
  initialProjectId,
  projectViewItems,
  activeView,
  onActiveViewChange,
}: {
  user: WorkUser;
  actionPermissions: WorkProjectActionPermissions;
  initialProjectId: number | null;
  projectViewItems: PageSurfaceTabBarItemSpec[];
  activeView: ProjectViewKey;
  onActiveViewChange: (view: ProjectViewKey) => void;
}) {
  const searchParams = useSearchParams();
  const requestedProjectId = Number(searchParams.get("projectId") || "");
  const resolvedInitialProjectId = initialProjectId ?? (Number.isInteger(requestedProjectId) && requestedProjectId > 0 ? requestedProjectId : null);
  const model = useProjectTabModel(user, actionPermissions, resolvedInitialProjectId, { autoSelectFirst: Boolean(resolvedInitialProjectId) });
  const [activeDetailView, setActiveDetailView] = useState<ProjectDetailViewKey>("overview");
  const ganttBody = useProjectPlanGanttBody(model.selectedProject);
  const createProjectBody = useProjectDetailEditorSection({
    editorTitle: "新建项目",
    dirty: model.dirty,
    draft: model.draft,
    selectedProject: null,
    canEditCurrent: model.canEditCurrent,
    canManageCurrent: model.canManageCurrent,
    canDeleteCurrent: false,
    saving: model.saving,
    canSave: model.canSave,
    canCreate: model.canCreateProject,
    creating: model.creating,
    onStartCreate: model.startCreateProject,
    onCancelCreate: model.cancelCreateProject,
    onDeleteProject: () => undefined,
    onSave: model.saveProject,
    onDraftChange: model.updateDraft,
    onLeaderChange: model.setLeader,
    onRoleMembersChange: model.setRoleMembers,
  });
  const projectDetailBody = useProjectDetailEditorSection({
    editorTitle: "项目总览",
    dirty: model.dirty,
    draft: model.draft,
    selectedProject: model.selectedProject,
    canEditCurrent: model.canEditCurrent,
    canManageCurrent: model.canManageCurrent,
    canDeleteCurrent: model.canDeleteCurrent,
    saving: model.saving,
    canSave: model.canSave,
    canCreate: model.canCreateProject,
    creating: model.creating,
    onStartCreate: model.startCreateProject,
    onCancelCreate: model.cancelCreateProject,
    onDeleteProject: () => void model.deleteSelectedProject(),
    onSave: () => void model.saveProject(),
    onDraftChange: model.updateDraft,
    onLeaderChange: model.setLeader,
    onRoleMembersChange: model.setRoleMembers,
  });
  const isProjectDetail = Boolean(model.selectedProject && !model.creating);
  const navigationItems = isProjectDetail ? PROJECT_DETAIL_VIEW_ITEMS : projectViewItems;
  const activeNavigationKey = isProjectDetail ? activeDetailView : activeView;
  const setProjectSelection = model.setSelection;

  useEffect(() => {
    function restoreProjectSelection() {
      const match = window.location.pathname.match(/\/work\/project\/(\d+)\/?$/);
      setProjectSelection(match ? Number(match[1]) : null);
    }
    window.addEventListener("popstate", restoreProjectSelection);
    return () => window.removeEventListener("popstate", restoreProjectSelection);
  }, [setProjectSelection]);

  function selectProject(project: ProjectItem) {
    model.setCreating(false);
    model.setSelection(project.id);
    setActiveDetailView("overview");
    window.history.pushState({ workspaceProjectSelection: project.id }, "", workspacePath(`/work/project/${project.id}`));
  }

  function returnToProjectList() {
    model.setCreating(false);
    model.setSelection(null);
    setActiveDetailView("overview");
    if (window.history.state?.workspaceProjectSelection) {
      window.history.back();
      return;
    }
    window.history.replaceState({}, "", workspacePath("/work/project"));
  }

  return (
    <PageSurface kind="standard"
      tabbar={createPageTabBar({
        items: navigationItems,
        active: activeNavigationKey,
        activeChild: model.projectListFilter,
        onChange: (value) => {
          if (isProjectDetail) setActiveDetailView(projectDetailViewFromKey(value));
          else onActiveViewChange(projectViewFromQuery(value));
        },
        onChildChange: (value) => model.setProjectListFilter(value as ProjectListFilter),
        variant: "large",
        ariaLabel: "项目管理视图",
      })}
      toolbar={model.loading || model.error ? undefined : {
        items: [
          ...spaceWorkbenchPanelToolbarItems({
            label: "项目列表",
            open: model.projectListOpen,
            onToggleSide: () => model.setProjectListOpen(!model.projectListOpen),
          }),
        ],
      }}
      body={createSpaceWorkbenchBody({
        left: {
          kind: "selector",
          selector: projectListSelector(
            model.filteredProjects,
            model.projectListFilter,
            model.selection,
            selectProject,
            model.loading,
            model.error,
          ),
        },
        right: model.loading || model.error ? createPageBody([createMessageSection("project-loading", {
          content: model.error || "加载中...",
          tone: model.error ? "danger" : "muted"
        })]) : createPageBody([
          { key: "project-create", body: createProjectBody, chrome: "plain" },
          ...(model.creating ? [] : [{
            key: "project-detail",
            body: model.selectedProject
              ? activeDetailView === "gantt" ? ganttBody : projectDetailBody
              : createPageBody([createStatusSection("project-overview-placeholder", { kind: "empty", content: "请选择左侧项目" })]),
            chrome: "plain" as const,
          }]),
        ]),
        label: "项目列表",
        open: model.projectListOpen,
        drawerOpen: model.projectListDrawerOpen,
        onOpenChange: model.setProjectListOpen,
        onDrawerOpenChange: model.setProjectListDrawerOpen,
        ratio: [0.2, 0.8],
        showControls: false,
        mobileDetailActive: isProjectDetail || model.creating,
        onMobileNavigateToList: returnToProjectList,
      })}
    />
  );
}

function projectViewFromQuery(value: string | null): ProjectViewKey {
  void value;
  return "projects";
}

function projectDetailViewFromKey(value: string): ProjectDetailViewKey {
  return value === "gantt" ? "gantt" : "overview";
}

function useProjectPlanGanttBody(project: ProjectItem | null) {
  const viewport = useWorkGanttViewport();
  const [data, setData] = useState<ProjectPlanGanttData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const projectId = project?.id ?? null;

  useEffect(() => {
    if (!projectId) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    listProjectPlanGantt(projectId).then((next) => {
      if (cancelled) return;
      setData(next);
    }).catch((err) => {
      if (!cancelled) setError(err instanceof Error ? err.message : "加载项目甘特失败");
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  if (!project) {
    return createPageBody([createStatusSection("project-gantt-empty-selection", {
      kind: "empty",
      content: "请选择左侧项目",
    })]);
  }
  if (error) {
    return createPageBody([createStatusSection("project-gantt-error", {
      kind: "error",
      content: error,
    })]);
  }
  if (loading && !data) {
    return createPageBody([createStatusSection("project-gantt-loading", {
      kind: "loading",
      content: "加载项目甘特...",
    })]);
  }

  const rows = data ? buildTimelineRows(data.items, data.phases) : [];
  return createPageBody([
    {
      key: "project-plan-gantt",
      body: {
        kind: "visualization",
        visualization: {
          kind: "gantt",
          gantt: {
            frame: { title: "项目甘特" },
            timeline: {
              kind: "gantt",
              rows: rows.map((row) => ({
                key: row.key,
                label: row.name,
                kind: row.kind,
                depth: row.depth,
                ownerNames: row.ownerNames,
                startDate: row.actualStartDate,
                endDate: row.actualEndDate,
                plannedStartDate: row.plannedStartDate,
                plannedEndDate: row.plannedEndDate,
                isMilestone: row.isMilestone,
              })),
              dependencies: data?.dependencies.map((dependency) => ({
                key: `${dependency.predecessorKind}:${dependency.predecessorId}-${dependency.successorKind}:${dependency.successorId}`,
                fromKey: `${dependency.predecessorKind}:${dependency.predecessorId}`,
                toKey: `${dependency.successorKind}:${dependency.successorId}`,
              })),
              periodStart: viewport.periodStart,
              zoom: viewport.zoom,
              leftHeader: "项目 / 任务",
              emptyText: "暂无计划节点",
            },
          },
        },
      },
    },
  ]);
}

function projectListSelector(
  projects: ProjectItem[],
  filter: ProjectListFilter,
  selection: number | null,
  onSelect: (project: ProjectItem) => void,
  loading: boolean,
  error: string | null,
): SelectorSurfaceProps<ProjectItem> {
  return {
    kind: "list",
    title: "项目列表",
    loading,
    loadingText: "加载中...",
    items: error ? [] : projects.map((project) => ({
      key: project.id,
      value: project,
      card: {
        title: project.name,
        subtitle: projectCode(project, null),
        code: projectStatusLabel(project.status),
        codeTone: statusTone(project.status),
        archived: project.isArchived,
      },
    })),
    selectedId: selection,
    onSelect,
    emptyText: error || emptyTextForFilter(filter),
  };
}

function emptyTextForFilter(filter: ProjectListFilter) {
  if (filter === "普通") return "暂无普通项目";
  if (filter === "重点") return "暂无重点项目";
  if (filter === "特殊") return "暂无特殊项目";
  return "暂无项目";
}

function statusTone(status: string | null | undefined) {
  if (status === "done") return "success" as const;
  if (status === "active") return "warning" as const;
  if (status === "pending") return "muted" as const;
  return "default" as const;
}

function projectStatusLabel(status: string | null | undefined) {
  if (status === "done") return "已完成";
  if (status === "active") return "进行中";
  return "未开始";
}
