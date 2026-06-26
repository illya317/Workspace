"use client";

import { useEffect, useState } from "react";
import {
  FormSurface,
  NavigationSurface,
  type FormSurfaceItemSpec,
} from "@workspace/core/ui";
import type { FkFieldOption } from "@workspace/core/ui";
import ProjectPlanManagementSection from "./ProjectPlanManagementSection";
import ProjectRasciMatrix from "./ProjectRasciMatrix";
import type { ProjectRasciRow } from "./ProjectRasciMatrix";
import ProjectTasksSection from "./ProjectTasksSection";
import {
  MULTI_PROJECT_ROLES,
  PROJECT_LEVEL_PICKER_OPTIONS,
  PROJECT_TYPE_PICKER_OPTIONS,
  dedupeMembers,
  employeeFromOption,
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
  const overviewFields: FormSurfaceItemSpec<EmployeeTag>[] = draft ? [
    {
      kind: "section",
      key: "basic",
      title: "基础信息",
      columns: 3,
      fields: [
        ...(isChildProject ? [
          { kind: "readonly" as const, key: "parentProject", label: "上级项目", value: parentProjectLabel, disabled: !draft.parentProjectId, onClick: () => draft.parentProjectId && onOpenProject(draft.parentProjectId), textAlign: "left" as const },
          { kind: "readonly" as const, key: "parentTask", label: "上级任务", value: draft.parentProjectTaskName || "未设置", disabled: !draft.parentProjectId, onClick: () => openParentProjectPlan(draft.parentProjectId), textAlign: "left" as const },
          { kind: "readonly" as const, key: "parentStatus", label: "上级任务状态", value: draft.parentProjectTaskStatus || "未开始" },
        ] : []),
        { kind: "readonly", key: "code", label: "项目编码", value: projectCode(selectedProject, draft), fontRole: "mono" },
        { key: "projectType", label: "项目类型", spec: { valueType: "string", editor: "select", options: { source: "static", items: PROJECT_TYPE_PICKER_OPTIONS }, state: !canManageCurrent || !creating ? "disabled" : "normal" }, value: draft.projectType, onChange: (value) => onDraftChange("projectType", (String(value || "") || "department") as ProjectDraft["projectType"]) },
        { kind: "readonly", key: "leaderName", label: "项目负责人", value: draft.leader?.name || "未设置" },
        { key: "name", label: "项目名称", required: true, spec: { valueType: "string", editor: "input", state: !canManageCurrent ? "disabled" : "normal" }, value: draft.name, onChange: (value) => onDraftChange("name", String(value ?? "")) },
        { key: "leadingDepartment", label: "主导部门", required: draft.projectType === "department", spec: { valueType: "reference", editor: "autocomplete", options: { source: "remote", fkKey: "work.projects.leadingDepartment", endpoint: WORK_REFERENCE_OPTIONS_ENDPOINT, returnField: "id" }, state: !canManageCurrent ? "disabled" : "normal" }, value: draft.leadingDepartmentId ? String(draft.leadingDepartmentId) : "", displayValue: draft.leadingDepartmentName || "", placeholder: "搜索部门名称、编码", onChange: (_value, option) => {
          const fk = option as FkFieldOption | undefined;
          onDraftChange("leadingDepartmentId", fk?.id ?? null);
          onDraftChange("leadingDepartmentName", fk?.name ?? null);
          onDraftChange("leadingDepartmentCode", fk?.subtitle ?? null);
        } },
        { key: "projectLevel", label: "项目级别", spec: { valueType: "string", editor: "select", options: { source: "static", items: PROJECT_LEVEL_PICKER_OPTIONS }, state: !canEditCurrent ? "disabled" : "normal" }, value: draft.projectLevel || "普通", onChange: (value) => onDraftChange("projectLevel", String(value || "") || "普通") },
        { key: "baselineStartDate", label: "计划开始", hint: isChildProject ? "来自上级任务" : undefined, spec: { valueType: "date", editor: "datePicker", state: !canEditCurrent || isChildProject ? "disabled" : "normal" }, value: draft.baselineStartDate, onChange: (value) => onDraftChange("baselineStartDate", String(value || "")), placeholder: "选择日期" },
        { key: "baselineEndDate", label: "计划结束", hint: isChildProject ? "来自上级任务" : undefined, spec: { valueType: "date", editor: "datePicker", state: !canEditCurrent || isChildProject ? "disabled" : "normal" }, value: draft.baselineEndDate, onChange: (value) => onDraftChange("baselineEndDate", String(value || "")), placeholder: "选择日期" },
        { key: "startDate", label: "实际开始", hint: isChildProject ? "来自上级任务" : undefined, spec: { valueType: "date", editor: "datePicker", state: !canEditCurrent || isChildProject ? "disabled" : "normal" }, value: draft.startDate, onChange: (value) => onDraftChange("startDate", String(value || "")), placeholder: "选择日期" },
        { key: "endDate", label: "实际结束", hint: isChildProject ? "来自上级任务" : undefined, spec: { valueType: "date", editor: "datePicker", state: !canEditCurrent || isChildProject ? "disabled" : "normal" }, value: draft.endDate, onChange: (value) => onDraftChange("endDate", String(value || "")), placeholder: "选择日期" },
        { key: "completionPercent", label: "完成度", spec: { valueType: "number", editor: "number", format: "percent", state: !canEditCurrent ? "disabled" : "normal" }, value: draft.completionPercent, onChange: (value) => onDraftChange("completionPercent", value === null || value === "" || value === undefined ? null : Number(value)) },
        { key: "description", label: "项目描述", span: "wide", spec: { valueType: "string", editor: "textarea", state: !canEditCurrent ? "disabled" : "normal" }, value: draft.description || "", onChange: (value) => onDraftChange("description", String(value || "") || null) },
      ],
    },
    {
      kind: "section",
      key: "members",
      title: "项目人员",
      columns: 2,
      fields: [
        { key: "leader", label: "项目负责人", spec: { valueType: "reference", editor: "autocomplete", options: { source: "remote", fkKey: "work.projects.member.employee", endpoint: WORK_REFERENCE_OPTIONS_ENDPOINT, returnField: "id" }, state: !canManageCurrent || creating ? "disabled" : "normal" }, value: draft.leader?.employeeNumber || "", displayValue: draft.leader?.name || "", placeholder: "搜索负责人", className: draft.leader?.confirmationStatus === "pending" ? pendingFieldClassName : undefined, onChange: (_value, option) => onLeaderChange(option as FkFieldOption | undefined) },
        ...MULTI_PROJECT_ROLES.map((role): FormSurfaceItemSpec<EmployeeTag> => ({
          kind: "tagList",
          key: role,
          label: role,
          span: role === "知会" ? "wide" : undefined,
          items: draft.roleGroups[role],
          getKey: (member) => member.id,
          getLabel: (member) => member.name,
          onRemove: (member) => onRoleMembersChange(role, draft.roleGroups[role].filter((item) => item.id !== member.id)),
          disabled: !canManageCurrent || creating,
          confirmMessage: (member) => `确定删除项目人员「${member.name}」吗？删除后需要保存才会生效。`,
          itemTitle: (member) => (member.confirmationStatus === "pending" ? `${member.name}：待确认` : member.name),
          itemClassName: (member) => member.confirmationStatus === "pending" ? "!border-amber-200 !bg-amber-50 !text-amber-800 shadow-amber-100" : "",
          append: !canManageCurrent || creating ? undefined : {
            field: {
              key: `add-${role}`,
              label: `添加${role}`,
              spec: { valueType: "reference", editor: "autocomplete", options: { source: "remote", fkKey: "work.projects.member.employee", endpoint: WORK_REFERENCE_OPTIONS_ENDPOINT, returnField: "id" } },
              value: "",
              placeholder: "搜索员工",
              onChange: (_value, option) => {
                const employee = employeeFromOption(option as FkFieldOption | undefined);
                if (!employee) return;
                onRoleMembersChange(role, dedupeMembers([...draft.roleGroups[role], employee]));
              },
            },
          },
        })),
      ],
    },
    { kind: "note", key: "rasci", content: <ProjectRasciMatrix rows={rasciRows} /> },
  ] : [];

  const projectContent = draft ? (
    <div className="space-y-4">
      <NavigationSurface
        kind="tabs"
        tabs={{
          tabs: [
            { key: "overview", label: "项目概览" },
            { key: "plan", label: "项目计划" },
          ],
          active: activeTab,
          onChange: setActiveTab,
          className: "mb-2",
        }}
      />

      {activeTab === "overview" && (
        <FormSurface<EmployeeTag> kind="fields" fields={overviewFields} />
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
    <FormSurface
      kind="fields"
      className="rounded-lg border border-slate-200 bg-slate-50 p-4"
      fields={[{
        kind: "section",
        key: "project-editor",
        title: editorTitle,
        fields: [{ kind: "note", key: "project-content", content: projectContent ?? emptyContent }],
        actions: [
          ...(creating ? [
            { key: "cancel", label: "取消", disabled: saving, onClick: onCancelCreate },
            { key: "create", label: saving ? "创建中..." : "创建项目", variant: "primary" as const, disabled: !canSave || saving, onClick: onSave },
          ] : []),
          ...(selectedProject ? [
            { key: "save", label: "保存项目", variant: "primary" as const, disabled: !canSave || saving, onClick: onSave },
          ] : []),
          ...(selectedProject && canDeleteCurrent ? [
            { key: "delete", label: "删除项目", variant: "danger" as const, disabled: saving, onClick: onDeleteProject },
          ] : []),
        ],
      }]}
    />
  );
}
