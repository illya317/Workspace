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
import ProjectMemberTagsInput from "./ProjectMemberTagsInput";
import {
  MULTI_PROJECT_ROLES,
  PROJECT_PRIORITY_PICKER_OPTIONS,
  PROJECT_STAGE_PICKER_OPTIONS,
  PROJECT_STATUS_PICKER_OPTIONS,
  projectCode,
  type EmployeeTag,
  type MultiProjectRole,
  type ProjectDraft,
  type ProjectItem,
} from "./model";
import { WORK_REFERENCE_OPTIONS_ENDPOINT } from "./reference-options";

const inputClassName = getFieldInputClassName("h-10");
const pickerButtonClassName = `${inputClassName} text-left`;
const textareaClassName = getFieldInputClassName("min-h-24 resize-y");
const pickerPopoverClassName = "absolute left-0 top-[calc(100%+0.35rem)] z-50 w-full min-w-72 rounded-lg border border-slate-200 bg-white p-3 shadow-xl";

export default function ProjectDetailEditor({
  editorTitle,
  showArchived,
  dirty,
  draft,
  selectedProject,
  canEdit,
  canEditCurrent,
  saving,
  canSave,
  childPlans,
  parentPlanOptions,
  onArchive,
  onSave,
  onDraftChange,
  onLeaderChange,
  onRoleMembersChange,
}: {
  editorTitle: string;
  showArchived: boolean;
  dirty: boolean;
  draft: ProjectDraft | null;
  selectedProject: ProjectItem | null;
  canEdit: boolean;
  canEditCurrent: boolean;
  saving: boolean;
  canSave: boolean;
  childPlans: { id: number; name: string }[];
  parentPlanOptions: PickerOption[];
  onArchive: () => void;
  onSave: () => void;
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
            {showArchived && <p className="mt-1 text-xs text-slate-500">归档浏览为只读，可恢复后继续维护。</p>}
            {dirty && <p className="mt-1 text-xs text-amber-600">有未保存修改</p>}
          </div>
        }
        secondaryActions={draft && selectedProject ? [{
          label: showArchived ? "恢复计划" : "归档计划",
          disabled: saving || !canEdit,
          onClick: onArchive,
        }] : []}
        primaryActions={draft && selectedProject && !showArchived ? [{
          label: saving ? "保存中..." : "保存计划",
          disabled: !canSave,
          onClick: onSave,
        }] : []}
      />

      {draft ? (
        <div className="space-y-4">
          <SectionCard title="基础信息">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <FormField label="计划编码">
                <TextField
                  value={projectCode(selectedProject, draft)}
                  readOnly
                  className={getReadOnlyFieldClassName("h-10 cursor-default font-mono text-slate-600")}
                  unstyled
                />
              </FormField>
              <FormField label="计划名称" required>
                <TextField
                  value={draft.name}
                  disabled={!canEditCurrent}
                  onChange={(value) => onDraftChange("name", value)}
                  className={inputClassName}
                  unstyled
                />
              </FormField>
              <FormField label="主导部门" required className="md:col-span-2">
                <FkFieldInput
                  fkKey="work.plan.leadingDepartment"
                  endpoint={WORK_REFERENCE_OPTIONS_ENDPOINT}
                  value={draft.leadingDepartmentId ? String(draft.leadingDepartmentId) : ""}
                  displayValue={draft.leadingDepartmentName || ""}
                  disabled={!canEditCurrent}
                  placeholder="搜索部门名称、编码"
                  onChange={(_label, option) => {
                    onDraftChange("leadingDepartmentId", option?.id ?? null);
                    onDraftChange("leadingDepartmentName", option?.name ?? null);
                    onDraftChange("leadingDepartmentCode", option?.subtitle ?? null);
                  }}
                />
              </FormField>
              <OptionField label="计划状态" value={draft.status} options={PROJECT_STATUS_PICKER_OPTIONS} disabled={!canEditCurrent} onChange={(value) => onDraftChange("status", value)} />
              <OptionField label="优先级" value={draft.priority} options={PROJECT_PRIORITY_PICKER_OPTIONS} disabled={!canEditCurrent} onChange={(value) => onDraftChange("priority", value)} popoverClassName="absolute left-0 top-[calc(100%+0.35rem)] z-50 w-full min-w-56 rounded-lg border border-slate-200 bg-white p-3 shadow-xl" />
              <OptionField label="计划阶段" value={draft.stage} options={PROJECT_STAGE_PICKER_OPTIONS} disabled={!canEditCurrent} onChange={(value) => onDraftChange("stage", value)} />
              <OptionField
                label="上级计划"
                value={draft.parentId ? String(draft.parentId) : null}
                options={parentPlanOptions}
                disabled={!canEditCurrent}
                onChange={(value) => onDraftChange("parentId", value ? Number(value) : null)}
                placeholder="无上级计划"
                searchPlaceholder="搜索工作计划"
              />
              <DateField label="计划开始时间" value={draft.startDate} disabled={!canEditCurrent} onChange={(value) => onDraftChange("startDate", value)} />
              <DateField label="计划结束时间" value={draft.endDate} disabled={!canEditCurrent} onChange={(value) => onDraftChange("endDate", value)} />
              <TextareaDraftField label="说明" value={draft.description || ""} disabled={!canEditCurrent} onChange={(value) => onDraftChange("description", value || null)} />
              <FormField label="子计划" className="md:col-span-2">
                <div className={getReadOnlyFieldClassName("min-h-10 bg-slate-50 text-slate-600")}>
                  {childPlans.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {childPlans.map((child) => (
                        <span key={child.id} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
                          {child.name}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-sm text-slate-400">暂无子计划</span>
                  )}
                </div>
              </FormField>
            </div>
          </SectionCard>

          <SectionCard title="规划与预算">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <TextareaDraftField label="计划规划" value={draft.plan || ""} disabled={!canEditCurrent} onChange={(value) => onDraftChange("plan", value || null)} />
              <TextareaDraftField label="计划目标" value={draft.goal || ""} disabled={!canEditCurrent} onChange={(value) => onDraftChange("goal", value || null)} />
              <TextareaDraftField label="关键里程碑" value={draft.milestones || ""} disabled={!canEditCurrent} onChange={(value) => onDraftChange("milestones", value || null)} />
              <FormField label="预算金额">
                <TextField
                  type="number"
                  min="0"
                  step="0.01"
                  value={draft.budgetAmount === null || draft.budgetAmount === undefined ? "" : String(draft.budgetAmount)}
                  disabled={!canEditCurrent}
                  onChange={(value) => onDraftChange("budgetAmount", value === "" ? null : Number(value))}
                  className={inputClassName}
                  unstyled
                />
              </FormField>
              <TextareaDraftField label="预算说明" value={draft.budgetNote || ""} disabled={!canEditCurrent} onChange={(value) => onDraftChange("budgetNote", value || null)} />
              <TextareaDraftField label="风险说明" value={draft.riskNote || ""} disabled={!canEditCurrent} onChange={(value) => onDraftChange("riskNote", value || null)} />
              <TextareaDraftField label="备注" value={draft.remark || ""} disabled={!canEditCurrent} onChange={(value) => onDraftChange("remark", value || null)} />
            </div>
          </SectionCard>

          <SectionCard title="计划人员">
            <div className="space-y-3">
              <FormField label="计划负责人">
                <FkFieldInput
                  fkKey="work.plan.member.employee"
                  endpoint={WORK_REFERENCE_OPTIONS_ENDPOINT}
                  value={draft.leader?.employeeNumber || ""}
                  displayValue={draft.leader?.name || ""}
                  disabled={!canEditCurrent}
                  placeholder="搜索负责人"
                  onChange={(_label, option) => onLeaderChange(option)}
                />
              </FormField>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {MULTI_PROJECT_ROLES.map((role) => (
                  <FormField key={role} label={role}>
                    <ProjectMemberTagsInput
                      value={draft.roleGroups[role]}
                      disabled={!canEditCurrent}
                      onChange={(members) => onRoleMembersChange(role, members)}
                    />
                  </FormField>
                ))}
              </div>
            </div>
          </SectionCard>
        </div>
      ) : (
        <div className="flex min-h-64 items-center justify-center p-8">
          <div className="text-center">
            <p className="text-sm font-medium text-slate-600">暂无可编辑工作计划</p>
            <p className="mt-1 text-sm text-slate-400">请选择左侧计划，或新建工作计划后维护资料。</p>
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

function TextareaDraftField({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <FormField label={label} className="md:col-span-2">
      <TextareaField
        value={value}
        disabled={disabled}
        onChange={onChange}
        className={textareaClassName}
      />
    </FormField>
  );
}
