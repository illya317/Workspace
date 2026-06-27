"use client";

import { FormSurface, PageSurface, type ReferenceOption } from "@workspace/core/ui";
import { SegmentedCodeInput } from "@workspace/platform/ui";
import PositionAliasTagsInput from "./PositionAliasTagsInput";
import { type PositionDescriptionTemplate, type PositionDescriptionTemplateId } from "./description-details";
import { DetailSectionHeader } from "./detail-editors";
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
  const draftDepartmentDisplay = departmentPath(draftDepartment, departmentById) || position.departmentName || "";
  return <div className="space-y-5">
      {position.departmentId ? <DirectPositionPanel departmentId={position.departmentId} positionsByDepartment={positionsByDepartment} selection={selection} onSelect={onSelect} /> : null}
      <PageSurface
        embedded
        kind="detail"
        blocks={[{
          kind: "panel",
          key: "position-info",
          bodyClassName: "p-4",
          blocks: [{
            kind: "moduleView",
            key: "content",
            view: <>
        <DetailSectionHeader title="岗位信息" meta={dirty && <span className="text-xs text-amber-600">有未保存修改</span>} actions={<div className="flex items-center gap-2">
              <FormSurface
                kind="inline"
                actions={[
                  { key: "save", label: saving ? "保存中..." : "保存", variant: "primary", disabled: !canEditPosition || !dirty || saving, onClick: () => void onSavePosition() },
                  ...(canEdit ? [{ key: "archive", label: showArchived ? "恢复" : "归档", disabled: saving, onClick: () => void onArchivePosition(position.id, !showArchived) }] : []),
                ]}
              />
            </div>} />
        {draft && <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <div className="mb-1 text-xs font-medium text-slate-500">岗位编码</div>
              <SegmentedCodeInput
                value={draft.code}
                disabled={!canEditPosition || !draftCodePrefix}
                className="font-mono"
                editableSegment={{
                  extract: (code) => positionCodeSuffix(code),
                  compose: (segment, code) => {
                    const prefix = draftCodePrefix || positionCodePrefixFromCode(code);
                    const suffix = segment.replace(/\D/g, "").slice(0, 2).padStart(2, "0");
                    return suffix && prefix ? `${prefix}${suffix}` : code;
                  },
                  normalize: (segment) => segment.replace(/\D/g, "").slice(0, 2),
                  placeholder: "01",
                }}
                onChange={(nextCode) => onUpdateDraftCodeSuffix(positionCodeSuffix(nextCode), true)}
              />
            </div>
            <FormSurface kind="fields" fields={[{
              key: "name",
              label: "岗位名称",
              spec: { valueType: "string", editor: "input", state: !canEditPosition ? "disabled" : "normal" },
              value: draft.name,
              onChange: next => onUpdateDraft("name", String(next ?? "")),
            }]} />
            <div className="md:col-span-2">
              <div className="mb-1 text-xs font-medium text-slate-500">别名</div>
              <PositionAliasTagsInput value={draft.alias || ""} disabled={!canEditPosition} onChange={value => onUpdateDraft("alias", value)} />
            </div>
            <FormSurface kind="fields" fields={[{
              key: "department",
              label: "直属部门",
              spec: { valueType: "reference", editor: "autocomplete", state: !canEditPosition ? "disabled" : "normal", options: { source: "remote", fkKey: "hr.department", endpoint: HR_REFERENCE_OPTIONS_ENDPOINT, returnField: "id" } },
              value: draft.departmentId == null ? "" : String(draft.departmentId),
              displayValue: draftDepartmentDisplay,
              placeholder: "搜索部门",
              onChange: (_label, option) => onUpdateDraftDepartment((option as ReferenceOption | undefined)?.id ?? null),
            }]} />
          </div>}
            </>,
          }],
        }]}
      />

      {descriptionDraft && <PositionDescriptionPanel position={position} descriptionDraft={descriptionDraft} canEditPosition={canEditPosition} descriptionDirty={descriptionDirty} positionDescriptionTemplate={positionDescriptionTemplate} positionDescriptionTemplates={positionDescriptionTemplates} selectedPositionDescriptionTemplate={selectedPositionDescriptionTemplate} selectedPositionDescriptionTemplateStored={selectedPositionDescriptionTemplateStored} selectedPositionDescriptionTemplateDefault={selectedPositionDescriptionTemplateDefault} templateEditorOpen={templateEditorOpen} templateDraftName={templateDraftName} templateDraftFields={templateDraftFields} positionNames={positionNames} positions={positions} departmentNames={departmentNames} onUpdateDescriptionDraft={onUpdateDescriptionDraft} onPositionDescriptionTemplateChange={onPositionDescriptionTemplateChange} onOpenPositionDescriptionTemplateEditor={onOpenPositionDescriptionTemplateEditor} onSavePositionDescriptionTemplate={onSavePositionDescriptionTemplate} onDeletePositionDescriptionTemplate={onDeletePositionDescriptionTemplate} onTemplateEditorOpenChange={onTemplateEditorOpenChange} onTemplateDraftNameChange={onTemplateDraftNameChange} onTogglePositionDescriptionTemplateField={onTogglePositionDescriptionTemplateField} />}
    </div>;
}
