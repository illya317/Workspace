"use client";

import { useMemo, type Dispatch, type SetStateAction } from "react";
import { createPageBody, createMetricsSection, createEmptySection, createPanelSection, BodySurface, type FormSurfaceItemSpec, type BodySurfaceSectionSpec, type FormSurfaceProps, type ReferenceOption } from "@workspace/core/ui";
import { actionRuntimeCommands, workflowActionSurfaceActions } from "@workspace/platform/ui";
import type { ActionRuntime } from "@workspace/platform/workflow-action-runtime";
import { departmentCodeEditableSegment } from "./department-code-input";
import { HR_REFERENCE_OPTIONS_ENDPOINT } from "../../fk-keys";
import { canUseDepartmentAsParentForHierarchy, departmentDescendantIds, rebaseDepartmentCodeForParentChange, splitAliasText } from "./utils";
import { useDepartmentDescriptionsSection } from "./department-descriptions-panel";
import { createDirectPositionPanelSection } from "./navigation-panels";
import type { Department, DepartmentDescriptionDraft, DepartmentDraft, DepartmentPositionStats, CreatePositionDraft, DescriptionDraft, OrganizationCodeConfig, Position, Selection } from "./types";
import { useTenantConfig } from "@workspace/platform/ui/tenant-config";

type DepartmentDetailPaneProps = {
  selection: Selection;
  selectedDepartment: Department | undefined;
  selectedDepartmentStats: DepartmentPositionStats | null | undefined;
  departmentDraft: DepartmentDraft | null;
  departmentDescriptionDrafts: DepartmentDescriptionDraft[];
  positionsByDepartment: Map<number, Position[]>;
  isOrganizationMode: boolean;
  canArchive: boolean;
  actionRuntime: ActionRuntime | null;
  canEditPosition: boolean;
  createPanel: "department" | "position" | null;
  createPositionCode: string;
  createPositionDescriptionDetailsSurface: FormSurfaceProps;
  createPositionDescriptionDraft: DescriptionDraft;
  createPositionDepartment: Department | undefined;
  createPositionDraft: CreatePositionDraft;
  departmentById: Map<number, Department>;
  codeConfig: OrganizationCodeConfig | null;
  departmentDirty: boolean;
  departmentDescriptionDirty: boolean;
  saving: boolean;
  showArchived: boolean;
  positionEditorSections: BodySurfaceSectionSpec[];
  setCreatePanel: (panel: "department" | "position" | null) => void;
  setCreatePositionDescriptionDraft: Dispatch<SetStateAction<DescriptionDraft>>;
  setCreatePositionDraft: Dispatch<SetStateAction<CreatePositionDraft>>;
  onSelect: (selection: Selection) => void;
  onCreatePosition: (descriptionDraft: DescriptionDraft) => void | Promise<void>;
  onUpdateDepartmentDraft: <K extends keyof DepartmentDraft>(key: K, value: DepartmentDraft[K]) => void;
  onUpdateDepartmentDescriptionDraft: <K extends keyof DepartmentDescriptionDraft>(index: number, key: K, value: DepartmentDescriptionDraft[K]) => void;
  onSaveDepartmentInfo: () => void | Promise<void>;
  onArchiveDepartment: (departmentId: number, archived: boolean) => void | Promise<void>;
};

export function useDepartmentDetailPaneSection({
  selection,
  selectedDepartment,
  selectedDepartmentStats,
  departmentDraft,
  departmentDescriptionDrafts,
  positionsByDepartment,
  isOrganizationMode,
  canArchive,
  actionRuntime,
  canEditPosition,
  createPanel,
  createPositionCode,
  createPositionDescriptionDetailsSurface,
  createPositionDescriptionDraft,
  createPositionDepartment,
  createPositionDraft,
  departmentById,
  codeConfig,
  departmentDirty,
  departmentDescriptionDirty,
  saving,
  showArchived,
  positionEditorSections,
  setCreatePanel,
  setCreatePositionDescriptionDraft,
  setCreatePositionDraft,
  onSelect,
  onCreatePosition,
  onUpdateDepartmentDraft,
  onUpdateDepartmentDescriptionDraft,
  onSaveDepartmentInfo,
  onArchiveDepartment
}: DepartmentDetailPaneProps): BodySurfaceSectionSpec {
  const operatingCommitteeCode = useTenantConfig().organization.operatingCommittee.departmentCode;
  const isGovernanceOrganizationReadonly = selectedDepartment?.hierarchyKind === "G";
  const showDepartmentDescriptions = !isOrganizationMode;
  const canEditDepartmentDraft = actionRuntime?.editability === "editable"
    && !isGovernanceOrganizationReadonly;
  const parentDepartmentOptions = useMemo(() => {
    if (!selectedDepartment) return [];
    const excludedIds = departmentDescendantIds(selectedDepartment, departmentById);
    excludedIds.add(selectedDepartment.id);
    return [
      { value: "", label: "无" },
      ...Array.from(departmentById.values())
        .filter(d => departmentDraft && !excludedIds.has(d.id) && canUseDepartmentAsParentForHierarchy({
          candidate: d,
          hierarchyKind: departmentDraft.hierarchyKind,
          level: departmentDraft.level,
          operatingCommitteeCode,
        }))
        .map(d => ({ value: String(d.id), label: `${d.name}（${d.code}）` })),
    ];
  }, [departmentById, departmentDraft, operatingCommitteeCode, selectedDepartment]);
  const departmentInfoFields: FormSurfaceItemSpec[] = departmentDraft ? [
    {
      kind: "readonly",
      key: "hierarchyKind",
      label: "组织体系",
      value: departmentDraft.hierarchyKind === "G" ? "治理" : "管理",
    },
    {
      key: "code",
      label: "组织编码",
      spec: {
        valueType: "string",
        control: "text",
        mask: { kind: "editableSegment", ...departmentCodeEditableSegment(departmentDraft.level, departmentDraft.hierarchyKind, codeConfig) },
        state: !canEditDepartmentDraft ? "disabled" : "normal",
      },
      value: departmentDraft.code,
      onChange: (next) => onUpdateDepartmentDraft("code", String(next ?? "")),
    },
    {
      key: "name",
      label: "组织名称",
      spec: { valueType: "string", control: "text", state: !canEditDepartmentDraft ? "disabled" : "normal" },
      value: departmentDraft.name,
      onChange: next => onUpdateDepartmentDraft("name", String(next ?? "")),
    },
    {
      key: "parent",
      label: "上级组织",
      spec: {
        valueType: "reference",
        control: "choice",
        state: !canEditDepartmentDraft ? "disabled" : "normal",
        options: { source: "static", items: parentDepartmentOptions },
      },
      value: departmentDraft.parentId == null ? "" : String(departmentDraft.parentId),
      placeholder: "无",
      onChange: next => {
        if (!codeConfig) return;
        const nextParentId = next === "" ? null : Number(next);
        const parent = nextParentId == null ? undefined : departmentById.get(nextParentId);
        const nextLevel = parent && parent.hierarchyKind === departmentDraft.hierarchyKind
          ? Math.min(parent.level + 1, 3) as 1 | 2 | 3
          : 1;
        const departments = Array.from(departmentById.values());
        onUpdateDepartmentDraft("parentId", nextParentId);
        onUpdateDepartmentDraft("level", nextLevel);
        onUpdateDepartmentDraft("code", rebaseDepartmentCodeForParentChange({
          code: departmentDraft.code,
          departmentId: departmentDraft.id,
          hierarchyKind: departmentDraft.hierarchyKind,
          level: nextLevel,
          parentId: nextParentId,
          departments,
          codeConfig,
        }));
      },
    },
    {
      kind: "tagList",
      key: "alias",
      label: "别名",
      span: "wide",
      items: splitAliasText(departmentDraft.alias || ""),
      getKey: (tag, index) => `${tag}-${index}`,
      getLabel: (tag) => tag,
      onRemove: (_, index) => onUpdateDepartmentDraft("alias", splitAliasText(departmentDraft.alias || "").filter((__, tagIndex) => tagIndex !== index).join("、")),
      onUpdateLabel: (_, index, next) => onUpdateDepartmentDraft("alias", splitAliasText(departmentDraft.alias || "").map((tag, tagIndex) => tagIndex === index ? next : tag).join("、")),
      disabled: !canEditDepartmentDraft,
      removeConfirmMessage: (tag) => `确定删除别名「${tag}」吗？删除后需要保存或提交才会生效。`,
      shellClassName: "content-start",
      append: !canEditDepartmentDraft ? undefined : {
        textInput: {
          key: "departmentAliasAppend",
          placeholder: splitAliasText(departmentDraft.alias || "").length === 0 ? "添加别名" : "",
          onAppend: (values) => onUpdateDepartmentDraft("alias", [...splitAliasText(departmentDraft.alias || ""), ...values].join("、")),
          onRemoveLast: () => {
            const aliases = splitAliasText(departmentDraft.alias || "");
            if (aliases.length > 0) onUpdateDepartmentDraft("alias", aliases.slice(0, -1).join("、"));
          },
        },
      },
    },
    {
      key: "managerPosition",
      label: "负责人岗位",
      spec: {
        valueType: "reference",
        control: "reference",
        state: !canEditDepartmentDraft ? "disabled" : "normal",
        options: {
          source: "remote",
          fkKey: "hr.department.manager.position",
          endpoint: HR_REFERENCE_OPTIONS_ENDPOINT,
          returnField: "id",
          queryParams: { departmentId: departmentDraft.id },
        },
      },
      value: departmentDraft.managerPositionId == null ? "" : String(departmentDraft.managerPositionId),
      displayValue: departmentDraft.managerPositionName,
      placeholder: "搜索负责人岗位",
      onChange: (value, option) => {
        const next = option as ReferenceOption | undefined;
        onUpdateDepartmentDraft("managerPositionId", next?.id ?? (value ? departmentDraft.managerPositionId : null));
        onUpdateDepartmentDraft("managerPositionName", next?.name ?? (value ? String(value) : ""));
      },
    },
    {
      key: "managerEmployees",
      kind: "readonly",
      label: "组织负责人",
      span: "wide",
      value: departmentDraft.managerEmployeeNames.join("、") || "暂无在岗负责人",
    },
  ] : [];
  const departmentDescriptionsSection = useDepartmentDescriptionsSection({
    drafts: departmentDescriptionDrafts,
    dirty: departmentDescriptionDirty,
    canEditDepartment: canEditDepartmentDraft,
    onUpdateDraft: onUpdateDepartmentDescriptionDraft,
  });
  const mutationDisabled = isGovernanceOrganizationReadonly
    || (!departmentDirty && !(showDepartmentDescriptions && departmentDescriptionDirty))
    || saving;
  const departmentFormActions = [
    ...workflowActionSurfaceActions(actionRuntimeCommands(actionRuntime, {
      "record.save": { disabled: mutationDisabled, onClick: () => void onSaveDepartmentInfo() },
      "workflow.request.submit": { disabled: mutationDisabled, onClick: () => void onSaveDepartmentInfo() },
    })),
    ...(canArchive && selectedDepartment && !isGovernanceOrganizationReadonly
      ? [{
          key: showArchived ? "unarchive" : "archive",
          action: showArchived ? "unarchive" as const : "archive" as const,
          disabled: saving,
          onClick: () => void onArchiveDepartment(selectedDepartment.id, !showArchived),
        }]
      : []),
  ];
  const detailSections: BodySurfaceSectionSpec[] = [];
  if (!selection) {
    detailSections.push(createEmptySection("empty-selection", {
      presentation: "plain",

      content: "选择组织或岗位查看详情"
    }));
  }
  if (selectedDepartment) {
    if (!isOrganizationMode) {
      detailSections.push(createDirectPositionPanelSection({
        canCreatePosition: canEditPosition,
        createPanel,
        createPositionCode,
        createPositionDescriptionDetailsSurface,
        createPositionDescriptionDraft,
        createPositionDepartment,
        createPositionDraft,
        departmentId: selectedDepartment.id,
        departmentById,
        positionsByDepartment,
        saving,
        selection,
        setCreatePanel,
        setCreatePositionDescriptionDraft,
        setCreatePositionDraft,
        onSelect,
        onCreatePosition,
      }));
    }
    detailSections.push(createPanelSection("department-info", {
      sections: departmentDraft ? [
        {
          key: "fields",
          body: { kind: "form", form: {
            kind: "fields",
            header: { title: (
              <span className="flex min-w-0 items-center gap-2">
                <span>组织信息</span>
                {canEditDepartmentDraft && (departmentDirty || (showDepartmentDescriptions && departmentDescriptionDirty)) ? <span className="text-xs text-amber-600">有未保存修改</span> : null}
              </span>
            ) },
            actions: departmentFormActions,
            content: { items: departmentInfoFields, layout: { columns: 2 } },
          } },
        },
        createMetricsSection("metrics", {
            metrics: [
              { key: "directPositions", label: "直属岗位", value: selectedDepartmentStats?.directPositions ?? 0 },
              { key: "totalPositions", label: "总岗位", value: selectedDepartmentStats?.totalPositions ?? 0 },
              { key: "directHeadcount", label: "直属编制", value: selectedDepartmentStats?.directHeadcount ?? 0 },
              { key: "totalHeadcount", label: "总编制", value: selectedDepartmentStats?.totalHeadcount ?? 0 },
            ],
          }),
      ] : [],
    }));
    if (showDepartmentDescriptions) detailSections.push(departmentDescriptionsSection);
  }
  if (!isOrganizationMode) detailSections.push(...positionEditorSections);
  return createPanelSection("department-detail", {
      sections: detailSections,
    });
}

export function DepartmentDetailPane(props: DepartmentDetailPaneProps) {
  const section = useDepartmentDetailPaneSection(props);
  return <BodySurface {...createPageBody([section])} />;
}
