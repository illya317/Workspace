"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CommandToolbar, DatabasePageFrame, EmptyStateCard, IconActionButton, SplitWorkspace, SplitWorkspaceToolbar, Toast, ToolbarOptionGroup, useConfirm, useConfirmDelete } from "@workspace/core/ui";
import { getPageViewTabs } from "@workspace/platform/view-registry";
import type { WorkUser } from "@workspace/work/types";
import ProjectDetailEditor from "./project/ProjectDetailEditor";
import ProjectGanttTab from "./project/ProjectGanttTab";
import ProjectListPanel from "./project/ProjectListPanel";
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
      {activeChild === "projects-gantt" ? <ProjectGanttTab user={user} /> : <ProjectLedgerTab user={user} />}
    </DatabasePageFrame>
  );
}

function ProjectLedgerTab({ user }: { user: WorkUser }) {
  const searchParams = useSearchParams();
  const requestedProjectId = Number(searchParams.get("projectId") || "");
  const model = useProjectTabModel(user, Number.isInteger(requestedProjectId) && requestedProjectId > 0 ? requestedProjectId : null);
  const confirm = useConfirm();
  const confirmDelete = useConfirmDelete();
  const editorTitle = model.creating ? "新建项目" : model.selectedProject ? "项目信息" : "项目详情";
  const startDepartmentProjectCreate = () => {
    model.setProjectListFilter("department");
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
      <SplitWorkspace
        sideOpen={model.projectListOpen}
        drawerOpen={model.projectListDrawerOpen}
        onDrawerOpenChange={model.setProjectListDrawerOpen}
        splitRatio={[2, 8]}
        renderSide={() => <EmptyStateCard compact={false}>{model.loading ? "加载中..." : "暂无项目"}</EmptyStateCard>}
      >
        <EmptyStateCard compact={false} className={model.error ? "border-red-200 text-red-600" : ""}>
          {model.error || "加载中..."}
        </EmptyStateCard>
      </SplitWorkspace>
    );
  }

  return (
    <>
      <div className="space-y-5">
        <SplitWorkspaceToolbar
          sideOpen={model.projectListOpen}
          sideLabel="项目列表"
          onSideOpenChange={model.setProjectListOpen}
          onDrawerOpen={() => model.setProjectListDrawerOpen(true)}
          showSideControls={false}
        >
          <ProjectToolbar
            canCreateProject={model.canCreateProject}
            filter={model.projectListFilter}
            onCreate={startDepartmentProjectCreate}
            onFilterChange={model.setProjectListFilter}
          />
        </SplitWorkspaceToolbar>
        <SplitWorkspace
          sideOpen={model.projectListOpen}
          drawerOpen={model.projectListDrawerOpen}
          onDrawerOpenChange={model.setProjectListDrawerOpen}
          splitRatio={[2, 8]}
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
            childProjects={model.childProjects}
            rasciRows={model.rasciRows}
            creating={model.creating}
            onCancelCreate={model.cancelCreateProject}
            onDeleteProject={() => void confirmDeleteProject()}
            onSave={() => void model.saveProject()}
            onChildProjectsChange={model.setChildProjects}
            onCreateChildProject={(name, leadingDepartmentId, leader, endDate) => model.createChildProject(name, leadingDepartmentId, leader, endDate)}
            onDraftChange={model.updateDraft}
            onLeaderChange={model.setLeader}
            onRoleMembersChange={model.setRoleMembers}
            onToast={model.setToast}
          />
        </SplitWorkspace>
      </div>

      <Toast
        type={model.toast?.type}
        message={model.toast?.message || ""}
        show={!!model.toast}
        onClose={() => model.setToast(null)}
      />
    </>
  );
}

function ProjectToolbar({
  canCreateProject,
  filter,
  onCreate,
  onFilterChange,
}: {
  canCreateProject: boolean;
  filter: ProjectListFilter;
  onCreate: () => void;
  onFilterChange: (filter: ProjectListFilter) => void;
}) {
  return (
    <CommandToolbar
      className="w-full"
      viewControls={canCreateProject ? (
        <IconActionButton label="新建部门项目" variant="primary" onClick={onCreate}>
          +
        </IconActionButton>
      ) : undefined}
      filters={
        <ToolbarOptionGroup
          ariaLabel="项目筛选"
          value={filter}
          options={PROJECT_LIST_FILTER_OPTIONS}
          onChange={(value) => onFilterChange(value as ProjectListFilter)}
        />
      }
    />
  );
}
