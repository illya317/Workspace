"use client";

import { CommandButton, FkFieldInput, FormField, PanelCard, ReadOnlyField, SelectField, TextareaField, TextField } from "@workspace/core/ui";
import { HR_REFERENCE_OPTIONS_ENDPOINT } from "../../fk-keys";
import { NEW_POSITION_DESCRIPTION_TEMPLATE_OPTION, type PositionDescriptionTemplate, type PositionDescriptionTemplateId } from "./description-details";
import { PositionDescriptionDetailsEditor, formInputClassName, sectionTitle, selectedEntityName } from "./detail-editors";
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
  return <PanelCard bodyClassName="p-4">
      {sectionTitle("岗位说明书", <div className="flex items-center gap-3">
          {descriptionDirty && <span className="text-xs text-amber-600">说明书有未保存修改</span>}
          <FormField label="模板" layout="inline">
            <SelectField value={positionDescriptionTemplate} onChange={onPositionDescriptionTemplateChange} options={[...positionDescriptionTemplates.map(template => ({
          value: template.id,
          label: template.label
        })), {
          value: NEW_POSITION_DESCRIPTION_TEMPLATE_OPTION,
          label: "新建模板..."
        }]} className="w-32" triggerClassName="min-h-7 text-slate-700" />
          </FormField>
          <CommandButton disabled={selectedPositionDescriptionTemplate.id === "full"} onClick={onOpenPositionDescriptionTemplateEditor} className="px-2 py-1 text-xs">
            编辑模板
          </CommandButton>
          {selectedPositionDescriptionTemplateStored && <CommandButton variant={selectedPositionDescriptionTemplateDefault ? "secondary" : "danger"} onClick={() => void onDeletePositionDescriptionTemplate()} className="px-2 py-1 text-xs">
              {selectedPositionDescriptionTemplateDefault ? "恢复默认" : "删除模板"}
            </CommandButton>}
        </div>)}
      {templateEditorOpen && <PositionDescriptionTemplateEditor name={templateDraftName} fields={templateDraftFields} onNameChange={onTemplateDraftNameChange} onToggleField={onTogglePositionDescriptionTemplateField} onSave={onSavePositionDescriptionTemplate} onCancel={() => onTemplateEditorOpenChange(false)} />}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <FormField label="说明书名称">
          <ReadOnlyField value={position.name} />
        </FormField>
        <FormField label="说明书部门">
          <ReadOnlyField value={position.departmentName || "未设置"} />
        </FormField>
        <FormField label="汇报对象">
          <FkFieldInput
            fkKey="hr.position"
            endpoint={HR_REFERENCE_OPTIONS_ENDPOINT}
            value={descriptionDraft.reportTo || ""}
            displayValue={descriptionDraft.reportTo || ""}
            disabled={!canEditPosition}
            placeholder="搜索汇报对象"
            onChange={(_label, option) => onUpdateDescriptionDraft("reportTo", selectedEntityName("position", option))}
          />
        </FormField>
        <FormField label="编制">
          <TextField value={descriptionDraft.headcount} disabled={!canEditPosition} inputMode="numeric" onChange={next => onUpdateDescriptionDraft("headcount", next.replace(/\D/g, ""))} className={formInputClassName} />
        </FormField>
        <FormField label="版本">
          <ReadOnlyField value={meta.version} />
        </FormField>
        <FormField label="生效日期">
          <ReadOnlyField value={meta.effectiveDate} />
        </FormField>
        <FormField label="岗位目的" className="md:col-span-2">
          <TextareaField value={descriptionDraft.positionPurpose} disabled={!canEditPosition} rows={3} onChange={next => onUpdateDescriptionDraft("positionPurpose", next)} className="resize-y" />
        </FormField>
        <FormField label="摘要" className="md:col-span-2">
          <TextareaField value={descriptionDraft.summary} disabled={!canEditPosition} rows={3} onChange={next => onUpdateDescriptionDraft("summary", next)} className="resize-y" />
        </FormField>
        <PositionDescriptionDetailsEditor value={descriptionDraft.details} disabled={!canEditPosition} positionNames={positionNames} currentPosition={position} positions={positions} departmentNames={departmentNames} template={selectedPositionDescriptionTemplate} onChange={value => onUpdateDescriptionDraft("details", value)} />
      </div>
    </PanelCard>;
}
