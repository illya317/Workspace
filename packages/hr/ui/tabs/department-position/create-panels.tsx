"use client";

import type { Dispatch, SetStateAction } from "react";
import type { BodySurfaceSectionCreateSpec, FormSurfaceItemSpec, FormSurfaceProps, ReferenceOption } from "@workspace/core/ui";
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
  open: boolean;
  canCreate?: boolean;
  positionDepartmentReadOnly?: boolean;
  className?: string;
  setCreatePositionDraft: Dispatch<SetStateAction<CreatePositionDraft>>;
  setCreatePositionDescriptionDraft: Dispatch<SetStateAction<DescriptionDraft>>;
  onCreatePosition: (descriptionDraft: DescriptionDraft) => void | Promise<void>;
  onCancel: () => void;
  onOpenChange: (open: boolean) => void;
};

export function createPositionCreateSpec({
  createPositionDraft,
  createPositionDescriptionDraft,
  createPositionDescriptionDetailsSurface,
  createPositionDepartment,
  createPositionCode,
  departmentById,
  saving,
  open,
  canCreate,
  positionDepartmentReadOnly = false,
  setCreatePositionDraft,
  setCreatePositionDescriptionDraft,
  onCreatePosition,
  onCancel,
  onOpenChange,
}: PositionCreatePanelProps): BodySurfaceSectionCreateSpec {
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
          label: "组织",
          required: true,
          value: readOnlyDepartmentName,
        }
      : {
          key: "department",
          label: "组织",
          required: true,
          spec: {
            valueType: "reference",
            control: "reference",
            options: { source: "remote", fkKey: "hr.department", endpoint: HR_REFERENCE_OPTIONS_ENDPOINT, returnField: "id" },
          },
          value: createPositionDraft.departmentId == null ? "" : String(createPositionDraft.departmentId),
          displayValue: departmentDisplayName,
          placeholder: "搜索所属组织",
          onChange: (_label, option) => {
            const fkOption = option as ReferenceOption | undefined;
            setCreatePositionDraft((prev) => ({ ...prev, departmentId: fkOption?.id ?? null, reportTo: "", reportToPositionId: null }));
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
    {
      key: "reportTo",
      label: "上级岗位",
      spec: {
        valueType: "reference",
        control: "reference",
        state: saving || !createPositionDraft.departmentId ? "disabled" : "normal",
        options: {
          source: "remote",
          fkKey: "hr.position.inDepartment",
          endpoint: HR_REFERENCE_OPTIONS_ENDPOINT,
          returnField: "id",
          queryParams: { departmentId: createPositionDraft.departmentId },
        },
      },
      value: createPositionDraft.reportToPositionId == null ? "" : String(createPositionDraft.reportToPositionId),
      displayValue: createPositionDraft.reportTo,
      placeholder: createPositionDraft.departmentId ? "搜索上级岗位" : "先选择直属组织",
      onChange: (_value, option) => {
        const fkOption = option as ReferenceOption | undefined;
        setCreatePositionDraft((prev) => ({
          ...prev,
          reportTo: selectedEntityName("position", fkOption),
          reportToPositionId: fkOption?.id ?? null,
        }));
      },
    },
  ];
  const descriptionFields: FormSurfaceItemSpec[] = [
    { kind: "readonly", key: "description-name", label: "说明书名称", value: effectiveDescriptionDraft.name || "保存时使用岗位名" },
    { kind: "readonly", key: "description-department", label: "说明书组织", value: effectiveDescriptionDraft.departmentName || "未选择组织" },
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

  return {
    id: "create-position",
    trigger: "surface",
    presentation: "block",
    title: "新建岗位",
    open,
    canCreate,
    disabled: saving,
    content: { kind: "form", form: {
      items: [
        { kind: "section", key: "position-info", title: "岗位信息", items: fields, layout: { columns: 3 } },
        { kind: "section", key: "position-description", title: "岗位说明书", items: descriptionFields, layout: { columns: 2 } },
      ],
    } },
    submission: { action: "save", disabled: saving || submitDisabled, execute: () => onCreatePosition(effectiveDescriptionDraft) },
    onOpenChange,
    onCancel,
  };
}
