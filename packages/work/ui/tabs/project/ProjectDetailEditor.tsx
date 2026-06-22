"use client";

import {
  ActionToolbar,
  FkFieldInput,
  FormField,
  OptionPicker,
  PanelCard,
  SectionCard,
  TextareaField,
  TextField,
  getFieldInputClassName,
  getReadOnlyFieldClassName,
} from "@workspace/core/ui";
import type { FkFieldOption, PickerOption } from "@workspace/core/ui";
import CalendarDateInput from "@workspace/core/ui/CalendarDateInput";
import ProjectChildTagsInput from "./ProjectChildTagsInput";
import ProjectGanttSection from "./ProjectGanttSection";
import ProjectMemberTagsInput from "./ProjectMemberTagsInput";
import ProjectRasciMatrix from "./ProjectRasciMatrix";
import type { ProjectRasciRow } from "./ProjectRasciMatrix";
import {
  MULTI_PROJECT_ROLES,
  PROJECT_MILESTONE_PICKER_OPTIONS,
  PROJECT_STATUS_PICKER_OPTIONS,
  PROJECT_TYPE_OPTIONS,
  TOP_LEVEL_PROJECT_TYPE_OPTIONS,
  projectCode,
  type EmployeeTag,
  type MultiProjectRole,
  type ProjectDraft,
  type ProjectItem,
  type ProjectType,
} from "./model";
import { WORK_REFERENCE_OPTIONS_ENDPOINT } from "./reference-options";

const inputClassName = getFieldInputClassName("h-10");
const pickerButtonClassName = `${inputClassName} text-left`;
const pickerPopoverClassName = "absolute left-0 top-[calc(100%+0.35rem)] z-50 w-full min-w-72 rounded-lg border border-slate-200 bg-white p-3 shadow-xl";

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
  childProjects,
  rasciRows,
  creating,
  onCancelCreate,
  onDeleteProject,
  onSave,
  onChildProjectsChange,
  onCreateChildProject,
  onDraftChange,
  onLeaderChange,
  onRoleMembersChange,
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
  childProjects: { id: number; name: string; status?: string | null; startDate?: string | null; endDate?: string | null }[];
  rasciRows: ProjectRasciRow[];
  creating: boolean;
  onCancelCreate: () => void;
  onDeleteProject: () => void;
  onSave: () => void;
  onChildProjectsChange: (value: { id: number; name: string }[]) => void;
  onCreateChildProject: (name: string, leadingDepartmentId?: number | null, leader?: EmployeeTag | null, endDate?: string | null) => Promise<void> | void;
  onDraftChange: <K extends keyof ProjectDraft>(key: K, value: ProjectDraft[K]) => void;
  onLeaderChange: (option?: FkFieldOption) => void;
  onRoleMembersChange: (role: MultiProjectRole, members: EmployeeTag[]) => void;
}) {
  return (
    <PanelCard className="bg-slate-50" bodyClassName="p-4">
      <ActionToolbar
        className="mb-4"
        leftSlot={
          <div>
            <div className="text-sm font-semibold text-slate-900">{editorTitle}</div>
            {dirty && <p className="mt-1 text-xs text-amber-600">有未保存修改</p>}
          </div>
        }
        secondaryActions={[
          ...(!creating && selectedProject && canDeleteCurrent ? [{ label: "删除项目", onClick: onDeleteProject, disabled: saving, variant: "danger" as const }] : []),
          ...(creating ? [{ label: "取消", onClick: onCancelCreate }] : []),
        ]}
        primaryActions={draft && (selectedProject || creating) ? [{
          label: saving ? "保存中..." : creating ? "创建项目" : "保存项目",
          disabled: !canSave,
          onClick: onSave,
        }] : []}
      />

      {draft ? (
        <div className="space-y-4">
          <SectionCard title="基础信息">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <FormField label="项目编码">
                <TextField
                  value={projectCode(selectedProject, draft)}
                  readOnly
                  className={getReadOnlyFieldClassName("h-10 cursor-default font-mono text-slate-600")}
                  unstyled
                />
              </FormField>
              <OptionField
                label="项目类型"
                value={draft.projectType}
                options={creating ? TOP_LEVEL_PROJECT_TYPE_OPTIONS : PROJECT_TYPE_OPTIONS}
                disabled={!creating}
                onChange={(value) => onDraftChange("projectType", (value || "department") as ProjectType)}
                placeholder="选择项目类型"
              />
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
                  disabled={!canManageCurrent || draft.projectType !== "department"}
                  placeholder="搜索部门名称、编码"
                  onChange={(_label, option) => {
                    onDraftChange("leadingDepartmentId", option?.id ?? null);
                    onDraftChange("leadingDepartmentName", option?.name ?? null);
                    onDraftChange("leadingDepartmentCode", option?.subtitle ?? null);
                  }}
                />
              </FormField>
              <OptionField label="项目状态" value={draft.status} options={PROJECT_STATUS_PICKER_OPTIONS} disabled={!canEditCurrent} onChange={(value) => onDraftChange("status", value)} />
              <OptionField
                label="是否里程碑"
                value={draft.isMilestone ? "true" : "false"}
                options={PROJECT_MILESTONE_PICKER_OPTIONS}
                disabled={!canEditCurrent}
                onChange={(value) => onDraftChange("isMilestone", value === "true")}
                popoverClassName="absolute left-0 top-[calc(100%+0.35rem)] z-50 w-full min-w-56 rounded-lg border border-slate-200 bg-white p-3 shadow-xl"
              />
              <DateField label="项目开始时间" value={draft.startDate} disabled={!canEditCurrent} onChange={(value) => onDraftChange("startDate", value)} />
              <DateField label="项目结束时间" value={draft.endDate} disabled={!canEditCurrent} onChange={(value) => onDraftChange("endDate", value)} />
              <FormField label="项目描述" className="md:col-span-2">
                <TextareaField
                  value={draft.description || ""}
                  disabled={!canEditCurrent}
                  onChange={(value) => onDraftChange("description", value || null)}
                  rows={3}
                  className="text-sm"
                />
              </FormField>
              <FormField label="子项目" className="md:col-span-2">
                <ProjectChildTagsInput
                  value={childProjects}
                  disabled={!canManageCurrent || creating}
                  creating={saving}
                  onChange={onChildProjectsChange}
                  onCreate={onCreateChildProject}
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

          <ProjectGanttSection
            parentProject={{
              id: draft.id ?? 0,
              name: draft.name || "当前项目",
              status: draft.status,
              startDate: draft.startDate,
              endDate: draft.endDate,
            }}
            projects={childProjects}
          />
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

function OptionField({
  label,
  value,
  options,
  disabled,
  onChange,
  placeholder = "未设置",
  searchPlaceholder,
  popoverClassName = pickerPopoverClassName,
}: {
  label: string;
  value: string | null;
  options: PickerOption[];
  disabled: boolean;
  onChange: (value: string | null) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  popoverClassName?: string;
}) {
  return (
    <FormField label={label}>
      <OptionPicker
        value={value}
        options={options}
        disabled={disabled}
        onChange={onChange}
        placeholder={placeholder}
        searchPlaceholder={searchPlaceholder}
        visibleCount={6}
        buttonClassName={pickerButtonClassName}
        popoverClassName={popoverClassName}
      />
    </FormField>
  );
}

function DateField({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: string | null;
  disabled: boolean;
  onChange: (value: string | null) => void;
}) {
  return (
    <FormField label={label}>
      <CalendarDateInput
        value={value}
        disabled={disabled}
        onChange={onChange}
        className={inputClassName}
      />
    </FormField>
  );
}
