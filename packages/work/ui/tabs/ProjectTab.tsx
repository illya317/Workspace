"use client";

import { EmptyStateCard, Toast, WorkspaceSplitPage } from "@workspace/core/ui";
import type { WorkUser } from "@workspace/work/types";
import ProjectDetailEditor from "./project/ProjectDetailEditor";
import ProjectListPanel from "./project/ProjectListPanel";
import { useProjectTabModel } from "./project/use-project-tab-model";

export default function ProjectTab({ user }: { user: WorkUser }) {
  const model = useProjectTabModel(user);
  const editorTitle = model.creating ? "新建项目" : model.selectedProject ? "项目信息" : "项目详情";

  if (model.loading || model.error) {
    return (
      <WorkspaceSplitPage
        sideOpen={model.projectListOpen}
        drawerOpen={model.projectListDrawerOpen}
        sideLabel="项目列表"
        onSideOpenChange={model.setProjectListOpen}
        onDrawerOpenChange={model.setProjectListDrawerOpen}
        showSideControls={false}
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
        sideLabel="项目列表"
        onSideOpenChange={model.setProjectListOpen}
        onDrawerOpenChange={model.setProjectListDrawerOpen}
        showSideControls={false}
        renderSide={(mode) => (
          <ProjectListPanel
            mode={mode}
            projects={model.projects}
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
          canCreateProject={model.canCreateProject}
          canEditCurrent={model.canEditCurrent}
          canManageCurrent={model.canManageCurrent}
          saving={model.saving}
          canSave={model.canSave}
          childProjects={model.childProjects}
          parentProjectOptions={model.parentProjectOptions}
          creating={model.creating}
          onCancelCreate={model.cancelCreateProject}
          onCreate={model.startCreateProject}
          onSave={() => void model.saveProject()}
          onDraftChange={model.updateDraft}
          onLeaderChange={model.setLeader}
          onRoleMembersChange={model.setRoleMembers}
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
