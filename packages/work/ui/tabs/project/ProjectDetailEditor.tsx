"use client";

import { useEffect, useState } from "react";
import { createBlockSurfaceSection, createFormSection, createPageBody, createPageDataSection, createTabbedPageBody, type FormSurfaceItemSpec, PageSurface, type PageSurfaceCompleteBodySpec } from "@workspace/core/ui";
import type { ReferenceOption } from "@workspace/core/ui";
import ProjectPlanManagementSection from "./ProjectPlanManagementSection";
import { buildProjectRasciMatrixSurface } from "./ProjectRasciMatrix";
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

type ProjectDetailEditorProps = {
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
  onLeaderChange: (option?: ReferenceOption) => void;
  onRoleMembersChange: (role: MultiProjectRole, members: EmployeeTag[]) => void;
  onCreateChildProject: (task: ProjectTaskItem) => void;
  onOpenProject: (projectId: number) => void;
  onProjectTasksChanged: (projectId: number | null) => void;
  onToast: (toast: { type: "success" | "error"; message: string }) => void;
};

export function useProjectDetailEditorBlock({
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
}: ProjectDetailEditorProps): PageSurfaceCompleteBodySpec {
  const [activeTab, setActiveTab] = useState("overview");
  const [addingMemberRole, setAddingMemberRole] = useState<MultiProjectRole | null>(null);
  const isChildProject = Boolean(draft?.parentProjectTaskId);
  const parentProjectLabel = draft
    ? [draft.parentProjectCode, draft.parentProjectName].filter(Boolean).join(" · ") || "未设置"
    : "未设置";

  useEffect(() => {
    if (activeTab !== "overview" && activeTab !== "plan") setActiveTab("overview");
  }, [activeTab]);

  const openParentProjectPlan = (projectId: number | null) => { if (projectId) { setActiveTab("plan"); onOpenProject(projectId); } };
  const startCreateChildProject = (task: ProjectTaskItem) => {
    setActiveTab("overview");
    onCreateChildProject(task);
  };
  const overviewFields: FormSurfaceItemSpec[] = draft ? [
    {
      kind: "section",
      key: "basic",
      title: "基础信息",
      layout: { columns: 3 },
      items: [
        ...(isChildProject ? [
          { kind: "readonly" as const, key: "parentProject", label: "上级项目", value: parentProjectLabel, disabled: !draft.parentProjectId, onClick: () => draft.parentProjectId && onOpenProject(draft.parentProjectId), textAlign: "left" as const },
          { kind: "readonly" as const, key: "parentTask", label: "上级任务", value: draft.parentProjectTaskName || "未设置", disabled: !draft.parentProjectId, onClick: () => openParentProjectPlan(draft.parentProjectId), textAlign: "left" as const },
          { kind: "readonly" as const, key: "parentStatus", label: "上级任务状态", value: draft.parentProjectTaskStatus || "未开始" },
        ] : []),
        { kind: "readonly", key: "code", label: "项目编码", value: projectCode(selectedProject, draft),  },
        { key: "projectType", label: "项目类型", spec: { valueType: "string", control: "choice", options: { source: "static", items: PROJECT_TYPE_PICKER_OPTIONS }, state: !canManageCurrent || !creating ? "disabled" : "normal" }, value: draft.projectType, onChange: (value: unknown) => onDraftChange("projectType", (String(value || "") || "department") as ProjectDraft["projectType"]) },
        { kind: "readonly", key: "leaderName", label: "项目负责人", value: draft.leader?.name || "未设置" },
        { key: "name", label: "项目名称", required: true, spec: { valueType: "string", control: "text", state: !canManageCurrent ? "disabled" : "normal" }, value: draft.name, onChange: (value: unknown) => onDraftChange("name", String(value ?? "")) },
        { key: "leadingDepartment", label: "主导部门", required: draft.projectType === "department", spec: { valueType: "reference", control: "reference", options: { source: "remote", fkKey: "work.projects.leadingDepartment", endpoint: WORK_REFERENCE_OPTIONS_ENDPOINT, returnField: "id" }, state: !canManageCurrent ? "disabled" : "normal" }, value: draft.leadingDepartmentId ? String(draft.leadingDepartmentId) : "", displayValue: draft.leadingDepartmentName || "", placeholder: "搜索部门名称、编码", onChange: (_value: unknown, option: unknown) => {
          const fk = option as ReferenceOption | undefined;
          onDraftChange("leadingDepartmentId", fk?.id ?? null);
          onDraftChange("leadingDepartmentName", fk?.name ?? null);
          onDraftChange("leadingDepartmentCode", fk?.subtitle ?? null);
        } },
        { key: "projectLevel", label: "项目级别", spec: { valueType: "string", control: "choice", options: { source: "static", items: PROJECT_LEVEL_PICKER_OPTIONS }, state: !canEditCurrent ? "disabled" : "normal" }, value: draft.projectLevel || "普通", onChange: (value: unknown) => onDraftChange("projectLevel", String(value || "") || "普通") },
        { key: "baselineStartDate", label: "计划开始", hint: isChildProject ? "来自上级任务" : undefined, spec: { valueType: "date", control: "temporal", precision: "date", state: !canEditCurrent || isChildProject ? "disabled" : "normal" }, value: draft.baselineStartDate, onChange: (value: unknown) => onDraftChange("baselineStartDate", String(value || "")), placeholder: "选择日期" },
        { key: "baselineEndDate", label: "计划结束", hint: isChildProject ? "来自上级任务" : undefined, spec: { valueType: "date", control: "temporal", precision: "date", state: !canEditCurrent || isChildProject ? "disabled" : "normal" }, value: draft.baselineEndDate, onChange: (value: unknown) => onDraftChange("baselineEndDate", String(value || "")), placeholder: "选择日期" },
        { key: "startDate", label: "实际开始", hint: isChildProject ? "来自上级任务" : undefined, spec: { valueType: "date", control: "temporal", precision: "date", state: !canEditCurrent || isChildProject ? "disabled" : "normal" }, value: draft.startDate, onChange: (value: unknown) => onDraftChange("startDate", String(value || "")), placeholder: "选择日期" },
        { key: "endDate", label: "实际结束", hint: isChildProject ? "来自上级任务" : undefined, spec: { valueType: "date", control: "temporal", precision: "date", state: !canEditCurrent || isChildProject ? "disabled" : "normal" }, value: draft.endDate, onChange: (value: unknown) => onDraftChange("endDate", String(value || "")), placeholder: "选择日期" },
        { key: "completionPercent", label: "完成度", spec: { valueType: "number", control: "number", format: "percent", state: !canEditCurrent ? "disabled" : "normal" }, value: draft.completionPercent, onChange: (value: unknown) => onDraftChange("completionPercent", value === null || value === "" || value === undefined ? null : Number(value)) },
        { key: "description", label: "项目描述", span: "wide", spec: { valueType: "string", control: "text", multiline: true, state: !canEditCurrent ? "disabled" : "normal" }, value: draft.description || "", onChange: (value: unknown) => onDraftChange("description", String(value || "") || null) },
      ],
    },
    {
      kind: "section",
      key: "members",
      title: "项目人员",
      layout: { columns: 2 },
      items: [
        { key: "leader", label: "项目负责人", spec: { valueType: "reference", control: "reference", options: { source: "remote", fkKey: "work.projects.member.employee", endpoint: WORK_REFERENCE_OPTIONS_ENDPOINT, returnField: "id" }, state: !canManageCurrent || creating ? "disabled" : "normal" }, value: draft.leader?.employeeNumber || "", displayValue: draft.leader?.name || "", placeholder: "搜索负责人",  onChange: (_value: unknown, option: unknown) => onLeaderChange(option as ReferenceOption | undefined) },
        ...MULTI_PROJECT_ROLES.map((role): FormSurfaceItemSpec => ({
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
          append: !canManageCurrent || creating ? undefined : addingMemberRole === role
            ? {
                field: {
                  key: `add-${role}`,
                  label: `添加${role}`,
                  spec: { valueType: "reference", control: "reference", options: { source: "remote", fkKey: "work.projects.member.employee", endpoint: WORK_REFERENCE_OPTIONS_ENDPOINT, returnField: "id" } },
                  value: "",
                  autoFocus: true,
                  placeholder: "搜索员工",
                  onKeyDown: (event) => {
                    if (event.key === "Escape") setAddingMemberRole(null);
                  },
                  onChange: (_value, option) => {
                    const employee = employeeFromOption(option as ReferenceOption | undefined);
                    if (!employee) return;
                    onRoleMembersChange(role, dedupeMembers([...draft.roleGroups[role], employee]));
                    setAddingMemberRole(null);
                  },
                },
              }
            : {
                action: {
                  key: `start-add-${role}`,
                  label: "+",
                  onClick: () => setAddingMemberRole(role),
                  size: "sm",
                },
              },
        })),
      ],
    },
  ] : [];

  if (!draft) return createPageBody([createBlockSurfaceSection("project-empty", {
    kind: "empty",
    presentation: "plain",
    content: (
      <div>
        <p className="text-sm font-medium text-slate-600">暂无可编辑项目</p>
        <p className="mt-1 text-sm text-slate-400">请选择左侧项目，或新建项目后维护资料。</p>
      </div>
    )
  })]);

  const actions = [
    ...(creating ? [
      { key: "cancel", label: "取消", icon: "cancel" as const, disabled: saving, onClick: onCancelCreate },
      { key: "create", label: saving ? "创建中..." : "创建项目", icon: "create" as const, variant: "primary" as const, disabled: !canSave || saving, onClick: onSave },
    ] : []),
    ...(selectedProject ? [
      { key: "save", label: "保存项目", icon: "save" as const, variant: "primary" as const, disabled: !canSave || saving, onClick: onSave },
    ] : []),
    ...(selectedProject && canDeleteCurrent ? [
      { key: "delete", label: "删除项目", icon: "delete-bin" as const, variant: "danger" as const, disabled: saving, onClick: onDeleteProject },
    ] : []),
  ];

  return createTabbedPageBody(
    [
      {
        key: "overview",
        label: editorTitle,
        header: actions.length ? { actions } : undefined,
        body: {
          kind: "section",
          sections: createPageBody([
            createFormSection("overview-fields", { kind: "fields", content: { items: overviewFields } }),
            createPageDataSection("rasci", buildProjectRasciMatrixSurface(rasciRows)),
          ]).sections,
        },
      },
      {
        key: "plan",
        label: "项目计划",
        body: {
          kind: "section",
          sections: createPageBody([
            createBlockSurfaceSection("plan-composition", {
              kind: "content",
              content: (
                <div className="space-y-4">
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
                    onCreateChildProject={startCreateChildProject}
                    onChanged={() => onProjectTasksChanged(draft.id)}
                  />
                </div>
              ),
            }),
          ]).sections,
        },
      },
    ],
    { active: activeTab, onChange: setActiveTab },
  );
}

export default function ProjectDetailEditor(props: ProjectDetailEditorProps) {
  const body = useProjectDetailEditorBlock(props);
  return (
    <PageSurface kind="standard"
      embedded
      body={body}
    />
  );
}
