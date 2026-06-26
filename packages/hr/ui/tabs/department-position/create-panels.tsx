"use client";

import type { Dispatch, SetStateAction } from "react";
import { PageSurface } from "@workspace/core/ui";
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
    <PageSurface
      embedded
      kind="detail"
      className={className}
      blocks={[
        {
          kind: "panel",
          key: "create-position",
          title: "新建岗位",
          actions: [
            {
              key: "submit",
              label: saving ? "保存中..." : "保存",
              variant: "primary",
              disabled: !createPositionDraft.departmentId || !createPositionDraft.name.trim() || !createPositionCode || saving,
              onClick: () => void onCreatePosition(),
            },
            { key: "cancel", label: "取消", disabled: saving, onClick: onCancel },
          ],
          blocks: [{
            kind: "form",
            key: "fields",
            surface: {
              kind: "fields",
              columns: 3,
              fields: [
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
                        editor: "autocomplete",
                        options: { source: "remote", fkKey: "hr.department", endpoint: HR_REFERENCE_OPTIONS_ENDPOINT, returnField: "id" },
                      },
                      value: createPositionDraft.departmentId == null ? "" : String(createPositionDraft.departmentId),
                      displayValue: departmentDisplayName,
                      placeholder: "搜索所属部门",
                      onChange: (_label, option) => {
                        const fkOption = option as FkFieldOption | undefined;
                        setCreatePositionDraft((prev) => ({ ...prev, departmentId: fkOption?.id ?? null }));
                      },
                    },
                {
                  key: "name",
                  label: "岗位名",
                  required: true,
                  spec: { valueType: "string", editor: "input" },
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
                  fontRole: "mono",
                },
              ],
            },
          }],
        },
      ]}
    />
  );
}
