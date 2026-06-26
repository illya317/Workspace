"use client";

import { useMemo, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { DataSurface, FormSurface, PageSurface } from "@workspace/core/ui";
import { DetailSectionHeader } from "./detail-editors";
import { DepartmentCodeInput } from "./department-code-input";
import { departmentDescendantIds } from "./utils";
import { DepartmentDescriptionsPanel } from "./department-descriptions-panel";
import { DirectPositionPanel } from "./navigation-panels";
import PositionAliasTagsInput from "./PositionAliasTagsInput";
import type { Department, DepartmentDescriptionDraft, DepartmentDraft, DepartmentPositionStats, CreatePositionDraft, Position, Selection } from "./types";

function DepartmentLevelChip({ level }: { level: number }) {
  return <span className="inline-flex shrink-0 items-center rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">{`L${level}`}</span>;
}

export function DepartmentDetailPane({
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
  createPositionDepartment,
  createPositionDraft,
  departmentById,
  departmentDirty,
  departmentDescriptionDirty,
  saving,
  showArchived,
  positionEditor,
  setCreatePanel,
  setCreatePositionDraft,
  onSelect,
  onCreatePosition,
  onUpdateDepartmentDraft,
  onUpdateDepartmentDescriptionDraft,
  onSaveDepartmentInfo,
  onSaveDepartmentDescription,
  onArchiveDepartment
}: {
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
  createPositionDepartment: Department | undefined;
  createPositionDraft: CreatePositionDraft;
  departmentById: Map<number, Department>;
  departmentDirty: boolean;
  departmentDescriptionDirty: boolean;
  saving: boolean;
  showArchived: boolean;
  positionEditor: ReactNode;
  setCreatePanel: (panel: "department" | "position" | null) => void;
  setCreatePositionDraft: Dispatch<SetStateAction<CreatePositionDraft>>;
  onSelect: (selection: Selection) => void;
  onCreatePosition: () => void | Promise<void>;
  onUpdateDepartmentDraft: <K extends keyof DepartmentDraft>(key: K, value: DepartmentDraft[K]) => void;
  onUpdateDepartmentDescriptionDraft: <K extends keyof DepartmentDescriptionDraft>(index: number, key: K, value: DepartmentDescriptionDraft[K]) => void;
  onSaveDepartmentInfo: () => void | Promise<void>;
  onSaveDepartmentDescription: () => void | Promise<void>;
  onArchiveDepartment: (departmentId: number, archived: boolean) => void | Promise<void>;
}) {
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
  return <PageSurface
    embedded
    kind="detail"
    blocks={[{
      kind: "panel",
      key: "department-detail",
      className: "min-h-[520px]",
      bodyClassName: "p-4",
      blocks: [{
        kind: "moduleView",
        key: "content",
        view: <>
      {!selection && <p className="py-12 text-center text-sm text-slate-400">选择部门或岗位查看详情</p>}
      {selectedDepartment && <div className="space-y-4">
          {!isOrganizationMode && <DirectPositionPanel canCreatePosition={canEditPosition} createPanel={createPanel} createPositionCode={createPositionCode} createPositionDepartment={createPositionDepartment} createPositionDraft={createPositionDraft} departmentId={selectedDepartment.id} departmentById={departmentById} positionsByDepartment={positionsByDepartment} saving={saving} selection={selection} setCreatePanel={setCreatePanel} setCreatePositionDraft={setCreatePositionDraft} onSelect={onSelect} onCreatePosition={onCreatePosition} />}
          <PageSurface
            embedded
            kind="detail"
            blocks={[{
              kind: "panel",
              key: "department-info",
              bodyClassName: "p-4",
              blocks: [{
                kind: "moduleView",
                key: "content",
                view: <>
            <DetailSectionHeader title="部门信息" meta={<DepartmentLevelChip level={selectedDepartment.level} />} actions={<div className="flex items-center gap-2">
                  {canEditDepartment && (departmentDirty || departmentDescriptionDirty) && <span className="text-xs text-amber-600">有未保存修改</span>}
                  <FormSurface
                    kind="inline"
                    actions={[
                      ...(canEditDepartment
                        ? [{
                            key: "save",
                            label: saving ? "保存中..." : "保存",
                            variant: "primary" as const,
                            disabled: !canEditDepartment || (!departmentDirty && !departmentDescriptionDirty) || saving,
                            onClick: () => void saveDepartment(),
                          }]
                        : []),
                      ...(canEdit
                        ? [{
                            key: "archive",
                            label: showArchived ? "恢复" : "归档",
                            disabled: saving,
                            onClick: () => void onArchiveDepartment(selectedDepartment.id, !showArchived),
                          }]
                        : []),
                    ]}
                  />
                </div>} />
            {departmentDraft && <div className="mt-4 space-y-3">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div>
                    <div className="mb-1 text-xs font-medium text-slate-500">部门编码</div>
                    <DepartmentCodeInput value={departmentDraft.code} level={departmentDraft.level} disabled={!canEditDepartment} onChange={next => onUpdateDepartmentDraft("code", next)} />
                  </div>
                  <FormSurface
                    kind="fields"
                    columns={2}
                    className="contents"
                    bodyClassName="contents"
                    fields={[
                      {
                        key: "name",
                        label: "部门名称",
                        spec: { valueType: "string", editor: "input", state: !canEditDepartment ? "disabled" : "normal" },
                        value: departmentDraft.name,
                        onChange: next => onUpdateDepartmentDraft("name", String(next ?? "")),
                      },
                      { kind: "readonly", key: "level", label: "部门层级", value: `L${departmentDraft.level}` },
                      {
                        key: "parent",
                        label: "上级部门",
                        spec: {
                          valueType: "reference",
                          editor: "select",
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
                    ]}
                  />
                  <div className="md:col-span-2">
                    <div className="mb-1 text-xs font-medium text-slate-500">别名</div>
                    <PositionAliasTagsInput
                      value={departmentDraft.alias || ""}
                      disabled={!canEditDepartment}
                      onChange={value => onUpdateDepartmentDraft("alias", value)}
                    />
                  </div>
                  <FormSurface kind="fields" fields={[{ kind: "readonly", key: "manager", label: "部门负责人", value: departmentDraft.managerPositionName || "未设置" }]} />
                </div>
                <DataSurface
                  kind="metrics"
                  framed
                  metrics={[
                    { key: "directPositions", label: "直属岗位", value: selectedDepartmentStats?.directPositions ?? 0 },
                    { key: "totalPositions", label: "总岗位", value: selectedDepartmentStats?.totalPositions ?? 0 },
                    { key: "directHeadcount", label: "直属编制", value: selectedDepartmentStats?.directHeadcount ?? 0 },
                    { key: "totalHeadcount", label: "总编制", value: selectedDepartmentStats?.totalHeadcount ?? 0 },
                  ]}
                />
              </div>}
                </>,
              }],
            }]}
          />
          {!isOrganizationMode && <DepartmentDescriptionsPanel drafts={departmentDescriptionDrafts} dirty={departmentDescriptionDirty} canEditDepartment={canEditDepartment} onUpdateDraft={onUpdateDepartmentDescriptionDraft} />}
        </div>}
      {!isOrganizationMode && positionEditor}
        </>,
      }],
    }]}
  />;
}
