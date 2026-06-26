"use client";

import { useEffect, useState } from "react";
import {
  CreatePanel,
  FieldGrid,
  InputControl,
  PanelCard,
  ReadOnlyField,
  SectionCard,
  TabBar,
} from "@workspace/core/ui";
import type { FkFieldOption } from "@workspace/core/ui";
import ProjectMemberTagsInput from "./ProjectMemberTagsInput";
import ProjectPlanManagementSection from "./ProjectPlanManagementSection";
import ProjectRasciMatrix from "./ProjectRasciMatrix";
import type { ProjectRasciRow } from "./ProjectRasciMatrix";
import ProjectTasksSection from "./ProjectTasksSection";
import {
  MULTI_PROJECT_ROLES,
  PROJECT_LEVEL_PICKER_OPTIONS,
  PROJECT_TYPE_PICKER_OPTIONS,
  projectCode,
  type EmployeeTag,
  type MultiProjectRole,
  type ProjectDraft,
  type ProjectItem,
  type ProjectTaskItem,
} from "./model";
import { WORK_REFERENCE_OPTIONS_ENDPOINT } from "./reference-options";

const pendingFieldClassName = "!border-amber-200 !bg-amber-50 !text-amber-800";

export default function ProjectDetailEditor({
  editorTitle,
  dirty,
  draft,
  selectedProject,
  canEditCurrent,
  canManageCurrent,
  canDeleteCurrent,
  saving,
  canSave,
  rasciRows,
  creating,
  onCancelCreate,
  onDeleteProject,
  onSave,
  onDraftChange,
  onLeaderChange,
  onRoleMembersChange,
  onCreateChildProject,
  onOpenProject,
  onProjectTasksChanged,
  onToast,
}: {
  editorTitle: string;
  dirty: boolean;
  draft: ProjectDraft | null;
  selectedProject: ProjectItem | null;
  canEditCurrent: boolean;
  canManageCurrent: boolean;
  canDeleteCurrent: boolean;
  saving: boolean;
  canSave: boolean;
  rasciRows: ProjectRasciRow[];
  creating: boolean;
  onCancelCreate: () => void;
  onDeleteProject: () => void;
  onSave: () => void;
  onDraftChange: <K extends keyof ProjectDraft>(key: K, value: ProjectDraft[K]) => void;
  onLeaderChange: (option?: FkFieldOption) => void;
  onRoleMembersChange: (role: MultiProjectRole, members: EmployeeTag[]) => void;
  onCreateChildProject: (task: ProjectTaskItem) => void;
  onOpenProject: (projectId: number) => void;
  onProjectTasksChanged: (projectId: number | null) => void;
  onToast: (toast: { type: "success" | "error"; message: string }) => void;
}) {
  const [activeTab, setActiveTab] = useState("overview");
  const isChildProject = Boolean(draft?.parentProjectTaskId);
  const parentProjectLabel = draft
    ? [draft.parentProjectCode, draft.parentProjectName].filter(Boolean).join(" · ") || "未设置"
    : "未设置";

  useEffect(() => {
    if (activeTab !== "overview" && activeTab !== "plan") setActiveTab("overview");
  }, [activeTab]);

  const openParentProjectPlan = (projectId: number | null) => { if (projectId) { setActiveTab("plan"); onOpenProject(projectId); } };
  const projectContent = draft ? (
    <div className="space-y-4">
      <TabBar
        tabs={[
          { key: "overview", label: "项目概览" },
          { key: "plan", label: "项目计划" },
        ]}
        active={activeTab}
        onChange={setActiveTab}
        className="mb-2"
      />

      {activeTab === "overview" && (
        <>
          <SectionCard title="基础信息">
            <FieldGrid columns={3} mode="mixed">
              {isChildProject && (
                <>
                  <FieldGrid.Cell label="上级项目">
                    <ReadOnlyField
                      disabled={!draft.parentProjectId}
                      onClick={() => draft.parentProjectId && onOpenProject(draft.parentProjectId)}
                      textAlign="left"
                    >
                      {parentProjectLabel}
                    </ReadOnlyField>
                  </FieldGrid.Cell>
                  <FieldGrid.Cell label="上级任务">
                    <ReadOnlyField
                      disabled={!draft.parentProjectId}
                      onClick={() => openParentProjectPlan(draft.parentProjectId)}
                      textAlign="left"
                    >
                      {draft.parentProjectTaskName || "未设置"}
                    </ReadOnlyField>
                  </FieldGrid.Cell>
                  <FieldGrid.Cell label="上级任务状态">
                    <ReadOnlyField value={draft.parentProjectTaskStatus || "未开始"} />
                  </FieldGrid.Cell>
                </>
              )}
              <FieldGrid.Cell label="项目编码">
                <ReadOnlyField value={projectCode(selectedProject, draft)} fontRole="mono" />
              </FieldGrid.Cell>
              <FieldGrid.Cell label="项目类型">
                <InputControl
                  spec={{ valueType: "string", editor: "select", options: { source: "static", items: PROJECT_TYPE_PICKER_OPTIONS }, state: !canManageCurrent || !creating ? "disabled" : "normal" }}
                  value={draft.projectType}
                  onChange={(value) => onDraftChange("projectType", (String(value || "") || "department") as ProjectDraft["projectType"])}
                />
              </FieldGrid.Cell>
              <FieldGrid.Cell label="项目负责人">
                <ReadOnlyField value={draft.leader?.name || "未设置"} />
              </FieldGrid.Cell>
              <FieldGrid.Cell label="项目名称" required>
                <InputControl
                  spec={{ valueType: "string", editor: "input", state: !canManageCurrent ? "disabled" : "normal" }}
                  value={draft.name}
                  onChange={(value) => onDraftChange("name", String(value ?? ""))}
                />
              </FieldGrid.Cell>
              <FieldGrid.Cell label="主导部门" required={draft.projectType === "department"}>
                <InputControl
                  spec={{ valueType: "reference", editor: "autocomplete", options: { source: "remote", fkKey: "work.projects.leadingDepartment", endpoint: WORK_REFERENCE_OPTIONS_ENDPOINT, returnField: "id" }, state: !canManageCurrent ? "disabled" : "normal" }}
                  value={draft.leadingDepartmentId ? String(draft.leadingDepartmentId) : ""}
                  displayValue={draft.leadingDepartmentName || ""}
                  placeholder="搜索部门名称、编码"
                  onChange={(_value, option) => {
                    const fk = option as FkFieldOption | undefined;
                    onDraftChange("leadingDepartmentId", fk?.id ?? null);
                    onDraftChange("leadingDepartmentName", fk?.name ?? null);
                    onDraftChange("leadingDepartmentCode", fk?.subtitle ?? null);
                  }}
                />
              </FieldGrid.Cell>
              <FieldGrid.Cell label="项目级别">
                <InputControl
                  spec={{ valueType: "string", editor: "select", options: { source: "static", items: PROJECT_LEVEL_PICKER_OPTIONS }, state: !canEditCurrent ? "disabled" : "normal" }}
                  value={draft.projectLevel || "普通"}
                  onChange={(value) => onDraftChange("projectLevel", String(value || "") || "普通")}
                />
              </FieldGrid.Cell>
              <FieldGrid.Cell label="计划开始" hint={isChildProject ? "来自上级任务" : undefined}>
                <InputControl spec={{ valueType: "date", editor: "datePicker", state: !canEditCurrent || isChildProject ? "disabled" : "normal" }} value={draft.baselineStartDate} onChange={(value) => onDraftChange("baselineStartDate", String(value || ""))} placeholder="选择日期" />
              </FieldGrid.Cell>
              <FieldGrid.Cell label="计划结束" hint={isChildProject ? "来自上级任务" : undefined}>
                <InputControl spec={{ valueType: "date", editor: "datePicker", state: !canEditCurrent || isChildProject ? "disabled" : "normal" }} value={draft.baselineEndDate} onChange={(value) => onDraftChange("baselineEndDate", String(value || ""))} placeholder="选择日期" />
              </FieldGrid.Cell>
              <FieldGrid.Cell label="实际开始" hint={isChildProject ? "来自上级任务" : undefined}>
                <InputControl spec={{ valueType: "date", editor: "datePicker", state: !canEditCurrent || isChildProject ? "disabled" : "normal" }} value={draft.startDate} onChange={(value) => onDraftChange("startDate", String(value || ""))} placeholder="选择日期" />
              </FieldGrid.Cell>
              <FieldGrid.Cell label="实际结束" hint={isChildProject ? "来自上级任务" : undefined}>
                <InputControl spec={{ valueType: "date", editor: "datePicker", state: !canEditCurrent || isChildProject ? "disabled" : "normal" }} value={draft.endDate} onChange={(value) => onDraftChange("endDate", String(value || ""))} placeholder="选择日期" />
              </FieldGrid.Cell>
              <FieldGrid.Cell label="完成度">
                <InputControl
                  spec={{ valueType: "number", editor: "number", format: "percent", state: !canEditCurrent ? "disabled" : "normal" }}
                  value={draft.completionPercent}
                  onChange={(value) => onDraftChange("completionPercent", value === null || value === "" || value === undefined ? null : Number(value))}
                />
              </FieldGrid.Cell>
              <FieldGrid.Cell label="项目描述" span="wide">
                <InputControl
                  spec={{ valueType: "string", editor: "textarea", state: !canEditCurrent ? "disabled" : "normal" }}
                  value={draft.description || ""}
                  onChange={(value) => onDraftChange("description", String(value || "") || null)}
                />
              </FieldGrid.Cell>
            </FieldGrid>
          </SectionCard>

          <SectionCard title="项目人员">
            <FieldGrid columns={2} mode="mixed">
              <FieldGrid.Cell label="项目负责人">
                <InputControl
                  spec={{ valueType: "reference", editor: "autocomplete", options: { source: "remote", fkKey: "work.projects.member.employee", endpoint: WORK_REFERENCE_OPTIONS_ENDPOINT, returnField: "id" }, state: !canManageCurrent || creating ? "disabled" : "normal" }}
                  value={draft.leader?.employeeNumber || ""}
                  displayValue={draft.leader?.name || ""}
                  placeholder="搜索负责人"
                  className={draft.leader?.confirmationStatus === "pending" ? pendingFieldClassName : undefined}
                  onChange={(_value, option) => onLeaderChange(option as FkFieldOption | undefined)}
                />
              </FieldGrid.Cell>
              {MULTI_PROJECT_ROLES.map((role) => (
                <FieldGrid.Cell key={role} label={role} span={role === "知会" ? "wide" : undefined}>
                  <ProjectMemberTagsInput
                    value={draft.roleGroups[role]}
                    disabled={!canManageCurrent || creating}
                    onChange={(members) => onRoleMembersChange(role, members)}
                  />
                </FieldGrid.Cell>
              ))}
            </FieldGrid>
          </SectionCard>

          <ProjectRasciMatrix rows={rasciRows} />
        </>
      )}

      {activeTab === "plan" && (
        <>
          <ProjectPlanManagementSection
            projectId={draft.id}
            canEdit={canEditCurrent}
            disabled={saving || creating}
            onToast={onToast}
          />

          <ProjectTasksSection
            projectId={draft.id}
            canEdit={canEditCurrent}
            disabled={saving || creating}
            onToast={onToast}
            onCreateChildProject={onCreateChildProject}
            onChanged={() => onProjectTasksChanged(draft.id)}
          />
        </>
      )}
    </div>
  ) : null;
  const emptyContent = (
    <div className="flex min-h-64 items-center justify-center p-8">
      <div className="text-center">
        <p className="text-sm font-medium text-slate-600">暂无可编辑项目</p>
        <p className="mt-1 text-sm text-slate-400">请选择左侧项目，或新建项目后维护资料。</p>
      </div>
    </div>
  );
  return (
    <PanelCard className="bg-slate-50" bodyClassName="p-4">
      <CreatePanel
        variant="detail"
        title={editorTitle}
        createTitle="新建项目"
        creating={creating}
        canCreate={false}
        onSubmit={onSave}
        onCancel={onCancelCreate}
        dirty={dirty}
        onSave={selectedProject ? onSave : undefined}
        canSave={canSave}
        saveLabel="保存项目"
        onDelete={selectedProject && canDeleteCurrent ? onDeleteProject : undefined}
        canDelete={canDeleteCurrent}
        deleteLabel="删除项目"
        submitDisabled={!canSave}
        submitting={saving}
        submitLabel="创建项目"
        cancelLabel="取消"
        createContent={projectContent ?? emptyContent}
      >
        {projectContent ?? emptyContent}
      </CreatePanel>
    </PanelCard>
  );
}
