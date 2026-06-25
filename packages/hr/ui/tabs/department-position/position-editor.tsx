"use client";

import { FkFieldInput, FormField, PanelCard, TextField, getToolbarActionClassName } from "@workspace/core/ui";
import type { FkFieldOption } from "@workspace/core/ui";
import PositionAliasTagsInput from "./PositionAliasTagsInput";
import { type PositionDescriptionTemplate, type PositionDescriptionTemplateId } from "./description-details";
import { DetailSectionHeader, formInputClassName } from "./detail-editors";
import { DirectPositionPanel } from "./navigation-panels";
import { PositionDescriptionPanel } from "./position-description-panel";
import { HR_REFERENCE_OPTIONS_ENDPOINT } from "../../fk-keys";
import type { Department, DescriptionDraft, Position, PositionDraft, Selection } from "./types";
import { departmentPath, positionCodePrefix, positionCodePrefixFromCode, positionCodeSuffix } from "./utils";
export function PositionEditor({
  position,
  draft,
  descriptionDraft,
  departmentById,
  positionsByDepartment,
  selection,
  showArchived,
  canEdit,
  canEditPosition,
  dirty,
  descriptionDirty,
  saving,
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
  onSelect,
  onUpdateDraft,
  onUpdateDraftDepartment,
  onUpdateDraftCodeSuffix,
  onUpdateDescriptionDraft,
  onPositionDescriptionTemplateChange,
  onOpenPositionDescriptionTemplateEditor,
  onSavePositionDescriptionTemplate,
  onDeletePositionDescriptionTemplate,
  onTemplateEditorOpenChange,
  onTemplateDraftNameChange,
  onTogglePositionDescriptionTemplateField,
  onSavePosition,
  onArchivePosition
}: {
  position: Position;
  draft: PositionDraft | null;
  descriptionDraft: DescriptionDraft | null;
  departmentById: Map<number, Department>;
  positionsByDepartment: Map<number, Position[]>;
  selection: Selection;
  showArchived: boolean;
  canEdit: boolean;
  canEditPosition: boolean;
  dirty: boolean;
  descriptionDirty: boolean;
  saving: boolean;
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
  onSelect: (selection: Selection) => void;
  onUpdateDraft: <K extends keyof PositionDraft>(key: K, value: PositionDraft[K]) => void;
  onUpdateDraftDepartment: (departmentId: number | null) => void;
  onUpdateDraftCodeSuffix: (value: string, pad?: boolean) => void;
  onUpdateDescriptionDraft: <K extends keyof DescriptionDraft>(key: K, value: DescriptionDraft[K]) => void;
  onPositionDescriptionTemplateChange: (value: string) => void;
  onOpenPositionDescriptionTemplateEditor: () => void;
  onSavePositionDescriptionTemplate: () => void | Promise<void>;
  onDeletePositionDescriptionTemplate: () => void | Promise<void>;
  onTemplateEditorOpenChange: (open: boolean) => void;
  onTemplateDraftNameChange: (name: string) => void;
  onTogglePositionDescriptionTemplateField: (field: string) => void;
  onSavePosition: () => void | Promise<void>;
  onArchivePosition: (positionId: number, archived: boolean) => void | Promise<void>;
}) {
  const draftDepartment = draft?.departmentId ? departmentById.get(draft.departmentId) : undefined;
  const draftCodePrefix = positionCodePrefix(draftDepartment) || (showArchived ? positionCodePrefixFromCode(position.code) : "");
  const draftCodeSuffix = draft ? positionCodeSuffix(draft.code) : "";
  const draftDepartmentDisplay = departmentPath(draftDepartment, departmentById) || position.departmentName || "";
  return <div className="space-y-5">
      {position.departmentId ? <DirectPositionPanel departmentId={position.departmentId} positionsByDepartment={positionsByDepartment} selection={selection} onSelect={onSelect} /> : null}
      <PanelCard bodyClassName="p-4">
        <DetailSectionHeader title="岗位信息" meta={dirty && <span className="text-xs text-amber-600">有未保存修改</span>} actions={<div className="flex items-center gap-2">
              <button type="button" disabled={!canEditPosition || !dirty || saving} onClick={() => void onSavePosition()} className={getToolbarActionClassName("primary")}>
                {saving ? "保存中..." : "保存"}
              </button>
              {canEdit && <button type="button" disabled={saving} onClick={() => void onArchivePosition(position.id, !showArchived)} className={getToolbarActionClassName()}>
                  {showArchived ? "恢复" : "归档"}
                </button>}
            </div>} />
        {draft && <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <FormField label="岗位编码">
              <div className="flex min-h-10 overflow-hidden rounded-md border border-sky-200 bg-white text-sm shadow-sm focus-within:border-sky-500 focus-within:ring-1 focus-within:ring-sky-500">
                <span className="flex min-w-0 flex-1 items-center truncate border-r border-slate-200 bg-slate-50 px-3 font-mono text-slate-500" title={draftCodePrefix || "请先选择直属部门"}>
                  {draftCodePrefix || "选择直属部门后生成"}
                </span>
                <TextField value={draftCodeSuffix} disabled={!canEditPosition || !draftCodePrefix} inputMode="numeric" maxLength={2} ariaLabel="岗位编码序号" onChange={next => onUpdateDraftCodeSuffix(next)} onBlur={event => onUpdateDraftCodeSuffix(event.target.value, true)} className="w-20 border-0 bg-white px-3 py-2 font-mono text-slate-900 outline-none placeholder:text-slate-400 disabled:bg-slate-100 disabled:text-slate-400" placeholder="01" unstyled />
              </div>
            </FormField>
            <FormField label="岗位名称">
              <TextField value={draft.name} disabled={!canEditPosition} onChange={next => onUpdateDraft("name", next)} className={formInputClassName} />
            </FormField>
            <FormField label="别名" className="md:col-span-2">
              <PositionAliasTagsInput value={draft.alias || ""} disabled={!canEditPosition} onChange={value => onUpdateDraft("alias", value)} />
            </FormField>
            <FormField label="直属部门">
              <FkFieldInput fkKey="hr.department" endpoint={HR_REFERENCE_OPTIONS_ENDPOINT} value={draft.departmentId == null ? "" : String(draft.departmentId)} displayValue={draftDepartmentDisplay} disabled={!canEditPosition} placeholder="搜索部门" onChange={(_label, option?: FkFieldOption) => onUpdateDraftDepartment(option?.id ?? null)} />
            </FormField>
          </div>}
      </PanelCard>

      {descriptionDraft && <PositionDescriptionPanel position={position} descriptionDraft={descriptionDraft} canEditPosition={canEditPosition} descriptionDirty={descriptionDirty} positionDescriptionTemplate={positionDescriptionTemplate} positionDescriptionTemplates={positionDescriptionTemplates} selectedPositionDescriptionTemplate={selectedPositionDescriptionTemplate} selectedPositionDescriptionTemplateStored={selectedPositionDescriptionTemplateStored} selectedPositionDescriptionTemplateDefault={selectedPositionDescriptionTemplateDefault} templateEditorOpen={templateEditorOpen} templateDraftName={templateDraftName} templateDraftFields={templateDraftFields} positionNames={positionNames} positions={positions} departmentNames={departmentNames} onUpdateDescriptionDraft={onUpdateDescriptionDraft} onPositionDescriptionTemplateChange={onPositionDescriptionTemplateChange} onOpenPositionDescriptionTemplateEditor={onOpenPositionDescriptionTemplateEditor} onSavePositionDescriptionTemplate={onSavePositionDescriptionTemplate} onDeletePositionDescriptionTemplate={onDeletePositionDescriptionTemplate} onTemplateEditorOpenChange={onTemplateEditorOpenChange} onTemplateDraftNameChange={onTemplateDraftNameChange} onTogglePositionDescriptionTemplateField={onTogglePositionDescriptionTemplateField} />}
    </div>;
}
