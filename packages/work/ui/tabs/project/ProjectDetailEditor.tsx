"use client";

import { useState } from "react";
import { workspacePath } from "@workspace/core/routing";
import { createEmptySection, createFormSection, createPageBody, createSectionSection, type BodySurfaceSectionBodyProps, type BodySurfaceSectionCreateSpec, type FormSurfaceActionSpec, type FormSurfaceItemSpec, BodySurface } from "@workspace/core/ui";
import type { ReferenceOption } from "@workspace/core/ui";
import { canEditActualEndDate, todayDateString } from "@workspace/platform/completion-date-policy";
import { actionRuntimeCreateSubmission } from "@workspace/platform/ui";
import type { ActionRuntime } from "@workspace/platform/workflow-action-runtime";
import {
  MULTI_PROJECT_ROLES,
  PROJECT_LEVEL_OPTION_SPECS,
  PROJECT_TYPE_PICKER_OPTIONS,
  dedupeDepartments,
  dedupeMembers,
  departmentFromOption,
  employeeFromOption,
  projectCode,
  type DepartmentTag,
  type EmployeeTag,
  type MultiProjectRole,
  type ProjectDraft,
  type ProjectItem,
} from "./model";
import { WORK_REFERENCE_OPTIONS_ENDPOINT } from "./reference-options";
import { useTenantConfig } from "@workspace/platform/ui/tenant-config";

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
  canCreate?: boolean;
  createActionRuntime?: ActionRuntime | null;
  creating: boolean;
  onStartCreate: () => void;
  onCancelCreate: () => void;
  onDeleteProject: () => void;
  onSave: () => void | Promise<void>;
  onDraftChange: <K extends keyof ProjectDraft>(key: K, value: ProjectDraft[K]) => void;
  onLeaderChange: (option?: ReferenceOption) => void;
  onRoleMembersChange: (role: MultiProjectRole, members: EmployeeTag[]) => void;
};

export function useProjectDetailEditorSection({
  editorTitle,
  draft,
  selectedProject,
  canEditCurrent,
  canManageCurrent,
  canDeleteCurrent,
  saving,
  canSave,
  canCreate,
  createActionRuntime,
  creating,
  onStartCreate,
  onCancelCreate,
  onDeleteProject,
  onSave,
  onDraftChange,
  onLeaderChange,
  onRoleMembersChange,
}: ProjectDetailEditorProps): BodySurfaceSectionBodyProps {
  const [addingMemberRole, setAddingMemberRole] = useState<MultiProjectRole | null>(null);
  const tenantConfig = useTenantConfig();
  const allEmployeeReferenceOptions = {
    source: "remote" as const,
    fkKey: "work.projects.member.employee",
    endpoint: WORK_REFERENCE_OPTIONS_ENDPOINT,
    returnField: "id" as const,
  };
  const enablingDepartmentIds = draft?.enablingDepartmentIds ?? [];
  const projectMemberScopeReady = draft?.projectType === "company" || enablingDepartmentIds.length > 0;
  const enablingDepartmentEmployeeReferenceOptions = {
    source: "remote" as const,
    fkKey: "work.projects.member.enablingDepartmentEmployee",
    endpoint: WORK_REFERENCE_OPTIONS_ENDPOINT,
    returnField: "id" as const,
    queryParams: {
      departmentIds: enablingDepartmentIds.join(","),
      projectType: draft?.projectType ?? "department",
    },
  };
  const memberFieldDisabled = !canManageCurrent;
  const enablingDepartmentMemberDisabled = memberFieldDisabled || !projectMemberScopeReady;
  const companyLeadingLocked = draft?.projectType === "company";
  const updateEnablingDepartments = (departments: DepartmentTag[]) => {
    const next = dedupeDepartments(departments);
    onDraftChange("enablingDepartments", next);
    onDraftChange("enablingDepartmentIds", next.map((department) => department.id));
  };
  const updateEnablingDepartmentAt = (index: number, option?: ReferenceOption) => {
    if (!option) {
      if (!draft?.enablingDepartments[index]) return;
      updateEnablingDepartments(draft.enablingDepartments.filter((_, itemIndex) => itemIndex !== index));
      return;
    }
    const department = departmentFromOption(option);
    if (!department) return;
    const next = [...(draft?.enablingDepartments ?? [])];
    next[index] = department;
    updateEnablingDepartments(next.filter((item): item is DepartmentTag => Boolean(item)));
  };
  const enablingDepartmentFieldCount = canManageCurrent
    ? Math.max(1, (draft?.enablingDepartments.length ?? 0) + 1)
    : Math.max(1, draft?.enablingDepartments.length ?? 0);
  const enablingDepartmentFields: FormSurfaceItemSpec[] = Array.from({ length: enablingDepartmentFieldCount }, (_, index) => {
    const department = draft?.enablingDepartments[index] ?? null;
    return {
      key: `enablingDepartment-${index}`,
      label: index === 0 ? "赋能部门" : `赋能部门${index + 1}`,
      required: index === 0,
      spec: {
        valueType: "reference" as const,
        control: "reference" as const,
        options: {
          source: "remote" as const,
          fkKey: "work.projects.enablingDepartment",
          endpoint: WORK_REFERENCE_OPTIONS_ENDPOINT,
          returnField: "id" as const,
        },
        state: !canManageCurrent ? "disabled" as const : "normal" as const,
      },
      value: department ? String(department.id) : "",
      displayValue: department?.name ?? "",
      placeholder: "搜索部门名称、编码",
      onChange: (_value: unknown, option: unknown) => updateEnablingDepartmentAt(index, option as ReferenceOption | undefined),
    };
  });
  const actions: FormSurfaceActionSpec[] = [
    ...(creating ? [
      { key: "cancel", action: "cancel" as const, label: "取消", disabled: saving, onClick: onCancelCreate },
      { key: "create", action: "submit" as const, label: saving ? "提交中..." : "提交确认", disabled: !canSave || saving, onClick: onSave },
    ] : []),
    ...(selectedProject ? [
      ...(selectedProject.workspaceEnabled ? [
        { key: "project-space", action: "view" as const, label: "查看", disabled: saving, onClick: () => window.location.assign(workspacePath(`/work/project/${selectedProject.id}/space`)) },
      ] : []),
      { key: "save", action: "save" as const, label: "保存项目", disabled: !canSave || saving, onClick: onSave },
    ] : []),
    ...(selectedProject && canDeleteCurrent ? [
      { key: "delete", action: "delete" as const, label: "删除项目", disabled: saving, onClick: onDeleteProject },
    ] : []),
  ];
  const overviewFields: FormSurfaceItemSpec[] = draft ? [
    {
      kind: "section",
      key: "basic",
      title: "基础信息",
      layout: { columns: 3 },
      items: [
        { kind: "readonly", key: "code", label: "项目编码", value: projectCode(selectedProject, draft),  },
        { key: "projectType", label: "项目类型", required: true, spec: { valueType: "string", control: "choice", options: { source: "static", items: PROJECT_TYPE_PICKER_OPTIONS }, state: !canManageCurrent || !creating ? "disabled" : "normal" }, value: draft.projectType, onChange: (value: unknown) => onDraftChange("projectType", (String(value || "") || "department") as ProjectDraft["projectType"]) },
        { kind: "readonly", key: "leaderName", label: "项目负责人", value: draft.leader?.name || "未设置" },
        { key: "name", label: "项目名称", required: true, spec: { valueType: "string", control: "text", state: !canManageCurrent ? "disabled" : "normal" }, value: draft.name, onChange: (value: unknown) => onDraftChange("name", String(value ?? "")) },
        { key: "workspaceEnabled", label: "项目空间", spec: { valueType: "string", control: "choice", options: { source: "static", items: [{ value: "开启", label: "开启" }, { value: "关闭", label: "关闭" }], visibleCount: 2 }, state: !canManageCurrent ? "disabled" : "normal" }, value: draft.workspaceEnabled ? "开启" : "关闭", onChange: (value: unknown) => onDraftChange("workspaceEnabled", value === "开启") },
        { key: "projectLevel", label: "项目级别", spec: { valueType: "string", control: "choice", options: { source: "static", items: PROJECT_LEVEL_OPTION_SPECS }, state: !canEditCurrent ? "disabled" : "normal" }, value: draft.projectLevel || "普通", onChange: (value: unknown) => onDraftChange("projectLevel", String(value || "") || "普通") },
        { key: "plannedStartDate", label: "计划开始", spec: { valueType: "date", control: "temporal", precision: "date", state: !canEditCurrent ? "disabled" : "normal" }, value: draft.plannedStartDate, onChange: (value: unknown) => onDraftChange("plannedStartDate", String(value || "")), placeholder: "选择日期" },
        { key: "plannedEndDate", label: "计划结束", spec: { valueType: "date", control: "temporal", precision: "date", state: !canEditCurrent ? "disabled" : "normal" }, value: draft.plannedEndDate, onChange: (value: unknown) => onDraftChange("plannedEndDate", String(value || "")), placeholder: "选择日期" },
        { key: "leadingDepartment", label: "归口部门", required: draft.projectType === "department", spec: { valueType: "reference", control: "reference", options: { source: "remote", fkKey: "work.projects.leadingDepartment", endpoint: WORK_REFERENCE_OPTIONS_ENDPOINT, returnField: "id" }, state: !canManageCurrent || companyLeadingLocked ? "disabled" : "normal" }, value: draft.leadingDepartmentId ? String(draft.leadingDepartmentId) : "", displayValue: draft.leadingDepartmentName || "", placeholder: companyLeadingLocked ? tenantConfig.organization.operatingCommittee.departmentName : "搜索部门名称、编码", onChange: (_value: unknown, option: unknown) => {
          const fk = option as ReferenceOption | undefined;
          onDraftChange("leadingDepartmentId", fk?.id ?? null);
          onDraftChange("leadingDepartmentName", fk?.name ?? null);
          onDraftChange("leadingDepartmentCode", fk?.subtitle ?? null);
        } },
        ...enablingDepartmentFields,
        ...(!creating ? [
          { key: "status", label: "状态", spec: { valueType: "string" as const, control: "choice" as const, options: { source: "static" as const, items: [{ value: "pending", label: "未开始" }, { value: "active", label: "进行中" }, { value: "done", label: "已完成" }] }, state: !canEditCurrent ? "disabled" as const : "normal" as const }, value: draft.status, onChange: (value: unknown) => onDraftChange("status", String(value || "pending")) },
          { key: "actualStartDate", label: "实际开始", spec: { valueType: "date" as const, control: "temporal" as const, precision: "date" as const, state: !canEditCurrent ? "disabled" as const : "normal" as const, validation: { maxDate: todayDateString() } }, value: draft.actualStartDate, onChange: (value: unknown) => onDraftChange("actualStartDate", String(value || "")), placeholder: "选择日期" },
          { key: "actualEndDate", label: "实际结束", spec: { valueType: "date" as const, control: "temporal" as const, precision: "date" as const, state: canEditActualEndDate(draft.status, !canEditCurrent) ? "normal" as const : "disabled" as const, validation: { maxDate: todayDateString() } }, value: draft.actualEndDate, onChange: (value: unknown) => onDraftChange("actualEndDate", String(value || "")), placeholder: draft.status === "done" ? "选择日期" : "请先选择已完成" },
        ] satisfies FormSurfaceItemSpec[] : []),
        { key: "description", label: "项目描述", span: "wide", spec: { valueType: "string", control: "text", multiline: true, state: !canEditCurrent ? "disabled" : "normal" }, value: draft.description || "", onChange: (value: unknown) => onDraftChange("description", String(value || "") || null) },
      ],
    },
    {
      kind: "section",
      key: "members",
      title: "项目人员",
      layout: { columns: 2 },
      items: [
        { key: "leader", label: "项目负责人", spec: { valueType: "reference", control: "reference", options: enablingDepartmentEmployeeReferenceOptions, state: enablingDepartmentMemberDisabled ? "disabled" : "normal" }, value: draft.leader?.employeeNumber || "", displayValue: draft.leader?.name || "", placeholder: projectMemberScopeReady ? "搜索负责人" : "先选择赋能部门",  onChange: (_value: unknown, option: unknown) => onLeaderChange(option as ReferenceOption | undefined) },
        ...MULTI_PROJECT_ROLES.map((role): FormSurfaceItemSpec => ({
          kind: "tagList",
          key: role,
          label: role,
          span: role === "知会" ? "wide" : undefined,
          items: draft.roleGroups[role],
          getKey: (member) => member.id,
          getLabel: (member) => member.name,
          onRemove: (member) => onRoleMembersChange(role, draft.roleGroups[role].filter((item) => item.id !== member.id)),
          disabled: memberFieldDisabled || (role !== "知会" && !projectMemberScopeReady),
          removeConfirmMessage: (member) => `确定删除项目人员「${member.name}」吗？删除后需要保存才会生效。`,
          itemTitle: (member) => (member.confirmationStatus === "pending" ? `${member.name}：待确认` : member.name),
          itemClassName: (member) => member.confirmationStatus === "pending" ? "!border-amber-200 !bg-amber-50 !text-amber-800 shadow-amber-100" : "",
          append: memberFieldDisabled || (role !== "知会" && !projectMemberScopeReady) ? undefined : addingMemberRole === role
            ? {
                field: {
                  key: `add-${role}`,
                  label: `添加${role}`,
                  spec: {
                    valueType: "reference",
                    control: "reference",
                    options: role === "知会" ? allEmployeeReferenceOptions : enablingDepartmentEmployeeReferenceOptions,
                  },
                  value: "",
                  autoFocus: true,
                  placeholder: role === "知会" || projectMemberScopeReady ? "搜索员工" : "先选择赋能部门",
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
                  label: `添加${role}`,
                  icon: "add",
                  presentation: "icon",
                  onClick: () => setAddingMemberRole(role),
                  size: "sm",
                },
              },
        })),
      ],
    },
  ] : [];

  if (!selectedProject) {
    const projectCreateSubmission = actionRuntimeCreateSubmission(createActionRuntime, {
      disabled: !canSave || saving,
      execute: onSave,
    });
    const projectCreate: BodySurfaceSectionCreateSpec | undefined = projectCreateSubmission ? {
      id: "project-create",
      trigger: "surface",
      presentation: "block",
      title: editorTitle,
      open: creating,
      canCreate,
      content: { kind: "form", form: { items: overviewFields } },
      submission: projectCreateSubmission,
      feedback: { saved: "项目已新建", submitted: "项目确认已提交" },
      onOpenChange: (open) => { if (open) onStartCreate(); else onCancelCreate(); },
    } : undefined;
    return createPageBody([createSectionSection("project-create-section", {
      title: "项目",
      create: projectCreate,
      sections: [],
    })]);
  }

  if (!draft) return createPageBody([createEmptySection("project-empty", {
    presentation: "plain",
    content: "暂无可编辑项目。请选择左侧项目，或新建项目后维护资料。"
  })]);

  return createPageBody([
    createFormSection("overview-fields", { kind: "fields", content: { items: overviewFields }, actions: actions.length ? actions : undefined }),
  ]);
}

export default function ProjectDetailEditor(props: ProjectDetailEditorProps) {
  const body = useProjectDetailEditorSection(props);
  return (
    <BodySurface {...body} />
  );
}
