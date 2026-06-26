"use client";

import type { Dispatch, SetStateAction } from "react";
import {
  CreatePanel,
  FormField,
  InputControl,
  ReadOnlyField,
} from "@workspace/core/ui";
import type { FkFieldOption } from "@workspace/core/ui";
import { HR_REFERENCE_OPTIONS_ENDPOINT } from "../../fk-keys";
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
    <CreatePanel
      variant="inline"
      title="新建岗位"
      onSubmit={() => void onCreatePosition()}
      onCancel={onCancel}
      submitDisabled={!createPositionDraft.departmentId || !createPositionDraft.name.trim() || !createPositionCode || saving}
      submitting={saving}
      className={className}
    >
      <FormField label="部门" required>
        {positionDepartmentReadOnly ? (
          <ReadOnlyField value={readOnlyDepartmentName} />
        ) : (
          <InputControl
            spec={{
              valueType: "reference",
              editor: "autocomplete",
              options: { source: "remote", fkKey: "hr.department", endpoint: HR_REFERENCE_OPTIONS_ENDPOINT, returnField: "id" },
            }}
            value={createPositionDraft.departmentId == null ? "" : String(createPositionDraft.departmentId)}
            displayValue={departmentDisplayName}
            placeholder="搜索所属部门"
            onChange={(_label, option) => {
              const fkOption = option as FkFieldOption | undefined;
              setCreatePositionDraft((prev) => ({ ...prev, departmentId: fkOption?.id ?? null }));
            }}
          />
        )}
      </FormField>
      <FormField label="岗位名" required>
        <InputControl
          spec={{ valueType: "string", editor: "input" }}
          value={createPositionDraft.name}
          onChange={(next) => setCreatePositionDraft((prev) => ({ ...prev, name: String(next ?? "") }))}
          placeholder="输入岗位名"
        />
      </FormField>
      <FormField label="编码" required>
        <ReadOnlyField value={createPositionCode} fontRole="mono" />
      </FormField>
    </CreatePanel>
  );
}
