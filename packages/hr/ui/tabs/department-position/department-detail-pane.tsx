"use client";

import { useMemo, type Dispatch, type SetStateAction } from "react";
import { createPageBody, createMetricsSection, createEmptySection, createPanelSection, PageSurface, type FormSurfaceItemSpec, type BodySurfaceSectionSpec, type FormSurfaceProps } from "@workspace/core/ui";
import { departmentCodeEditableSegment } from "./department-code-input";
import { departmentDescendantIds, splitAliasText } from "./utils";
import { useDepartmentDescriptionsBlock } from "./department-descriptions-panel";
import { buildDirectPositionPanelBlock } from "./navigation-panels";
import type { Department, DepartmentDescriptionDraft, DepartmentDraft, DepartmentPositionStats, CreatePositionDraft, DescriptionDraft, Position, Selection } from "./types";

function DepartmentLevelChip({ level }: { level: number }) {
  return <span className="inline-flex shrink-0 items-center rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">{`L${level}`}</span>;
}

type DepartmentDetailPaneProps = {
  selection: Selection;
  selectedDepartment: Department | undefined;
  selectedDepartmentStats: DepartmentPositionStats | null | undefined;
  departmentDraft: DepartmentDraft | null;
  departmentDescriptionDrafts: DepartmentDescriptionDraft[];
  positionsByDepartment: Map<number, Position[]>;
  isOrganizationMode: boolean;
  canEdit: boolean;
  canEditDepartment: boolean;
  canEditPosition: boolean;
  createPanel: "department" | "position" | null;
  createPositionCode: string;
  createPositionDescriptionDetailsSurface: FormSurfaceProps;
  createPositionDescriptionDraft: DescriptionDraft;
  createPositionDepartment: Department | undefined;
  createPositionDraft: CreatePositionDraft;
  departmentById: Map<number, Department>;
  departmentDirty: boolean;
  departmentDescriptionDirty: boolean;
  saving: boolean;
  showArchived: boolean;
  positionEditorBlocks: BodySurfaceSectionSpec[];
  setCreatePanel: (panel: "department" | "position" | null) => void;
  setCreatePositionDescriptionDraft: Dispatch<SetStateAction<DescriptionDraft>>;
  setCreatePositionDraft: Dispatch<SetStateAction<CreatePositionDraft>>;
  onSelect: (selection: Selection) => void;
  onCreatePosition: (descriptionDraft: DescriptionDraft) => void | Promise<void>;
  onUpdateDepartmentDraft: <K extends keyof DepartmentDraft>(key: K, value: DepartmentDraft[K]) => void;
  onUpdateDepartmentDescriptionDraft: <K extends keyof DepartmentDescriptionDraft>(index: number, key: K, value: DepartmentDescriptionDraft[K]) => void;
  onSaveDepartmentInfo: () => void | Promise<void>;
  onSaveDepartmentDescription: () => void | Promise<void>;
  onArchiveDepartment: (departmentId: number, archived: boolean) => void | Promise<void>;
};

export function useDepartmentDetailPaneBlock({
  selection,
  selectedDepartment,
  selectedDepartmentStats,
  departmentDraft,
  departmentDescriptionDrafts,
  positionsByDepartment,
  isOrganizationMode,
  canEdit,
  canEditDepartment,
  canEditPosition,
  createPanel,
  createPositionCode,
  createPositionDescriptionDetailsSurface,
  createPositionDescriptionDraft,
  createPositionDepartment,
  createPositionDraft,
  departmentById,
  departmentDirty,
  departmentDescriptionDirty,
  saving,
  showArchived,
  positionEditorBlocks,
  setCreatePanel,
  setCreatePositionDescriptionDraft,
  setCreatePositionDraft,
  onSelect,
  onCreatePosition,
  onUpdateDepartmentDraft,
  onUpdateDepartmentDescriptionDraft,
  onSaveDepartmentInfo,
  onSaveDepartmentDescription,
  onArchiveDepartment
}: DepartmentDetailPaneProps): BodySurfaceSectionSpec {
  async function saveDepartment() {
    if (departmentDirty) await onSaveDepartmentInfo();
    if (departmentDescriptionDirty) await onSaveDepartmentDescription();
  }
  const parentDepartmentOptions = useMemo(() => {
    if (!selectedDepartment) return [];
    const excludedIds = departmentDescendantIds(selectedDepartment, departmentById);
    excludedIds.add(selectedDepartment.id);
    return Array.from(departmentById.values())
      .filter(d => !excludedIds.has(d.id) && d.level < 3)
      .map(d => ({ value: String(d.id), label: `${d.name}（L${d.level}）` }));
  }, [departmentById, selectedDepartment]);
  const departmentInfoFields: FormSurfaceItemSpec<string>[] = departmentDraft ? [
    {
      key: "code",
      label: "部门编码",
      spec: {
        valueType: "string",
        control: "text",
        mask: { kind: "editableSegment", ...departmentCodeEditableSegment(departmentDraft.level) },
        state: !canEditDepartment ? "disabled" : "normal",
      },
      value: departmentDraft.code,
      onChange: (next) => onUpdateDepartmentDraft("code", String(next ?? "")),
    },
    {
      key: "name",
      label: "部门名称",
      spec: { valueType: "string", control: "text", state: !canEditDepartment ? "disabled" : "normal" },
      value: departmentDraft.name,
      onChange: next => onUpdateDepartmentDraft("name", String(next ?? "")),
    },
    { kind: "readonly", key: "level", label: "部门层级", value: `L${departmentDraft.level}` },
    {
      key: "parent",
      label: "上级部门",
      spec: {
        valueType: "reference",
        control: "choice",
        state: !canEditDepartment ? "disabled" : "normal",
        options: { source: "static", mode: "dropdown", items: parentDepartmentOptions },
      },
      value: departmentDraft.parentId == null ? "" : String(departmentDraft.parentId),
      placeholder: "无",
      onChange: next => {
        const nextParentId = next === "" ? null : Number(next);
        onUpdateDepartmentDraft("parentId", nextParentId);
        const parentLevel = nextParentId == null ? 0 : (departmentById.get(nextParentId)?.level ?? 0);
        onUpdateDepartmentDraft("level", Math.min(parentLevel + 1, 3) as 1 | 2 | 3);
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
      disabled: !canEditDepartment,
      confirmMessage: (tag) => `确定删除别名「${tag}」吗？删除后需要保存才会生效。`,
      emptyText: !canEditDepartment ? "未设置" : undefined,
      shellClassName: "content-start",
      append: !canEditDepartment ? undefined : {
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
    { kind: "readonly", key: "manager", label: "部门负责人", value: departmentDraft.managerPositionName || "未设置" },
  ] : [];
  const departmentDescriptionsBlock = useDepartmentDescriptionsBlock({
    drafts: departmentDescriptionDrafts,
    dirty: departmentDescriptionDirty,
    canEditDepartment,
    onUpdateDraft: onUpdateDepartmentDescriptionDraft,
  });
  const detailBlocks: BodySurfaceSectionSpec[] = [];
  if (!selection) {
    detailBlocks.push(createEmptySection("empty-selection", {
      presentation: "plain",

      content: "选择部门或岗位查看详情"
    }));
  }
  if (selectedDepartment) {
    if (!isOrganizationMode) {
      detailBlocks.push(buildDirectPositionPanelBlock({
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
    detailBlocks.push(createPanelSection("department-info", {
      title: (
        <span className="flex min-w-0 items-center gap-2">
          <span>部门信息</span>
          <DepartmentLevelChip level={selectedDepartment.level} />
          {canEditDepartment && (departmentDirty || departmentDescriptionDirty) ? <span className="text-xs text-amber-600">有未保存修改</span> : null}
        </span>
      ),
      actions: [
        ...(canEditDepartment
          ? [{
              key: "save",
              label: saving ? "保存中..." : "保存",
              icon: "save" as const,
              variant: "primary" as const,
              disabled: !canEditDepartment || (!departmentDirty && !departmentDescriptionDirty) || saving,
              onClick: () => void saveDepartment(),
            }]
          : []),
        ...(canEdit
          ? [{
              key: "archive",
              label: showArchived ? "恢复" : "归档",
              icon: showArchived ? "restore" as const : "archive" as const,
              disabled: saving,
              onClick: () => void onArchiveDepartment(selectedDepartment.id, !showArchived),
            }]
          : []),
      ],

      sections: departmentDraft ? [
        {
          key: "fields",
          body: { kind: "form", form: {
            kind: "fields",
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
    if (!isOrganizationMode) detailBlocks.push(departmentDescriptionsBlock);
  }
  if (!isOrganizationMode) detailBlocks.push(...positionEditorBlocks);
  return createPanelSection("department-detail", {


      sections: detailBlocks,
    });
}

export function DepartmentDetailPane(props: DepartmentDetailPaneProps) {
  const block = useDepartmentDetailPaneBlock(props);
  return <PageSurface kind="standard" embedded body={createPageBody([block])} />;
}
