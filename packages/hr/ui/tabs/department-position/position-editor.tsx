"use client";

import { createEmptySection, createPageBody, createPanelSection, BodySurface, type FormSurfaceItemSpec, type BodySurfaceSectionSpec, type ReferenceOption } from "@workspace/core/ui";
import { workspacePath } from "@workspace/core/routing";
import {
  createPositionDescriptionTemplateSection,
  type PositionDescriptionTemplateData,
  type PositionDescriptionTemplateDto,
} from "@workspace/platform/ui/position-description/PositionDescriptionTemplateView";
import { useEffect, useState } from "react";
import { type PositionDescriptionTemplate, type PositionDescriptionTemplateId } from "./description-details";
import { createDirectPositionPanelSection } from "./navigation-panels";
import { usePositionReportOverridesSection } from "./position-report-overrides-panel";
import { usePositionDescriptionPanelSection } from "./position-description-panel";
import { HR_REFERENCE_OPTIONS_ENDPOINT } from "../../fk-keys";
import { selectedEntityName } from "./detail-editors";
import type { Department, DescriptionDraft, OrganizationCodeConfig, Position, PositionDraft, Selection } from "./types";
import { departmentPath, positionCodePrefix, positionCodePrefixFromCode, positionCodeSuffix, splitAliasText } from "./utils";
type PositionEditorProps = {
  position: Position | null | undefined;
  draft: PositionDraft | null;
  descriptionDraft: DescriptionDraft | null;
  departmentById: Map<number, Department>;
  positionsByDepartment: Map<number, Position[]>;
  selection: Selection;
  showArchived: boolean;
  canArchive: boolean;
  canEditPosition: boolean;
  codeConfig: OrganizationCodeConfig | null;
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
  canArchive,
  canEditPosition,
  codeConfig,
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
  const positionDescriptionId = position?.positionDescriptionId || null;
  const reportOverridesBlock = usePositionReportOverridesSection(position ?? null);
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
    onPreviewPositionDescription: positionDescriptionId ? () => setPreviewOpen(true) : undefined,
  });

  useEffect(() => {
    if (!previewOpen || !positionDescriptionId) return;
    let cancelled = false;
    setPreviewLoading(true);
    setPreviewError("");
    fetch(workspacePath(`/api/modules/hr/roster/position-descriptions?id=${encodeURIComponent(String(positionDescriptionId))}`))
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
  }, [positionDescriptionId, previewOpen]);

  if (!position) return [];
  const draftDepartment = draft?.departmentId ? departmentById.get(draft.departmentId) : undefined;
  const draftCodePrefix = codeConfig
    ? positionCodePrefix(draftDepartment, codeConfig)
    : showArchived ? positionCodePrefixFromCode(position.code, codeConfig) : "";
  const draftDepartmentDisplay = departmentPath(draftDepartment, departmentById) || position.departmentName || "";
  const previewSection = previewLoading
    ? createEmptySection("position-description-preview-paper", { content: "加载中...", compact: true })
    : previewError || !previewData
      ? createEmptySection("position-description-preview-paper", { content: previewError || "未找到", compact: true })
      : createPositionDescriptionTemplateSection("position-description-preview-paper", previewData, previewTemplate);
  const positionInfoFields: FormSurfaceItemSpec<string>[] = draft ? [
    {
      key: "code",
      label: "岗位编码",
      spec: {
        valueType: "string",
        control: "text",
        mask: {
          kind: "editableSegment",
          extract: (code: string) => positionCodeSuffix(code, codeConfig),
          compose: (segment: string, code: string) => {
            const prefix = draftCodePrefix || positionCodePrefixFromCode(code, codeConfig);
            const length = codeConfig?.position.sequenceLength ?? 0;
            const suffix = segment.replace(/\D/g, "").slice(0, length).padStart(length, "0");
            return suffix && prefix ? `${prefix}${suffix}` : code;
          },
          normalize: (segment: string) => segment.replace(/\D/g, "").slice(0, codeConfig?.position.sequenceLength ?? 0),
          placeholder: String(codeConfig?.position.sequenceStart ?? "").padStart(codeConfig?.position.sequenceLength ?? 0, "0"),
        },
        state: !canEditPosition || !draftCodePrefix ? "disabled" : "normal",
      },
      value: draft.code,
      onChange: (nextCode) => onUpdateDraftCodeSuffix(positionCodeSuffix(String(nextCode ?? ""), codeConfig), true),
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
      removeConfirmMessage: (tag) => `确定删除别名「${tag}」吗？删除后需要保存才会生效。`,
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
      label: "直属组织",
      spec: {
        valueType: "reference",
        control: "reference",
        state: !canEditPosition ? "disabled" : "normal",
        options: { source: "remote", fkKey: "hr.department", endpoint: HR_REFERENCE_OPTIONS_ENDPOINT, returnField: "id" },
      },
      value: draft.departmentId == null ? "" : String(draft.departmentId),
      displayValue: draftDepartmentDisplay,
      placeholder: "搜索组织",
      onChange: (_label, option) => {
        onUpdateDraftDepartment((option as ReferenceOption | undefined)?.id ?? null);
        onUpdateDraft("reportTo", "");
        onUpdateDraft("reportToPositionId", null);
      },
    },
    {
      key: "reportTo",
      label: "上级岗位",
      spec: {
        valueType: "reference",
        control: "reference",
        state: !canEditPosition || !draft.departmentId ? "disabled" : "normal",
        options: {
          source: "remote",
          fkKey: "hr.position.inDepartment",
          endpoint: HR_REFERENCE_OPTIONS_ENDPOINT,
          returnField: "id",
          queryParams: { departmentId: draft.departmentId },
        },
      },
      value: draft.reportToPositionId == null ? "" : String(draft.reportToPositionId),
      displayValue: draft.reportTo || "",
      placeholder: draft.departmentId ? "搜索上级岗位" : "先选择直属组织",
      onChange: (_value, option) => {
        const fkOption = option as ReferenceOption | undefined;
        onUpdateDraft("reportTo", selectedEntityName("position", fkOption));
        onUpdateDraft("reportToPositionId", fkOption?.id ?? null);
      },
    },
  ] : [];
  return [
      ...(position.departmentId ? [createDirectPositionPanelSection({ departmentId: position.departmentId, positionsByDepartment, selection, onSelect })] : []),
      createPanelSection("position-info", {
          sections: draft ? [{
            key: "fields",
            body: { kind: "form", form: {
              kind: "fields",
              header: { title: (
                <span className="flex min-w-0 items-center gap-2">
                  <span>岗位信息</span>
                  {dirty && <span className="text-xs text-amber-600">有未保存修改</span>}
                </span>
              ) },
              actions: [
                { key: "save", action: "save", label: saving ? "保存中..." : "保存", disabled: !canEditPosition || !dirty || saving, onClick: () => void onSavePosition() },
                ...(canArchive ? [{ key: "archive", action: showArchived ? "unarchive" as const : "archive" as const, label: showArchived ? "恢复" : "归档", disabled: saving, onClick: () => void onArchivePosition(position.id, !showArchived) }] : []),
              ],
              content: { items: positionInfoFields, layout: { columns: 2 } },
            } },
          }] : [],
        }),
    ...(reportOverridesBlock ? [reportOverridesBlock] : []),
      ...(descriptionBlock ? [descriptionBlock] : []),
      {
        key: "position-description-preview-modal-host",
        body: {
          kind: "section",
          modals: [{
            key: "position-description-preview",
            open: previewOpen,
            title: "岗位说明书",
            size: "xl",
            onClose: () => setPreviewOpen(false),
            sections: [previewSection],
          }],
        },
      },
    ];
}

export function PositionEditor(props: Omit<PositionEditorProps, "position"> & { position: Position }) {
  const sections = usePositionEditorSections(props);
  return <BodySurface {...createPageBody(sections)} />;
}
