"use client";

import { ActionButton, EmptyStateCard, Toast, WorkspaceSplitPage } from "@workspace/core/ui";
import type { WorkUser } from "@workspace/work/types";
import ProjectCreatePanel from "./project/ProjectCreatePanel";
import ProjectDetailEditor from "./project/ProjectDetailEditor";
import ProjectListPanel from "./project/ProjectListPanel";
import { useProjectTabModel } from "./project/use-project-tab-model";

export default function ProjectTab({ user }: { user: WorkUser }) {
  const model = useProjectTabModel(user);
  const editorTitle = model.selectedProject ? "工作计划信息" : "工作计划详情";

  if (model.loading || model.error) {
    return (
      <WorkspaceSplitPage
        sideOpen={model.projectListOpen}
        drawerOpen={model.projectListDrawerOpen}
        sideLabel="工作计划列表"
        onSideOpenChange={model.setProjectListOpen}
        onDrawerOpenChange={model.setProjectListDrawerOpen}
        renderSide={() => <EmptyStateCard compact={false}>{model.loading ? "加载中..." : "暂无工作计划"}</EmptyStateCard>}
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
        sideLabel="工作计划列表"
        onSideOpenChange={model.setProjectListOpen}
        onDrawerOpenChange={model.setProjectListDrawerOpen}
        toolbar={<ProjectToolbar model={model} />}
        beforeSplit={<ProjectCreate model={model} />}
        renderSide={(mode) => (
          <ProjectListPanel
            mode={mode}
            keyword={model.keyword}
            onKeywordChange={model.setKeyword}
            projects={model.filteredProjects}
            selection={model.selection}
            onSelect={(projectId) => {
              model.setSelection(projectId);
              model.setProjectListDrawerOpen(false);
            }}
            onClose={() => model.setProjectListDrawerOpen(false)}
          />
        )}
      >
        <ProjectDetailEditor
          editorTitle={editorTitle}
          showArchived={model.showArchived}
          dirty={model.dirty}
          draft={model.draft}
          selectedProject={model.selectedProject}
          canEdit={model.canEdit}
          canEditCurrent={model.canEditCurrent}
          saving={model.saving}
          canSave={model.canSave}
          childPlans={model.childPlans}
          parentPlanOptions={model.parentPlanOptions}
          onArchive={() => {
            if (model.selectedProject) void model.setProjectArchived(model.selectedProject.id, !model.showArchived);
          }}
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

function ProjectToolbar({ model }: { model: ReturnType<typeof useProjectTabModel> }) {
  return (
    <>
      <ActionButton disabled={!model.canEditCurrent} onClick={() => model.setCreatePanelOpen((open) => !open)} variant="primary">
        新建工作计划
      </ActionButton>
      <ActionButton
        onClick={() => {
          model.setShowArchived((value) => !value);
          model.setCreatePanelOpen(false);
        }}
      >
        {model.showArchived ? "现用计划" : "归档计划"}
      </ActionButton>
    </>
  );
}

function ProjectCreate({ model }: { model: ReturnType<typeof useProjectTabModel> }) {
  if (!model.createPanelOpen) return null;
  return (
    <ProjectCreatePanel
      draft={model.createDraft}
      canEdit={model.canEditCurrent}
      saving={model.saving}
      onDraftChange={model.setCreateDraft}
      onSubmit={() => void model.createPlanFromPanel()}
      onCancel={() => {
        model.setCreatePanelOpen(false);
        model.setCreateDraft({ name: "", leadingDepartmentId: null, leadingDepartmentName: null });
      }}
    />
  );
}
