"use client";

import type { Dispatch, SetStateAction } from "react";
import { createPageBody, PageSurface, createCreatePanelBlock } from "@workspace/core/ui";
import type { FormSurfaceItemSpec, PageSurfaceBlockSpec, ReferenceOption } from "@workspace/core/ui";
import { HR_REFERENCE_OPTIONS_ENDPOINT } from "../../fk-keys";
import type { CreatePositionDraft, Department } from "./types";
import { departmentPath } from "./utils";

type PositionCreatePanelProps = {
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
};

export function buildPositionCreatePanelBlock({
  createPositionDraft,
  createPositionDepartment,
  createPositionCode,
  departmentById,
  saving,
  positionDepartmentReadOnly = false,
  setCreatePositionDraft,
  onCreatePosition,
  onCancel,
}: PositionCreatePanelProps): PageSurfaceBlockSpec {
  const departmentDisplayName = departmentPath(createPositionDepartment, departmentById);
  const readOnlyDepartmentName = createPositionDepartment?.name || departmentDisplayName;

  const submitDisabled = !createPositionDraft.departmentId || !createPositionDraft.name.trim() || !createPositionCode || saving;
  const fields: FormSurfaceItemSpec[] = [
          positionDepartmentReadOnly
            ? {
                kind: "readonly",
                key: "department",
                label: "部门",
                required: true,
                value: readOnlyDepartmentName,
              }
            : {
                key: "department",
                label: "部门",
                required: true,
                spec: {
                  valueType: "reference",
                  control: "reference",
                  options: { source: "remote", fkKey: "hr.department", endpoint: HR_REFERENCE_OPTIONS_ENDPOINT, returnField: "id" },
                },
                value: createPositionDraft.departmentId == null ? "" : String(createPositionDraft.departmentId),
                displayValue: departmentDisplayName,
                placeholder: "搜索所属部门",
                onChange: (_label, option) => {
                  const fkOption = option as ReferenceOption | undefined;
                  setCreatePositionDraft((prev) => ({ ...prev, departmentId: fkOption?.id ?? null }));
                },
              },
          {
            key: "name",
            label: "岗位名",
            required: true,
            spec: { valueType: "string", control: "text" },
            value: createPositionDraft.name,
            onChange: (next) => setCreatePositionDraft((prev) => ({ ...prev, name: String(next ?? "") })),
            placeholder: "输入岗位名",
          },
          {
            kind: "readonly",
            key: "code",
            label: "编码",
            required: true,
            value: createPositionCode,

          },
        ];

  return createCreatePanelBlock("create-position", {

    title: "新建岗位",
    creating: true,
    canCreate: true,
    submitting: saving,
    submitDisabled,
    submitLabel: "保存",
    onStartCreate: () => undefined,
    onSubmit: () => void onCreatePosition(),
    onCancel,
    createContent: (
      <PageSurface
        embedded
        kind="detail"
        body={createPageBody([{
          kind: "form",
          key: "fields",
          surface: {
            kind: "fields",
            columns: 3,
            fields,
          },
        }])}
      />
    ),
    children: null,
  });
}

export function PositionCreatePanel(props: PositionCreatePanelProps) {
  return (
    <PageSurface
      embedded
      kind="detail"
      body={createPageBody([buildPositionCreatePanelBlock(props)])}
    />
  );
}
