"use client";

import { PageSurface, type FormSurfaceItemSpec, type FormSurfaceLooseItem, type PageSurfaceBlockSpec, type ReferenceOption } from "@workspace/core/ui";
import { HR_REFERENCE_OPTIONS_ENDPOINT } from "../../fk-keys";
import { NEW_POSITION_DESCRIPTION_TEMPLATE_OPTION, type PositionDescriptionTemplate, type PositionDescriptionTemplateId } from "./description-details";
import { selectedEntityName, usePositionDescriptionDetailsSurface } from "./detail-editors";
import { deriveDescriptionMeta } from "./draft-utils";
import { buildPositionDescriptionTemplateEditorBlock } from "./position-description-template-editor";
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

export function usePositionDescriptionPanelBlock({
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
  onTogglePositionDescriptionTemplateField
}: PositionDescriptionPanelProps): PageSurfaceBlockSpec | null {
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
        editor: "autocomplete",
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
      spec: { valueType: "number", editor: "input", state: !canEditPosition ? "disabled" : "normal" },
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
      spec: { valueType: "string", editor: "textarea", state: !canEditPosition ? "disabled" : "normal" },
      value: draft.positionPurpose,
      rows: 3,
      onChange: value => onUpdateDescriptionDraft("positionPurpose", String(value ?? "")),
    },
    {
      key: "summary",
      label: "摘要",
      span: "wide",
      spec: { valueType: "string", editor: "textarea", state: !canEditPosition ? "disabled" : "normal" },
      value: draft.summary,
      rows: 3,
      onChange: value => onUpdateDescriptionDraft("summary", String(value ?? "")),
    },
    ...(detailsSurface.fields ?? []),
  ];

  return {
      kind: "panel",
      key: "position-description",
      title: (
        <span className="flex min-w-0 items-center gap-2">
          <span>岗位说明书</span>
          {descriptionDirty ? <span className="text-xs text-amber-600">说明书有未保存修改</span> : null}
        </span>
      ),
      actions: [
        { key: "edit-template", label: "编辑模板", disabled: selectedPositionDescriptionTemplate.id === "full", onClick: onOpenPositionDescriptionTemplateEditor, className: "px-2 py-1 text-xs" },
        ...(selectedPositionDescriptionTemplateStored
          ? [{
              key: "delete-template",
              label: selectedPositionDescriptionTemplateDefault ? "恢复默认" : "删除模板",
              variant: selectedPositionDescriptionTemplateDefault ? "secondary" as const : "danger" as const,
              onClick: () => void onDeletePositionDescriptionTemplate(),
              className: "px-2 py-1 text-xs",
            }]
          : []),
      ],
      bodyClassName: "p-4",
      blocks: [
        {
          kind: "form",
          key: "template",
          surface: {
            kind: "inline",
            fields: [{
              key: "template",
              label: "模板",
              fieldClassName: "min-w-44",
              spec: {
                valueType: "string",
                editor: "select",
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
              onChange: (value) => onPositionDescriptionTemplateChange(String(value ?? "")),
            }],
          },
        },
        ...(templateEditorOpen ? [buildPositionDescriptionTemplateEditorBlock({
          name: templateDraftName,
          fields: templateDraftFields,
          onNameChange: onTemplateDraftNameChange,
          onToggleField: onTogglePositionDescriptionTemplateField,
          onSave: onSavePositionDescriptionTemplate,
          onCancel: () => onTemplateEditorOpenChange(false),
        })] : []),
        {
          kind: "form",
          key: "description-fields",
          surface: {
            kind: "fields",
            columns: 2,
            fields: descriptionFields,
          },
        },
      ],
    };
}

export function PositionDescriptionPanel(props: Omit<PositionDescriptionPanelProps, "position" | "descriptionDraft"> & {
  position: Position;
  descriptionDraft: DescriptionDraft;
}) {
  const block = usePositionDescriptionPanelBlock(props);
  return <PageSurface embedded kind="detail" blocks={block ? [block] : []} />;
}
