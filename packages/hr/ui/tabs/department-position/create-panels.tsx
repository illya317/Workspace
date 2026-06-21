"use client";

import type { Dispatch, SetStateAction } from "react";
import {
  FkFieldInput,
  FormField,
  InlineCreatePanel,
  TextField,
  getReadOnlyFieldClassName,
} from "@workspace/core/ui";
import type { FkFieldOption } from "@workspace/core/ui";
import { compactFormInputClassName } from "./detail-editors";
import type { CreatePositionDraft, Department } from "./types";
import { departmentPath } from "./utils";

export function PositionCreatePanel({
  createPositionDraft,
  createPositionDepartment,
  createPositionCode,
  departmentById,
  saving,
  positionDepartmentReadOnly = false,
  className,
  setCreatePositionDraft,
  onCreatePosition,
  onCancel,
}: {
  createPositionDraft: CreatePositionDraft;
  createPositionDepartment: Department | undefined;
  createPositionCode: string;
  departmentById: Map<number, Department>;
  saving: boolean;
  positionDepartmentReadOnly?: boolean;
  className?: string;
  setCreatePositionDraft: Dispatch<SetStateAction<CreatePositionDraft>>;
  onCreatePosition: () => void | Promise<void>;
  onCancel: () => void;
}) {
  const departmentDisplayName = departmentPath(createPositionDepartment, departmentById);
  const readOnlyDepartmentName = createPositionDepartment?.name || departmentDisplayName;

  return (
    <InlineCreatePanel
      title="新建岗位"
      onSubmit={() => void onCreatePosition()}
      onCancel={onCancel}
      submitDisabled={!createPositionDraft.departmentId || !createPositionDraft.name.trim() || !createPositionCode || saving}
      submitting={saving}
      className={className}
    >
      <FormField label="部门" required layout="inline" className="w-40 max-w-full">
        {positionDepartmentReadOnly ? (
          <TextField
            value={readOnlyDepartmentName}
            disabled
            className={getReadOnlyFieldClassName("h-9 py-0 text-xs")}
          />
        ) : (
          <FkFieldInput
            fkKey="hr.department"
            value={createPositionDraft.departmentId == null ? "" : String(createPositionDraft.departmentId)}
            displayValue={departmentDisplayName}
            placeholder="搜索所属部门"
            onChange={(_label, option?: FkFieldOption) => setCreatePositionDraft((prev) => ({ ...prev, departmentId: option?.id ?? null }))}
          />
        )}
      </FormField>
      <FormField label="岗位名" required layout="inline" className="w-40">
        <TextField
          value={createPositionDraft.name}
          onChange={(next) => setCreatePositionDraft((prev) => ({ ...prev, name: next }))}
          placeholder="输入岗位名"
          className={compactFormInputClassName}
        />
      </FormField>
      <FormField label="编码" required layout="inline" className="w-40">
        <TextField
          value={createPositionCode}
          disabled
          className={getReadOnlyFieldClassName("h-9 py-0 font-mono text-xs")}
        />
      </FormField>
    </InlineCreatePanel>
  );
}
