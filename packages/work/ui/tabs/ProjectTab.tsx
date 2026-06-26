"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PageSurface, useFeedback } from "@workspace/core/ui";
import { getPageViewTabs } from "@workspace/platform/view-registry";
import type { WorkUser } from "@workspace/work/types";
import ProjectDetailEditor from "./project/ProjectDetailEditor";
import ProjectGanttTab from "./project/ProjectGanttTab";
import ProjectPlanGanttTab from "./project/ProjectPlanGanttTab";
import { PROJECT_LIST_FILTER_OPTIONS, projectCode, type ProjectItem, type ProjectListFilter } from "./project/model";
import { useProjectTabModel } from "./project/use-project-tab-model";

export default function ProjectTab({ user }: { user: WorkUser }) {
  const tabs = useMemo(() => getPageViewTabs("/work/projects"), []);
  const [activeChild, setActiveChild] = useState("projects");
  return (
    <PageSurface
      kind="list"
      tabs={tabs}
      activeTab="projects"
      activeChild={activeChild}
      onTabChange={() => setActiveChild("projects")}
      onChildChange={setActiveChild}
      blocks={[{
        kind: "moduleView",
        key: activeChild,
        view: activeChild === "projects-gantt" ? (
          <ProjectGanttTab user={user} />
        ) : activeChild === "project-plan-gantt" ? (
          <ProjectPlanGanttTab requestedProjectId={requestedProjectId()} />
        ) : (
          <ProjectLedgerTab user={user} />
        ),
      }]}
    />
  );
}

function requestedProjectId() {
  if (typeof window === "undefined") return null;
  const value = Number(new URLSearchParams(window.location.search).get("projectId") || "");
  return Number.isInteger(value) && value > 0 ? value : null;
}

function ProjectLedgerTab({ user }: { user: WorkUser }) {
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

  if (model.loading || model.error) {
    return (
      <PageSurface
        kind="split"
        sideOpen={model.projectListOpen}
        drawerOpen={model.projectListDrawerOpen}
        onSideOpenChange={model.setProjectListOpen}
        onDrawerOpenChange={model.setProjectListDrawerOpen}
        sideLabel="项目列表"
        splitRatio={[2, 8]}
        showSideControls={false}
        contentClassName="!p-0 !max-w-none"
        side={{
          blocks: [{
            kind: "message",
            key: "project-list-loading",
            content: model.loading ? "加载中..." : "暂无项目",
            tone: "muted",
          }],
        }}
        blocks={[{
          kind: "message",
          key: "project-loading",
          content: model.error || "加载中...",
          tone: model.error ? "danger" : "muted",
        }]}
      />
    );
  }

  return (
    <PageSurface
      kind="split"
      sideOpen={model.projectListOpen}
      drawerOpen={model.projectListDrawerOpen}
      onSideOpenChange={model.setProjectListOpen}
      onDrawerOpenChange={model.setProjectListDrawerOpen}
      sideLabel="项目列表"
      splitRatio={[2, 8]}
      showSideControls={false}
      contentClassName="!p-0 !max-w-none"
      toolbar={{
        variant: "inline",
        className: "w-full justify-start",
        items: [
              {
                kind: "panel-toggle",
                key: "mobile-side-toggle",
                icon: "panel-open",
                label: "显示项目列表",
                className: "!h-9 !w-10 !px-0 lg:hidden",
                onClick: () => model.setProjectListDrawerOpen(true),
              },
              {
                kind: "panel-toggle",
                key: "desktop-side-toggle",
                icon: model.projectListOpen ? "panel-open" : "panel-close",
                label: `${model.projectListOpen ? "隐藏" : "显示"}项目列表`,
                variant: model.projectListOpen ? "primary" : "secondary",
                className: "!h-9 !w-10 !px-0 hidden lg:inline-flex",
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
      side={{
        blocks: [projectListNavigationBlock(model.filteredProjects, model.projectListFilter, model.selection, (projectId) => {
          model.setCreating(false);
          model.setSelection(projectId);
          model.setProjectListDrawerOpen(false);
        })],
        drawerBlocks: [projectListNavigationBlock(model.filteredProjects, model.projectListFilter, model.selection, (projectId) => {
          model.setCreating(false);
          model.setSelection(projectId);
          model.setProjectListDrawerOpen(false);
        }, "drawer")],
      }}
      blocks={[{
        kind: "moduleView",
        key: "project-detail",
        view: (
          <ProjectDetailEditor
            editorTitle={editorTitle}
            dirty={model.dirty}
            draft={model.draft}
            selectedProject={model.selectedProject}
            canEditCurrent={model.canEditCurrent}
            canManageCurrent={model.canManageCurrent}
            canDeleteCurrent={model.canDeleteCurrent}
            saving={model.saving}
            canSave={model.canSave}
            rasciRows={model.rasciRows}
            creating={model.creating}
            onCancelCreate={model.cancelCreateProject}
            onDeleteProject={() => void confirmDeleteProject()}
            onSave={() => void model.saveProject()}
            onDraftChange={model.updateDraft}
            onLeaderChange={model.setLeader}
            onRoleMembersChange={model.setRoleMembers}
            onCreateChildProject={model.startCreateChildProject}
            onOpenProject={(projectId) => {
              model.setCreating(false);
              model.setProjectListFilter("all");
              model.setSelection(projectId);
            }}
            onProjectTasksChanged={(projectId) => void model.loadSelectedTasks(projectId)}
            onToast={model.setToast}
          />
        ),
      }]}
    />
  );
}

function projectListNavigationBlock(
  projects: ProjectItem[],
  filter: ProjectListFilter,
  selection: number | null,
  onSelect: (projectId: number) => void,
  mode: "desktop" | "drawer" = "desktop",
) {
  return {
    kind: "navigation" as const,
    key: `project-list-${mode}`,
    surface: {
      kind: "selector" as const,
      className: mode === "drawer" ? "h-full overflow-hidden" : "",
      selector: {
        bodyClassName: `${mode === "drawer" ? "h-full" : "max-h-[760px]"} overflow-auto p-3`,
        contentClassName: "space-y-2",
        items: projects,
        selectedId: selection,
        onSelect: (project: ProjectItem) => onSelect(project.id),
        getKey: (project: ProjectItem) => project.id,
        renderItem: (project: ProjectItem) => ({
          title: <ProjectTitle name={project.name} status={project.status} />,
          subtitle: projectCode(project, null),
          archived: project.isArchived,
        }),
        emptyText: emptyTextForFilter(filter),
      },
    },
  };
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
