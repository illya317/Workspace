"use client";

import type { Dispatch, SetStateAction } from "react";
import { createPageBody, createPanelSection, PageSurface } from "@workspace/core/ui";
import type { FormSurfaceItemSpec, BodySurfaceSectionSpec, FormSurfaceProps, ReferenceOption } from "@workspace/core/ui";
import { HR_REFERENCE_OPTIONS_ENDPOINT } from "../../fk-keys";
import { selectedEntityName } from "./detail-editors";
import type { CreatePositionDraft, Department, DescriptionDraft } from "./types";
import { departmentPath } from "./utils";

type PositionCreatePanelProps = {
  createPositionDraft: CreatePositionDraft;
  createPositionDescriptionDraft: DescriptionDraft;
  createPositionDescriptionDetailsSurface: FormSurfaceProps;
  createPositionDepartment: Department | undefined;
  createPositionCode: string;
  departmentById: Map<number, Department>;
  saving: boolean;
  positionDepartmentReadOnly?: boolean;
  className?: string;
  setCreatePositionDraft: Dispatch<SetStateAction<CreatePositionDraft>>;
  setCreatePositionDescriptionDraft: Dispatch<SetStateAction<DescriptionDraft>>;
  onCreatePosition: (descriptionDraft: DescriptionDraft) => void | Promise<void>;
  onCancel: () => void;
};

export function buildPositionCreatePanelBlock({
  createPositionDraft,
  createPositionDescriptionDraft,
  createPositionDescriptionDetailsSurface,
  createPositionDepartment,
  createPositionCode,
  departmentById,
  saving,
  positionDepartmentReadOnly = false,
  setCreatePositionDraft,
  setCreatePositionDescriptionDraft,
  onCreatePosition,
  onCancel,
}: PositionCreatePanelProps): BodySurfaceSectionSpec {
  const departmentDisplayName = departmentPath(createPositionDepartment, departmentById);
  const readOnlyDepartmentName = createPositionDepartment?.name || departmentDisplayName;
  const effectiveDescriptionDraft: DescriptionDraft = {
    ...createPositionDescriptionDraft,
    code: createPositionCode,
    name: createPositionDraft.name,
    departmentName: readOnlyDepartmentName,
  };

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
  const descriptionFields: FormSurfaceItemSpec[] = [
    { kind: "readonly", key: "description-name", label: "说明书名称", value: effectiveDescriptionDraft.name || "保存时使用岗位名" },
    { kind: "readonly", key: "description-department", label: "说明书部门", value: effectiveDescriptionDraft.departmentName || "未选择部门" },
    {
      key: "reportTo",
      label: "汇报对象",
      spec: {
        valueType: "reference",
        control: "reference",
        state: saving ? "disabled" : "normal",
        options: { source: "remote", fkKey: "hr.position", endpoint: HR_REFERENCE_OPTIONS_ENDPOINT, returnField: "name" },
      },
      value: effectiveDescriptionDraft.reportTo,
      displayValue: effectiveDescriptionDraft.reportTo,
      placeholder: "搜索汇报对象",
      onChange: (_value, option) => setCreatePositionDescriptionDraft((prev) => ({ ...prev, reportTo: selectedEntityName("position", option as ReferenceOption | undefined) })),
    },
    {
      key: "headcount",
      label: "编制",
      spec: { valueType: "number", control: "text", state: saving ? "disabled" : "normal" },
      value: effectiveDescriptionDraft.headcount,
      inputMode: "numeric",
      onChange: value => setCreatePositionDescriptionDraft((prev) => ({ ...prev, headcount: String(value ?? "").replace(/\D/g, "") })),
    },
    {
      key: "purpose",
      label: "岗位目的",
      span: "wide",
      spec: { valueType: "string", control: "text", multiline: true, state: saving ? "disabled" : "normal" },
      value: effectiveDescriptionDraft.positionPurpose,
      rows: 2,
      onChange: value => setCreatePositionDescriptionDraft((prev) => ({ ...prev, positionPurpose: String(value ?? "") })),
    },
    {
      key: "summary",
      label: "摘要",
      span: "wide",
      spec: { valueType: "string", control: "text", multiline: true, state: saving ? "disabled" : "normal" },
      value: effectiveDescriptionDraft.summary,
      rows: 2,
      onChange: value => setCreatePositionDescriptionDraft((prev) => ({ ...prev, summary: String(value ?? "") })),
    },
    ...createPositionDescriptionDetailsSurface.content.items,
  ];

  return createPanelSection("create-position", {
    title: "新建岗位",
    actions: [
      { key: "cancel", label: "取消", icon: "cancel", onClick: onCancel },
      { key: "submit", label: saving ? "保存中..." : "保存", icon: "save", variant: "primary", disabled: saving || submitDisabled, onClick: () => void onCreatePosition(effectiveDescriptionDraft) },
    ],
    sections: [
      createPanelSection("position-info", {
        title: "岗位信息",
        chrome: "divider",
        sections: [{
          key: "fields",
          body: { kind: "form", form: {
            kind: "fields",
            content: { items: fields, layout: { columns: 3 } },
          } },
        }],
      }),
      createPanelSection("position-description", {
        title: "岗位说明书",
        chrome: "divider",
        sections: [{
          key: "fields",
          body: { kind: "form", form: {
            kind: "fields",
            content: { items: descriptionFields, layout: { columns: 2 } },
          } },
        }],
      }),
    ],
  });
}

export function PositionCreatePanel(props: PositionCreatePanelProps) {
  return (
    <PageSurface kind="standard"
      embedded
      body={createPageBody([buildPositionCreatePanelBlock(props)])}
    />
  );
}
