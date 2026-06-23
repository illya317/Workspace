"use client";

import { useEffect, useState } from "react";
import {
  ActionToolbar,
  FkFieldInput,
  FormField,
  OptionPicker,
  PanelCard,
  SectionCard,
  TabBar,
  TextareaField,
  TextField,
  getFieldInputClassName,
  getReadOnlyFieldClassName,
} from "@workspace/core/ui";
import type { FkFieldOption, PickerOption } from "@workspace/core/ui";
import CalendarDateInput from "@workspace/core/ui/CalendarDateInput";
import ProjectMemberTagsInput from "./ProjectMemberTagsInput";
import ProjectPlanManagementSection from "./ProjectPlanManagementSection";
import ProjectRasciMatrix from "./ProjectRasciMatrix";
import type { ProjectRasciRow } from "./ProjectRasciMatrix";
import ProjectTasksSection from "./ProjectTasksSection";
import {
  MULTI_PROJECT_ROLES,
  PROJECT_LEVEL_PICKER_OPTIONS,
  projectCode,
  type EmployeeTag,
  type MultiProjectRole,
  type ProjectDraft,
  type ProjectItem,
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
  rasciRows,
  creating,
  onCancelCreate,
  onDeleteProject,
  onSave,
  onDraftChange,
  onLeaderChange,
  onRoleMembersChange,
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
  onProjectTasksChanged: (projectId: number | null) => void;
  onToast: (toast: { type: "success" | "error"; message: string }) => void;
}) {
  const [activeTab, setActiveTab] = useState("overview");

  useEffect(() => {
    if (activeTab !== "overview" && activeTab !== "plan") setActiveTab("overview");
  }, [activeTab]);

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
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <FormField label="项目编码">
                    <TextField
                      value={projectCode(selectedProject, draft)}
                      readOnly
                      className={getReadOnlyFieldClassName("h-10 cursor-default font-mono text-slate-600")}
                      unstyled
                    />
                  </FormField>
                  <FormField label="项目负责人">
                    <TextField
                      value={draft.leader?.name || "未设置"}
                      readOnly
                      className={getReadOnlyFieldClassName("h-10 cursor-default text-slate-600")}
                      unstyled
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
                  <FormField label="主导部门" required>
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
                  <DateField label="立项日期" value={draft.startDate} disabled={!canEditCurrent} onChange={(value) => onDraftChange("startDate", value)} />
                  <DateField label="结项日期" value={draft.endDate} disabled={!canEditCurrent} onChange={(value) => onDraftChange("endDate", value)} />
                  <PercentField
                    label="完成度"
                    value={draft.completionPercent}
                    disabled={!canEditCurrent}
                    onChange={(value) => onDraftChange("completionPercent", value)}
                  />
                  <FormField label="项目描述" className="md:col-span-2">
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

function PercentField({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: number | null;
  disabled: boolean;
  onChange: (value: number | null) => void;
}) {
  return (
    <FormField label={label}>
      <div className="flex">
        <TextField
          value={value === null || value === undefined ? "" : String(value)}
          type="number"
          min={0}
          step="0.01"
          inputMode="decimal"
          disabled={disabled}
          placeholder="输入完成度"
          onChange={(nextValue) => {
            if (nextValue.trim() === "") return onChange(null);
            const number = Number(nextValue);
            onChange(Number.isFinite(number) ? number : value ?? null);
          }}
          className={`${inputClassName} rounded-r-none`}
          unstyled
        />
        <span className="flex h-10 w-12 items-center justify-center rounded-r-md border border-l-0 border-sky-200 bg-slate-50 text-sm font-semibold text-slate-500 shadow-sm">%</span>
      </div>
    </FormField>
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
