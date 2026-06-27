"use client";

import { FormSurface, PageSurface, type ReferenceOption } from "@workspace/core/ui";
import { HR_REFERENCE_OPTIONS_ENDPOINT } from "../../fk-keys";
import { NEW_POSITION_DESCRIPTION_TEMPLATE_OPTION, type PositionDescriptionTemplate, type PositionDescriptionTemplateId } from "./description-details";
import { PositionDescriptionDetailsEditor, sectionTitle, selectedEntityName } from "./detail-editors";
import { deriveDescriptionMeta } from "./draft-utils";
import { PositionDescriptionTemplateEditor } from "./position-description-template-editor";
import type { DescriptionDraft, Position } from "./types";
export function PositionDescriptionPanel({
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
}: {
  position: Position;
  descriptionDraft: DescriptionDraft;
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
}) {
  const meta = deriveDescriptionMeta(descriptionDraft.details, descriptionDraft.version, descriptionDraft.effectiveDate);
  function updateReportToFromOption(option: unknown) {
    onUpdateDescriptionDraft("reportTo", selectedEntityName("position", option as ReferenceOption | undefined));
  }

  return <PageSurface
    embedded
    kind="detail"
    blocks={[{
      kind: "panel",
      key: "position-description",
      bodyClassName: "p-4",
      blocks: [{
        kind: "moduleView",
        key: "content",
        view: <>
      {sectionTitle("岗位说明书", <div className="flex items-center gap-3">
          {descriptionDirty && <span className="text-xs text-amber-600">说明书有未保存修改</span>}
          <FormSurface
            kind="inline"
            fields={[{
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
            }]}
          />
          <FormSurface
            kind="inline"
            actions={[
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
            ]}
          />
        </div>)}
      {templateEditorOpen && <PositionDescriptionTemplateEditor name={templateDraftName} fields={templateDraftFields} onNameChange={onTemplateDraftNameChange} onToggleField={onTogglePositionDescriptionTemplateField} onSave={onSavePositionDescriptionTemplate} onCancel={() => onTemplateEditorOpenChange(false)} />}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <FormSurface
          kind="fields"
          columns={2}
          className="contents"
          bodyClassName="contents"
          fields={[
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
              value: descriptionDraft.reportTo || "",
              displayValue: descriptionDraft.reportTo || "",
              placeholder: "搜索汇报对象",
              onChange: (_value, option) => updateReportToFromOption(option),
            },
            {
              key: "headcount",
              label: "编制",
              spec: { valueType: "number", editor: "input", state: !canEditPosition ? "disabled" : "normal" },
              value: descriptionDraft.headcount,
              inputMode: "numeric",
              onChange: value => onUpdateDescriptionDraft("headcount", String(value ?? "").replace(/\D/g, "")),
            },
            { kind: "readonly", key: "version", label: "版本", value: meta.version },
            { kind: "readonly", key: "effectiveDate", label: "生效日期", value: meta.effectiveDate },
            {
              key: "purpose",
              label: "岗位目的",
              fieldClassName: "md:col-span-2",
              spec: { valueType: "string", editor: "textarea", state: !canEditPosition ? "disabled" : "normal" },
              value: descriptionDraft.positionPurpose,
              rows: 3,
              onChange: value => onUpdateDescriptionDraft("positionPurpose", String(value ?? "")),
            },
            {
              key: "summary",
              label: "摘要",
              fieldClassName: "md:col-span-2",
              spec: { valueType: "string", editor: "textarea", state: !canEditPosition ? "disabled" : "normal" },
              value: descriptionDraft.summary,
              rows: 3,
              onChange: value => onUpdateDescriptionDraft("summary", String(value ?? "")),
            },
          ]}
        />
        <PositionDescriptionDetailsEditor value={descriptionDraft.details} disabled={!canEditPosition} positionNames={positionNames} currentPosition={position} positions={positions} departmentNames={departmentNames} template={selectedPositionDescriptionTemplate} onChange={value => onUpdateDescriptionDraft("details", value)} />
      </div>
        </>,
      }],
    }]}
  />;
}
