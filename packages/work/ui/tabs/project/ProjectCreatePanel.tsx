"use client";

import {
  FormField,
  FkFieldInput,
  InlineCreatePanel,
  TextField,
  getFieldInputClassName,
} from "@workspace/core/ui";
import type { CreatePlanDraft } from "./model";

const inputClassName = getFieldInputClassName("h-10");

export default function ProjectCreatePanel({
  draft,
  canEdit,
  saving,
  onDraftChange,
  onSubmit,
  onCancel,
}: {
  draft: CreatePlanDraft;
  canEdit: boolean;
  saving: boolean;
  onDraftChange: (draft: CreatePlanDraft) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  return (
    <InlineCreatePanel
      title="新建工作计划"
      onSubmit={onSubmit}
      onCancel={onCancel}
      submitDisabled={!draft.name.trim() || !draft.leadingDepartmentId}
      submitting={saving}
    >
      <FormField label="计划名称" required layout="inline" className="w-72 max-w-full">
        <TextField
          value={draft.name}
          disabled={!canEdit || saving}
          onChange={(name) => onDraftChange({ ...draft, name })}
          placeholder="输入计划名称"
          className={inputClassName}
          unstyled
        />
      </FormField>
      <FormField label="主导部门" required layout="inline" className="w-72 max-w-full">
        <FkFieldInput
          fkKey="work.plan.leadingDepartment"
          value={draft.leadingDepartmentId ? String(draft.leadingDepartmentId) : ""}
          displayValue={draft.leadingDepartmentName || ""}
          disabled={!canEdit || saving}
          placeholder="搜索部门名称、编码"
          onChange={(_label, option) => onDraftChange({
            ...draft,
            leadingDepartmentId: option?.id ?? null,
            leadingDepartmentName: option?.name ?? null,
          })}
        />
      </FormField>
    </InlineCreatePanel>
  );
}
