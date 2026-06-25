"use client";

import { useEffect, useState } from "react";
import {
  FkFieldInput,
  FormField,
  PanelCard,
  SectionCard,
  TabBar,
  TextareaField,
  TextField,
  Toolbar,
} from "@workspace/core/ui";
import type { FkFieldOption, ToolbarItem } from "@workspace/core/ui";
import { DateField, OptionField, ParentProjectField, PercentField, ReadOnlyInfoField, LinkedInfoField } from "./ProjectDetailFields";
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

const inputClassName = "h-10";

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
  const detailToolbarItems: ToolbarItem[] = [
    {
      kind: "custom",
      key: "title",
      section: "view",
      content: (
        <div>
          <div className="text-sm font-semibold text-slate-900">{editorTitle}</div>
          {dirty && <p className="mt-1 text-xs text-amber-600">有未保存修改</p>}
        </div>
      ),
    },
    ...(!creating && selectedProject && canDeleteCurrent
      ? [{
          kind: "icon-button" as const,
          key: "delete-project",
          icon: "delete-bin" as const,
          label: "删除项目",
          variant: "danger" as const,
          disabled: saving,
          onClick: onDeleteProject,
        }]
      : []),
    ...(creating
      ? [{
          kind: "icon-button" as const,
          key: "cancel-create",
          icon: "cancel" as const,
          label: "取消",
          onClick: onCancelCreate,
        }]
      : []),
    ...(draft && (selectedProject || creating)
      ? [{
          kind: "icon-button" as const,
          key: "save-project",
          icon: creating ? "add" as const : "save" as const,
          label: saving ? "保存中..." : creating ? "创建项目" : "保存项目",
          variant: "primary" as const,
          disabled: !canSave,
          onClick: onSave,
        }]
      : []),
  ];

  return (
    <PanelCard className="bg-slate-50" bodyClassName="p-4">
      <Toolbar className="mb-4 p-4" items={detailToolbarItems} />

      {draft ? (
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
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {isChildProject && (
                    <>
                      <ParentProjectField
                        value={parentProjectLabel}
                        disabled={!draft.parentProjectId}
                        onClick={() => draft.parentProjectId && onOpenProject(draft.parentProjectId)}
                      />
                      <LinkedInfoField
                        label="上级任务"
                        value={draft.parentProjectTaskName || "未设置"}
                        disabled={!draft.parentProjectId}
                        onClick={() => openParentProjectPlan(draft.parentProjectId)}
                      />
                      <ReadOnlyInfoField label="上级任务状态" value={draft.parentProjectTaskStatus || "未开始"} />
                    </>
                  )}
                  <FormField label="项目编码">
                    <TextField
                      value={projectCode(selectedProject, draft)}
                      readOnly
                      className="h-10 cursor-default font-mono text-slate-600"
                    />
                    <p className="mt-1 text-xs font-medium text-slate-400">
                      {draft.projectType === "company" ? "公司项目按 FH-YY-NN 自动编号" : draft.projectType === "department" ? "部门项目按部门编码-YY-NN 自动编号" : "其他项目不自动编号"}
                    </p>
                  </FormField>
                  <OptionField
                    label="项目类型"
                    value={draft.projectType}
                    options={PROJECT_TYPE_PICKER_OPTIONS}
                    disabled={!canManageCurrent || !creating}
                    onChange={(value) => onDraftChange("projectType", (value || "department") as ProjectDraft["projectType"])}
                  />
                  <FormField label="项目负责人">
                    <TextField
                      value={draft.leader?.name || "未设置"}
                      readOnly
                      className="h-10 cursor-default text-slate-600"
                    />
                  </FormField>
                  <FormField label="项目名称" required>
                    <TextField
                      value={draft.name}
                      disabled={!canManageCurrent}
                      onChange={(value) => onDraftChange("name", value)}
                      className={inputClassName}
                      unstyled
                    />
                  </FormField>
                  <FormField label="主导部门" required={draft.projectType === "department"}>
                    <FkFieldInput
                      fkKey="work.projects.leadingDepartment"
                      endpoint={WORK_REFERENCE_OPTIONS_ENDPOINT}
                      value={draft.leadingDepartmentId ? String(draft.leadingDepartmentId) : ""}
                      displayValue={draft.leadingDepartmentName || ""}
                      disabled={!canManageCurrent}
                      placeholder="搜索部门名称、编码"
                      onChange={(_label, option) => {
                        onDraftChange("leadingDepartmentId", option?.id ?? null);
                        onDraftChange("leadingDepartmentName", option?.name ?? null);
                        onDraftChange("leadingDepartmentCode", option?.subtitle ?? null);
                      }}
                    />
                  </FormField>
                  <OptionField label="项目级别" value={draft.projectLevel || "普通"} options={PROJECT_LEVEL_PICKER_OPTIONS} disabled={!canEditCurrent} onChange={(value) => onDraftChange("projectLevel", value || "普通")} />
                  <DateField label="计划开始" value={draft.baselineStartDate} disabled={!canEditCurrent || isChildProject} hint={isChildProject ? "来自上级任务" : undefined} onChange={(value) => onDraftChange("baselineStartDate", value)} />
                  <DateField label="计划结束" value={draft.baselineEndDate} disabled={!canEditCurrent || isChildProject} hint={isChildProject ? "来自上级任务" : undefined} onChange={(value) => onDraftChange("baselineEndDate", value)} />
                  <DateField label="实际开始" value={draft.startDate} disabled={!canEditCurrent || isChildProject} hint={isChildProject ? "来自上级任务" : undefined} onChange={(value) => onDraftChange("startDate", value)} />
                  <DateField label="实际结束" value={draft.endDate} disabled={!canEditCurrent || isChildProject} hint={isChildProject ? "来自上级任务" : undefined} onChange={(value) => onDraftChange("endDate", value)} />
                  <PercentField
                    label="完成度"
                    value={draft.completionPercent}
                    disabled={!canEditCurrent}
                    onChange={(value) => onDraftChange("completionPercent", value)}
                  />
                  <FormField label="项目描述" className="md:col-span-2 xl:col-span-3">
                    <TextareaField
                      value={draft.description || ""}
                      disabled={!canEditCurrent}
                      onChange={(value) => onDraftChange("description", value || null)}
                      rows={3}
                      className="text-sm"
                    />
                  </FormField>
                </div>
              </SectionCard>

              <SectionCard title="项目人员">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <FormField label="项目负责人">
                    <FkFieldInput
                      fkKey="work.projects.member.employee"
                      endpoint={WORK_REFERENCE_OPTIONS_ENDPOINT}
                      value={draft.leader?.employeeNumber || ""}
                      displayValue={draft.leader?.name || ""}
                      disabled={!canManageCurrent || creating}
                      placeholder="搜索负责人"
                      className={draft.leader?.confirmationStatus === "pending" ? "!border-amber-200 !bg-amber-50 !text-amber-800" : undefined}
                      onChange={(_label, option) => onLeaderChange(option)}
                    />
                  </FormField>

                  {MULTI_PROJECT_ROLES.map((role) => (
                    <FormField key={role} label={role} className={role === "知会" ? "md:col-span-2" : undefined}>
                      <ProjectMemberTagsInput
                        value={draft.roleGroups[role]}
                        disabled={!canManageCurrent || creating}
                        onChange={(members) => onRoleMembersChange(role, members)}
                      />
                    </FormField>
                  ))}
                </div>
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
      ) : (
        <div className="flex min-h-64 items-center justify-center p-8">
          <div className="text-center">
            <p className="text-sm font-medium text-slate-600">暂无可编辑项目</p>
            <p className="mt-1 text-sm text-slate-400">请选择左侧项目，或新建项目后维护资料。</p>
          </div>
        </div>
      )}
    </PanelCard>
  );
}
