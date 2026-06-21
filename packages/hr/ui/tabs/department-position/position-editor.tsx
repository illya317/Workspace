"use client";

import {
  ActionButton,
  CheckboxChip,
  FkFieldInput,
  FormField,
  PanelCard,
  SelectField,
  TextareaField,
  TextField,
  getFieldInputClassName,
} from "@workspace/core/ui";
import type { FkFieldOption } from "@workspace/core/ui";
import PositionAliasTagsInput from "./PositionAliasTagsInput";
import {
  DETAIL_FIELD_LABELS,
  NEW_POSITION_DESCRIPTION_TEMPLATE_OPTION,
  POSITION_DESCRIPTION_TEMPLATE_FIELD_GROUPS,
  type PositionDescriptionTemplate,
  type PositionDescriptionTemplateId,
} from "./description-details";
import {
  DetailSectionHeader,
  PositionDescriptionDetailsEditor,
  compactReadOnlyInputClassName,
  formInputClassName,
  sectionTitle,
  selectedEntityName,
} from "./detail-editors";
import { deriveDescriptionMeta } from "./draft-utils";
import { DirectPositionPanel } from "./navigation-panels";
import type { Department, DescriptionDraft, Position, PositionDraft, Selection } from "./types";
import {
  departmentPath,
  positionCodePrefix,
  positionCodePrefixFromCode,
  positionCodeSuffix,
} from "./utils";

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
  onArchivePosition,
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

  return (
    <div className="space-y-5">
      {position.departmentId ? (
        <DirectPositionPanel
          departmentId={position.departmentId}
          positionsByDepartment={positionsByDepartment}
          selection={selection}
          onSelect={onSelect}
        />
      ) : null}
      <PanelCard bodyClassName="p-4">
        <DetailSectionHeader
          title="岗位信息"
          meta={dirty && <span className="text-xs text-amber-600">有未保存修改</span>}
          actions={
            <div className="flex items-center gap-2">
              <ActionButton
                disabled={!canEditPosition || !dirty || saving}
                onClick={() => void onSavePosition()}
                variant="primary"
              >
                {saving ? "保存中..." : "保存"}
              </ActionButton>
              {canEdit && (
                <ActionButton
                  disabled={saving}
                  onClick={() => void onArchivePosition(position.id, !showArchived)}
                >
                  {showArchived ? "恢复" : "归档"}
                </ActionButton>
              )}
            </div>
          }
        />
        {draft && (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <FormField label="岗位编码">
              <div className="flex min-h-10 overflow-hidden rounded-md border border-sky-200 bg-white text-sm shadow-sm focus-within:border-sky-500 focus-within:ring-1 focus-within:ring-sky-500">
                <span className="flex min-w-0 flex-1 items-center truncate border-r border-slate-200 bg-slate-50 px-3 font-mono text-slate-500" title={draftCodePrefix || "请先选择直属部门"}>
                  {draftCodePrefix || "选择直属部门后生成"}
                </span>
                <TextField
                  value={draftCodeSuffix}
                  disabled={!canEditPosition || !draftCodePrefix}
                  inputMode="numeric"
                  maxLength={2}
                  ariaLabel="岗位编码序号"
                  onChange={(next) => onUpdateDraftCodeSuffix(next)}
                  onBlur={(event) => onUpdateDraftCodeSuffix(event.target.value, true)}
                  className="w-20 border-0 bg-white px-3 py-2 font-mono text-slate-900 outline-none placeholder:text-slate-400 disabled:bg-slate-100 disabled:text-slate-400"
                  placeholder="01"
                  unstyled
                />
              </div>
            </FormField>
            <FormField label="岗位名称">
              <TextField
                value={draft.name}
                disabled={!canEditPosition}
                onChange={(next) => onUpdateDraft("name", next)}
                className={formInputClassName}
              />
            </FormField>
            <FormField label="别名" className="md:col-span-2">
              <PositionAliasTagsInput
                value={draft.alias || ""}
                disabled={!canEditPosition}
                onChange={(value) => onUpdateDraft("alias", value)}
              />
            </FormField>
            <FormField label="直属部门">
              <FkFieldInput
                fkKey="hr.department"
                value={draft.departmentId == null ? "" : String(draft.departmentId)}
                displayValue={draftDepartmentDisplay}
                disabled={!canEditPosition}
                placeholder="搜索部门"
                onChange={(_label, option?: FkFieldOption) => onUpdateDraftDepartment(option?.id ?? null)}
              />
            </FormField>
          </div>
        )}
      </PanelCard>

      {descriptionDraft && (
        <PanelCard bodyClassName="p-4">
          {sectionTitle(
            "岗位说明书",
            <div className="flex items-center gap-3">
              {descriptionDirty && <span className="text-xs text-amber-600">说明书有未保存修改</span>}
              <FormField label="模板" layout="inline">
                <SelectField
                  value={positionDescriptionTemplate}
                  onChange={onPositionDescriptionTemplateChange}
                  options={[
                    ...positionDescriptionTemplates.map((template) => ({ value: template.id, label: template.label })),
                    { value: NEW_POSITION_DESCRIPTION_TEMPLATE_OPTION, label: "新建模板..." },
                  ]}
                  className="w-32"
                  selectClassName="min-h-7 text-slate-700"
                />
              </FormField>
              <ActionButton
                disabled={selectedPositionDescriptionTemplate.id === "full"}
                onClick={onOpenPositionDescriptionTemplateEditor}
                className="px-2 py-1 text-xs"
              >
                编辑模板
              </ActionButton>
              {selectedPositionDescriptionTemplateStored && (
                <ActionButton
                  onClick={() => void onDeletePositionDescriptionTemplate()}
                  variant={selectedPositionDescriptionTemplateDefault ? "secondary" : "danger"}
                  className="px-2 py-1 text-xs"
                >
                  {selectedPositionDescriptionTemplateDefault ? "恢复默认" : "删除模板"}
                </ActionButton>
              )}
            </div>
          )}
          {templateEditorOpen && (
            <PanelCard className="mb-4" bodyClassName="p-3">
              <div className="mb-3 flex flex-wrap items-end gap-3">
                <FormField label="模板名称" className="min-w-64 flex-1">
                  <TextField
                    value={templateDraftName}
                    onChange={onTemplateDraftNameChange}
                    className={formInputClassName}
                  />
                </FormField>
                <div className="flex gap-2">
                  <ActionButton onClick={() => void onSavePositionDescriptionTemplate()} variant="primary">
                    保存模板
                  </ActionButton>
                  <ActionButton onClick={() => onTemplateEditorOpenChange(false)}>
                    取消
                  </ActionButton>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {POSITION_DESCRIPTION_TEMPLATE_FIELD_GROUPS.map((group) => (
                  <PanelCard key={group.label} bodyClassName="p-3">
                    <div className="mb-2 text-xs font-semibold text-slate-600">{group.label}</div>
                    <div className="flex flex-wrap gap-2">
                      {group.fields.map((field) => (
                        <CheckboxChip
                          key={field}
                          checked={templateDraftFields.includes(field)}
                          ariaLabel={DETAIL_FIELD_LABELS[field] || field}
                          onChange={() => onTogglePositionDescriptionTemplateField(field)}
                        >
                          {DETAIL_FIELD_LABELS[field] || field}
                        </CheckboxChip>
                      ))}
                    </div>
                  </PanelCard>
                ))}
              </div>
            </PanelCard>
          )}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <FormField label="说明书名称">
              <TextField value={position.name} disabled className={compactReadOnlyInputClassName} />
            </FormField>
            <FormField label="说明书部门">
              <TextField value={position.departmentName || ""} disabled className={compactReadOnlyInputClassName} />
            </FormField>
            <FormField label="汇报对象">
              <FkFieldInput
                fkKey="hr.position"
                value={descriptionDraft.reportTo}
                displayValue={descriptionDraft.reportTo}
                disabled={!canEditPosition}
                placeholder="搜索岗位"
                onChange={(_label, option?: FkFieldOption) => onUpdateDescriptionDraft("reportTo", selectedEntityName("position", option))}
              />
            </FormField>
            <FormField label="编制">
              <TextField
                value={descriptionDraft.headcount}
                disabled={!canEditPosition}
                inputMode="numeric"
                onChange={(next) => onUpdateDescriptionDraft("headcount", next.replace(/\D/g, ""))}
                className={formInputClassName}
              />
            </FormField>
            <FormField label="版本">
              <TextField
                value={deriveDescriptionMeta(descriptionDraft.details, descriptionDraft.version, descriptionDraft.effectiveDate).version}
                disabled
                className={compactReadOnlyInputClassName}
              />
            </FormField>
            <FormField label="生效日期">
              <TextField
                value={deriveDescriptionMeta(descriptionDraft.details, descriptionDraft.version, descriptionDraft.effectiveDate).effectiveDate}
                disabled
                className={compactReadOnlyInputClassName}
              />
            </FormField>
            <FormField label="岗位目的" className="md:col-span-2">
              <TextareaField
                value={descriptionDraft.positionPurpose}
                disabled={!canEditPosition}
                rows={3}
                onChange={(next) => onUpdateDescriptionDraft("positionPurpose", next)}
                className={getFieldInputClassName("resize-y")}
              />
            </FormField>
            <FormField label="摘要" className="md:col-span-2">
              <TextareaField
                value={descriptionDraft.summary}
                disabled={!canEditPosition}
                rows={3}
                onChange={(next) => onUpdateDescriptionDraft("summary", next)}
                className={getFieldInputClassName("resize-y")}
              />
            </FormField>
            <PositionDescriptionDetailsEditor
              value={descriptionDraft.details}
              disabled={!canEditPosition}
              positionNames={positionNames}
              departmentNames={departmentNames}
              template={selectedPositionDescriptionTemplate}
              onChange={(value) => onUpdateDescriptionDraft("details", value)}
            />
          </div>
        </PanelCard>
      )}
    </div>
  );
}
