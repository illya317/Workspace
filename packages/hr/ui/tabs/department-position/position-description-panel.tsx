"use client";

import { createPageBody, createPanelSection, PageSurface, type FormSurfaceItemSpec, type FormSurfaceLooseItem, type BodySurfaceSectionSpec, type ReferenceOption } from "@workspace/core/ui";
import { HR_REFERENCE_OPTIONS_ENDPOINT } from "../../fk-keys";
import { NEW_POSITION_DESCRIPTION_TEMPLATE_OPTION, type PositionDescriptionTemplate, type PositionDescriptionTemplateId } from "./description-details";
import { selectedEntityName, usePositionDescriptionDetailsSurface } from "./detail-editors";
import { deriveDescriptionMeta } from "./draft-utils";
import { createPositionDescriptionTemplateEditorSection } from "./position-description-template-editor";
import type { DescriptionDraft, Position } from "./types";
type PositionDescriptionPanelProps = {
  position: Position | null;
  descriptionDraft: DescriptionDraft | null;
  canEditPosition: boolean;
  descriptionDirty: boolean;
  positionDescriptionTemplate: PositionDescriptionTemplateId;
  positionDescriptionTemplates: PositionDescriptionTemplate[];
  selectedPositionDescriptionTemplate: PositionDescriptionTemplate;
  selectedPositionDescriptionTemplateStored: boolean;
  selectedPositionDescriptionTemplateDefault: boolean;
  templateEditorOpen: boolean;
  templateDraftName: string;
  templateDraftFields: string[];
  positionNames: Set<string>;
  positions: Position[];
  departmentNames: Set<string>;
  onUpdateDescriptionDraft: <K extends keyof DescriptionDraft>(key: K, value: DescriptionDraft[K]) => void;
  onPositionDescriptionTemplateChange: (value: string) => void;
  onOpenPositionDescriptionTemplateEditor: () => void;
  onSavePositionDescriptionTemplate: () => void | Promise<void>;
  onDeletePositionDescriptionTemplate: () => void | Promise<void>;
  onTemplateEditorOpenChange: (open: boolean) => void;
  onTemplateDraftNameChange: (name: string) => void;
  onTogglePositionDescriptionTemplateField: (field: string) => void;
  onPreviewPositionDescription?: () => void;
};

const EMPTY_DESCRIPTION_DRAFT = {
  details: "{}",
  reportTo: "",
  headcount: "",
  positionPurpose: "",
  summary: "",
  version: "",
  effectiveDate: "",
} as DescriptionDraft;

export function usePositionDescriptionPanelSection({
  position,
  descriptionDraft,
  canEditPosition,
  descriptionDirty,
  positionDescriptionTemplate,
  positionDescriptionTemplates,
  selectedPositionDescriptionTemplate,
  selectedPositionDescriptionTemplateStored,
  selectedPositionDescriptionTemplateDefault,
  templateEditorOpen,
  templateDraftName,
  templateDraftFields,
  positionNames,
  positions,
  departmentNames,
  onUpdateDescriptionDraft,
  onPositionDescriptionTemplateChange,
  onOpenPositionDescriptionTemplateEditor,
  onSavePositionDescriptionTemplate,
  onDeletePositionDescriptionTemplate,
  onTemplateEditorOpenChange,
  onTemplateDraftNameChange,
  onTogglePositionDescriptionTemplateField,
  onPreviewPositionDescription
}: PositionDescriptionPanelProps): BodySurfaceSectionSpec | null {
  const draft = descriptionDraft ?? EMPTY_DESCRIPTION_DRAFT;
  const currentPosition = position ?? ({ id: 0, name: "", departmentName: "" } as Position);
  const meta = deriveDescriptionMeta(draft.details, draft.version, draft.effectiveDate);
  function updateReportToFromOption(option: unknown) {
    onUpdateDescriptionDraft("reportTo", selectedEntityName("position", option as ReferenceOption | undefined));
  }
  const detailsSurface = usePositionDescriptionDetailsSurface({
    value: draft.details,
    disabled: !canEditPosition,
    positionNames,
    currentPosition,
    positions,
    departmentNames,
    template: selectedPositionDescriptionTemplate,
    onChange: value => onUpdateDescriptionDraft("details", value),
  });
  if (!position || !descriptionDraft) return null;
  const descriptionFields: FormSurfaceItemSpec<FormSurfaceLooseItem>[] = [
    { kind: "readonly", key: "name", label: "说明书名称", value: position.name },
    { kind: "readonly", key: "department", label: "说明书部门", value: position.departmentName || "未设置" },
    {
      key: "reportTo",
      label: "汇报对象",
      spec: {
        valueType: "reference",
        control: "reference",
        state: !canEditPosition ? "disabled" : "normal",
        options: { source: "remote", fkKey: "hr.position", endpoint: HR_REFERENCE_OPTIONS_ENDPOINT, returnField: "name" },
      },
      value: draft.reportTo || "",
      displayValue: draft.reportTo || "",
      placeholder: "搜索汇报对象",
      onChange: (_value, option) => updateReportToFromOption(option),
    },
    {
      key: "headcount",
      label: "编制",
      spec: { valueType: "number", control: "text", state: !canEditPosition ? "disabled" : "normal" },
      value: draft.headcount,
      inputMode: "numeric",
      onChange: value => onUpdateDescriptionDraft("headcount", String(value ?? "").replace(/\D/g, "")),
    },
    { kind: "readonly", key: "version", label: "版本", value: meta.version },
    { kind: "readonly", key: "effectiveDate", label: "生效日期", value: meta.effectiveDate },
    {
      key: "purpose",
      label: "岗位目的",
      span: "wide",
      spec: { valueType: "string", control: "text", multiline: true, state: !canEditPosition ? "disabled" : "normal" },
      value: draft.positionPurpose,
      rows: 3,
      onChange: value => onUpdateDescriptionDraft("positionPurpose", String(value ?? "")),
    },
    {
      key: "summary",
      label: "摘要",
      span: "wide",
      spec: { valueType: "string", control: "text", multiline: true, state: !canEditPosition ? "disabled" : "normal" },
      value: draft.summary,
      rows: 3,
      onChange: value => onUpdateDescriptionDraft("summary", String(value ?? "")),
    },
    ...detailsSurface.content.items,
  ];

  return createPanelSection("position-description", {
      title: (
        <span className="flex min-w-0 items-center gap-2">
          <span>岗位说明书</span>
          {descriptionDirty ? <span className="text-xs text-amber-600">说明书有未保存修改</span> : null}
        </span>
      ),
      actions: [
        { key: "view-description", label: "查看岗位说明书", icon: "view" as const, disabled: !onPreviewPositionDescription, onClick: onPreviewPositionDescription },
        { key: "edit-template", label: "编辑模板", icon: "edit" as const, disabled: selectedPositionDescriptionTemplate.id === "full", onClick: onOpenPositionDescriptionTemplateEditor },
        ...(selectedPositionDescriptionTemplateStored
          ? [{
              key: "delete-template",
              label: selectedPositionDescriptionTemplateDefault ? "恢复默认" : "删除模板",
              variant: selectedPositionDescriptionTemplateDefault ? "secondary" as const : "danger" as const,
              onClick: () => void onDeletePositionDescriptionTemplate(),

            }]
          : []),
      ],

      sections: [
        {
          key: "template",
          body: { kind: "form", form: {
            kind: "filters",
            content: { items: [{
              key: "template",
              label: "模板",

              spec: {
                valueType: "string",
                control: "choice",
                options: {
                  source: "static",
                  mode: "dropdown",
                  items: [...positionDescriptionTemplates.map(template => ({
                    value: template.id,
                    label: template.label
                  })), {
                    value: NEW_POSITION_DESCRIPTION_TEMPLATE_OPTION,
                    label: "新建模板..."
                  }],
                },
              },
              value: positionDescriptionTemplate,
              onChange: (value: unknown) => onPositionDescriptionTemplateChange(String(value ?? "")),
            }] },
          } },
        },
        ...(templateEditorOpen ? [createPositionDescriptionTemplateEditorSection({
          name: templateDraftName,
          fields: templateDraftFields,
          onNameChange: onTemplateDraftNameChange,
          onToggleField: onTogglePositionDescriptionTemplateField,
          onSave: onSavePositionDescriptionTemplate,
          onCancel: () => onTemplateEditorOpenChange(false),
        })] : []),
        {
          key: "description-fields",
          body: { kind: "form", form: {
            kind: "fields",
            content: { items: descriptionFields, layout: { columns: 2 } },
          } },
        },
      ],
    });
}

export function PositionDescriptionPanel(props: Omit<PositionDescriptionPanelProps, "position" | "descriptionDraft"> & {
  position: Position;
  descriptionDraft: DescriptionDraft;
}) {
  const section = usePositionDescriptionPanelSection(props);
  return <PageSurface kind="standard" embedded body={createPageBody(section ? [section] : [])} />;
}
