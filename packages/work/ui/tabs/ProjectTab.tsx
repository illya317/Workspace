"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CreateStartButton, DatabasePageFrame, EmptyStateCard, ActionButton, SplitWorkspace, Toast, Toolbar, ToolbarOptionGroup, useConfirm, useConfirmDelete } from "@workspace/core/ui";
import type { ToolbarItem } from "@workspace/core/ui";
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
        <Toolbar
          variant="inline"
          className="w-full justify-start"
          items={[
            {
              kind: "custom",
              key: "mobile-side-toggle",
              section: "view",
              content: (
                <span className="lg:hidden">
                  <ActionButton
                    kind="panel-open"
                    label="显示项目列表"
                    onClick={() => model.setProjectListDrawerOpen(true)}
                    className="!h-9 !w-10 !px-0"
                  />
                </span>
              ),
            },
            {
              kind: "custom",
              key: "desktop-side-toggle",
              section: "view",
              content: (
                <span className="hidden lg:block">
                  <ActionButton
                    kind={model.projectListOpen ? "panel-open" : "panel-close"}
                    label={`${model.projectListOpen ? "隐藏" : "显示"}项目列表`}
                    onClick={() => model.setProjectListOpen(!model.projectListOpen)}
                    variant={model.projectListOpen ? "primary" : "secondary"}
                    className="!h-9 !w-10 !px-0"
                  />
                </span>
              ),
            },
            {
              kind: "custom",
              key: "project-toolbar",
              section: "edit",
              content: (
                <ProjectToolbar
                  canCreateProject={model.canCreateProject}
                  creating={model.creating}
                  filter={model.projectListFilter}
                  onCreate={startDepartmentProjectCreate}
                  onFilterChange={model.setProjectListFilter}
                />
              ),
            },
          ]}
        />
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
  creating,
  filter,
  onCreate,
  onFilterChange,
}: {
  canCreateProject: boolean;
  creating: boolean;
  filter: ProjectListFilter;
  onCreate: () => void;
  onFilterChange: (filter: ProjectListFilter) => void;
}) {
  const items = [
    canCreateProject
      ? ({
          kind: "custom",
          key: "create",
          section: "view",
          content: <CreateStartButton label="新建部门项目" active={creating} onClick={onCreate} />,
        } as ToolbarItem)
      : null,
    {
      kind: "custom",
      key: "filter",
      section: "filter",
      content: (
        <ToolbarOptionGroup
          ariaLabel="项目筛选"
          value={filter}
          options={PROJECT_LIST_FILTER_OPTIONS}
          onChange={(value) => onFilterChange(value as ProjectListFilter)}
        />
      ),
    } as ToolbarItem,
  ].filter((item): item is ToolbarItem => item !== null);

  return <Toolbar items={items} className="w-full" />;
}
