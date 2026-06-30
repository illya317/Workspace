"use client";

import { createEmptySection, createPageBody, createPanelSection, PageSurface, type FormSurfaceItemSpec, type BodySurfaceSectionSpec, type ReferenceOption } from "@workspace/core/ui";
import { workspacePath } from "@workspace/core/routing";
import {
  PositionDescriptionTemplatePaper,
  type PositionDescriptionTemplateData,
  type PositionDescriptionTemplateDto,
} from "@workspace/platform/ui/position-description/PositionDescriptionTemplateView";
import { useEffect, useState } from "react";
import { type PositionDescriptionTemplate, type PositionDescriptionTemplateId } from "./description-details";
import { createDirectPositionPanelSection } from "./navigation-panels";
import { usePositionDescriptionPanelSection } from "./position-description-panel";
import { HR_REFERENCE_OPTIONS_ENDPOINT } from "../../fk-keys";
import type { Department, DescriptionDraft, Position, PositionDraft, Selection } from "./types";
import { departmentPath, positionCodePrefix, positionCodePrefixFromCode, positionCodeSuffix, splitAliasText } from "./utils";
type PositionEditorProps = {
  position: Position | null | undefined;
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
};

export function usePositionEditorSections({
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
}: PositionEditorProps): BodySurfaceSectionSpec[] {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [previewData, setPreviewData] = useState<PositionDescriptionTemplateData | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<PositionDescriptionTemplateDto | null>(null);
  const positionDescriptionCode = position ? position.positionDescriptionCode || position.code : "";
  const descriptionBlock = usePositionDescriptionPanelSection({
    position: position ?? null,
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
    onPreviewPositionDescription: positionDescriptionCode ? () => setPreviewOpen(true) : undefined,
  });

  useEffect(() => {
    if (!previewOpen || !positionDescriptionCode) return;
    let cancelled = false;
    setPreviewLoading(true);
    setPreviewError("");
    fetch(workspacePath(`/api/modules/hr/roster/position-descriptions?code=${encodeURIComponent(positionDescriptionCode)}`))
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((data) => {
        if (cancelled) return;
        setPreviewData(data.positionDescription ?? null);
        setPreviewTemplate(data.template ?? null);
        setPreviewLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setPreviewData(null);
        setPreviewError("获取失败");
        setPreviewLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [positionDescriptionCode, previewOpen]);

  if (!position) return [];
  const draftDepartment = draft?.departmentId ? departmentById.get(draft.departmentId) : undefined;
  const draftCodePrefix = positionCodePrefix(draftDepartment) || (showArchived ? positionCodePrefixFromCode(position.code) : "");
  const draftDepartmentDisplay = departmentPath(draftDepartment, departmentById) || position.departmentName || "";
  const previewContent = previewLoading
    ? "加载中..."
    : previewError || !previewData
      ? previewError || "未找到"
      : <PositionDescriptionTemplatePaper data={previewData} template={previewTemplate} />;
  const positionInfoFields: FormSurfaceItemSpec<string>[] = draft ? [
    {
      key: "code",
      label: "岗位编码",
      spec: {
        valueType: "string",
        control: "text",
        mask: {
          kind: "editableSegment",
          extract: (code: string) => positionCodeSuffix(code),
          compose: (segment: string, code: string) => {
            const prefix = draftCodePrefix || positionCodePrefixFromCode(code);
            const suffix = segment.replace(/\D/g, "").slice(0, 2).padStart(2, "0");
            return suffix && prefix ? `${prefix}${suffix}` : code;
          },
          normalize: (segment: string) => segment.replace(/\D/g, "").slice(0, 2),
          placeholder: "01",
        },
        state: !canEditPosition || !draftCodePrefix ? "disabled" : "normal",
      },
      value: draft.code,
      onChange: (nextCode) => onUpdateDraftCodeSuffix(positionCodeSuffix(String(nextCode ?? "")), true),
    },
    {
      key: "name",
      label: "岗位名称",
      spec: { valueType: "string", control: "text", state: !canEditPosition ? "disabled" : "normal" },
      value: draft.name,
      onChange: (next) => onUpdateDraft("name", String(next ?? "")),
    },
    {
      kind: "tagList",
      key: "alias",
      label: "别名",
      span: "wide",
      items: splitAliasText(draft.alias || ""),
      getKey: (tag, index) => `${tag}-${index}`,
      getLabel: (tag) => tag,
      onRemove: (_, index) => onUpdateDraft("alias", splitAliasText(draft.alias || "").filter((__, tagIndex) => tagIndex !== index).join("、")),
      onUpdateLabel: (_, index, next) => onUpdateDraft("alias", splitAliasText(draft.alias || "").map((tag, tagIndex) => tagIndex === index ? next : tag).join("、")),
      disabled: !canEditPosition,
      confirmMessage: (tag) => `确定删除别名「${tag}」吗？删除后需要保存才会生效。`,
      emptyText: !canEditPosition ? "未设置" : undefined,
      shellClassName: "content-start",
      append: !canEditPosition ? undefined : {
        textInput: {
          key: "positionAliasAppend",
          placeholder: splitAliasText(draft.alias || "").length === 0 ? "添加别名" : "",
          onAppend: (values) => onUpdateDraft("alias", [...splitAliasText(draft.alias || ""), ...values].join("、")),
          onRemoveLast: () => {
            const aliases = splitAliasText(draft.alias || "");
            if (aliases.length > 0) onUpdateDraft("alias", aliases.slice(0, -1).join("、"));
          },
        },
      },
    },
    {
      key: "department",
      label: "直属部门",
      spec: {
        valueType: "reference",
        control: "reference",
        state: !canEditPosition ? "disabled" : "normal",
        options: { source: "remote", fkKey: "hr.department", endpoint: HR_REFERENCE_OPTIONS_ENDPOINT, returnField: "id" },
      },
      value: draft.departmentId == null ? "" : String(draft.departmentId),
      displayValue: draftDepartmentDisplay,
      placeholder: "搜索部门",
      onChange: (_label, option) => onUpdateDraftDepartment((option as ReferenceOption | undefined)?.id ?? null),
    },
  ] : [];
  return [
      ...(position.departmentId ? [createDirectPositionPanelSection({ departmentId: position.departmentId, positionsByDepartment, selection, onSelect })] : []),
      createPanelSection("position-info", {
          title: (
            <span className="flex min-w-0 items-center gap-2">
              <span>岗位信息</span>
              {dirty && <span className="text-xs text-amber-600">有未保存修改</span>}
            </span>
          ),
          actions: [
            { key: "save", label: saving ? "保存中..." : "保存", icon: "save" as const, variant: "primary", disabled: !canEditPosition || !dirty || saving, onClick: () => void onSavePosition() },
            ...(canEdit ? [{ key: "archive", label: showArchived ? "恢复" : "归档", icon: showArchived ? "restore" as const : "archive" as const, disabled: saving, onClick: () => void onArchivePosition(position.id, !showArchived) }] : []),
          ],

          sections: draft ? [{
            key: "fields",
            body: { kind: "form", form: {
              kind: "fields",
              content: { items: positionInfoFields, layout: { columns: 2 } },
            } },
          }] : [],
        }),
      ...(descriptionBlock ? [descriptionBlock] : []),
      {
        key: "position-description-preview-modal-host",
        chrome: "plain",
        body: {
          kind: "section",
          modals: [{
            key: "position-description-preview",
            open: previewOpen,
            title: "岗位说明书",
            size: "xl",
            onClose: () => setPreviewOpen(false),
            sections: [
              createEmptySection("position-description-preview-paper", {
                presentation: "plain",
                content: previewContent,
              }),
            ],
          }],
        },
      },
    ];
}

export function PositionEditor(props: Omit<PositionEditorProps, "position"> & { position: Position }) {
  const sections = usePositionEditorSections(props);
  return <PageSurface kind="standard" embedded body={createPageBody(sections)} />;
}
