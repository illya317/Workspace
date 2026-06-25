"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { DatabasePageFrame, EmptyStateCard, Toast, Toolbar, WorkspaceSplitPage, useConfirm, useConfirmDelete } from "@workspace/core/ui";
import { getPageViewTabs } from "@workspace/platform/view-registry";
import type { WorkUser } from "@workspace/work/types";
import ProjectDetailEditor from "./project/ProjectDetailEditor";
import ProjectGanttTab from "./project/ProjectGanttTab";
import ProjectListPanel from "./project/ProjectListPanel";
import ProjectPlanGanttTab from "./project/ProjectPlanGanttTab";
import { PROJECT_LIST_FILTER_OPTIONS, type ProjectListFilter } from "./project/model";
import { useProjectTabModel } from "./project/use-project-tab-model";

export default function ProjectTab({ user }: { user: WorkUser }) {
  const tabs = useMemo(() => getPageViewTabs("/work/projects"), []);
  const [activeChild, setActiveChild] = useState("projects");
  return (
    <DatabasePageFrame
      tabs={tabs}
      activeTab="projects"
      activeChild={activeChild}
      onTabChange={() => setActiveChild("projects")}
      onChildChange={setActiveChild}
    >
      {activeChild === "projects-gantt" ? (
        <ProjectGanttTab user={user} />
      ) : activeChild === "project-plan-gantt" ? (
        <ProjectPlanGanttTab requestedProjectId={requestedProjectId()} />
      ) : (
        <ProjectLedgerTab user={user} />
      )}
    </DatabasePageFrame>
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
  const confirm = useConfirm();
  const confirmDelete = useConfirmDelete();
  const editorTitle = model.creating ? "新建项目" : model.selectedProject ? "项目信息" : "项目详情";
  const startDepartmentProjectCreate = () => {
    model.setProjectListFilter("普通");
    model.setProjectListOpen(true);
    model.setProjectListDrawerOpen(false);
    model.startCreateProject();
  };
  const confirmDeleteProject = async () => {
    if (!model.selectedProject) return;
    const ok = await confirmDelete({
      title: "删除项目",
      message: `确定删除项目「${model.selectedProject.name}」吗？此操作不可撤销。`,
      confirmLabel: "删除项目",
    });
    if (!ok) return;
    const result = await model.deleteSelectedProject();
    if (!result?.ok) {
      await confirm({
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
      <WorkspaceSplitPage
        sideOpen={model.projectListOpen}
        drawerOpen={model.projectListDrawerOpen}
        onSideOpenChange={model.setProjectListOpen}
        onDrawerOpenChange={model.setProjectListDrawerOpen}
        sideLabel="项目列表"
        splitRatio={[2, 8]}
        showSideControls={false}
        contentClassName="!p-0 !max-w-none"
        renderSide={() => <EmptyStateCard compact={false}>{model.loading ? "加载中..." : "暂无项目"}</EmptyStateCard>}
      >
        <EmptyStateCard compact={false} className={model.error ? "border-red-200 text-red-600" : ""}>
          {model.error || "加载中..."}
        </EmptyStateCard>
      </WorkspaceSplitPage>
    );
  }

  return (
    <>
      <WorkspaceSplitPage
        sideOpen={model.projectListOpen}
        drawerOpen={model.projectListDrawerOpen}
        onSideOpenChange={model.setProjectListOpen}
        onDrawerOpenChange={model.setProjectListDrawerOpen}
        sideLabel="项目列表"
        splitRatio={[2, 8]}
        showSideControls={false}
        contentClassName="!p-0 !max-w-none"
        beforeSplit={(
          <Toolbar
            variant="inline"
            className="w-full justify-start"
            items={[
              {
                kind: "icon-button",
                key: "mobile-side-toggle",
                section: "view",
                icon: "panel-open",
                label: "显示项目列表",
                className: "!h-9 !w-10 !px-0 lg:hidden",
                onClick: () => model.setProjectListDrawerOpen(true),
              },
              {
                kind: "icon-button",
                key: "desktop-side-toggle",
                section: "view",
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
            ]}
          />
        )}
        renderSide={(mode) => (
          <ProjectListPanel
            mode={mode}
            projects={model.filteredProjects}
            filter={model.projectListFilter}
            selection={model.selection}
            onSelect={(projectId) => {
              model.setCreating(false);
              model.setSelection(projectId);
              model.setProjectListDrawerOpen(false);
            }}
          />
        )}
      >
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
      </WorkspaceSplitPage>

      <Toast
        type={model.toast?.type}
        message={model.toast?.message || ""}
        show={!!model.toast}
        onClose={() => model.setToast(null)}
      />
    </>
  );
}
