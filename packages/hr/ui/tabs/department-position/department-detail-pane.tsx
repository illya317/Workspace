"use client";

import { useMemo, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { Badge, CommandButton, EntityDetailLayout, FieldGrid, MetricTile, PanelCard } from "@workspace/core/ui";
import { DetailSectionHeader } from "./detail-editors";
import { DepartmentCodeInput } from "./department-code-input";
import { departmentDescendantIds } from "./utils";
import { DepartmentDescriptionsPanel } from "./department-descriptions-panel";
import { DirectPositionPanel } from "./navigation-panels";
import type { Department, DepartmentDescriptionDraft, DepartmentDraft, DepartmentPositionStats, CreatePositionDraft, Position, Selection } from "./types";
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
  return <PanelCard className="min-h-[520px]" bodyClassName="p-4">
      {!selection && <p className="py-12 text-center text-sm text-slate-400">选择部门或岗位查看详情</p>}
      {selectedDepartment && <div className="space-y-4">
          {!isOrganizationMode && <DirectPositionPanel canCreatePosition={canEditPosition} createPanel={createPanel} createPositionCode={createPositionCode} createPositionDepartment={createPositionDepartment} createPositionDraft={createPositionDraft} departmentId={selectedDepartment.id} departmentById={departmentById} positionsByDepartment={positionsByDepartment} saving={saving} selection={selection} setCreatePanel={setCreatePanel} setCreatePositionDraft={setCreatePositionDraft} onSelect={onSelect} onCreatePosition={onCreatePosition} />}
          <PanelCard bodyClassName="p-4">
            <DetailSectionHeader title="部门信息" meta={<Badge level={selectedDepartment.level} className="shrink-0 px-2 py-0.5 font-semibold" />} actions={<div className="flex items-center gap-2">
                  {canEditDepartment && (departmentDirty || departmentDescriptionDirty) && <span className="text-xs text-amber-600">有未保存修改</span>}
                  {canEditDepartment && <CommandButton variant="primary" disabled={!canEditDepartment || !departmentDirty && !departmentDescriptionDirty || saving} onClick={() => void saveDepartment()}>
                      {saving ? "保存中..." : "保存"}
                    </CommandButton>}
                  {canEdit && <CommandButton disabled={saving} onClick={() => void onArchiveDepartment(selectedDepartment.id, !showArchived)}>
                      {showArchived ? "恢复" : "归档"}
                    </CommandButton>}
                </div>} />
            {departmentDraft && <div className="mt-4 space-y-3">
                <EntityDetailLayout.Fields columns={2}>
                  <FieldGrid.Cell label="部门编码">
                    <DepartmentCodeInput value={departmentDraft.code} level={departmentDraft.level} disabled={!canEditDepartment} onChange={next => onUpdateDepartmentDraft("code", next)} />
                  </FieldGrid.Cell>
                  <EntityDetailLayout.Field
                    label="部门名称"
                    kind="text"
                    value={departmentDraft.name}
                    disabled={!canEditDepartment}
                    onChange={next => onUpdateDepartmentDraft("name", next)}
                  />
                  <EntityDetailLayout.Field
                    label="部门层级"
                    kind="readonly"
                    value={`L${departmentDraft.level}`}
                  />
                  <EntityDetailLayout.Field
                    label="上级部门"
                    kind="select"
                    value={departmentDraft.parentId == null ? "" : String(departmentDraft.parentId)}
                    options={parentDepartmentOptions}
                    searchable
                    disabled={!canEditDepartment}
                    placeholder="无"
                    onChange={next => {
                      const nextParentId = next === "" ? null : Number(next);
                      onUpdateDepartmentDraft("parentId", nextParentId);
                      const parentLevel = nextParentId == null ? 0 : (departmentById.get(nextParentId)?.level ?? 0);
                      onUpdateDepartmentDraft("level", Math.min(parentLevel + 1, 3) as 1 | 2 | 3);
                    }}
                  />
                  <EntityDetailLayout.Field
                    label="别名"
                    kind="tags"
                    value={departmentDraft.alias}
                    disabled={!canEditDepartment}
                    placeholder="添加别名"
                    confirmRemove
                    removeConfirmMessage={item => `确定删除别名「${item}」吗？删除后需要保存才会生效。`}
                    removeConfirmTitle="删除别名"
                    onChange={value => onUpdateDepartmentDraft("alias", value)}
                  />
                  <EntityDetailLayout.Field
                    label="部门负责人"
                    kind="readonly"
                    value={departmentDraft.managerPositionName || "未设置"}
                  />
                </EntityDetailLayout.Fields>
                <EntityDetailLayout.Metrics columns={4}>
                  <MetricTile label="直属岗位" value={selectedDepartmentStats?.directPositions ?? 0} />
                  <MetricTile label="总岗位" value={selectedDepartmentStats?.totalPositions ?? 0} />
                  <MetricTile label="直属编制" value={selectedDepartmentStats?.directHeadcount ?? 0} />
                  <MetricTile label="总编制" value={selectedDepartmentStats?.totalHeadcount ?? 0} />
                </EntityDetailLayout.Metrics>
              </div>}
          </PanelCard>
          {!isOrganizationMode && <DepartmentDescriptionsPanel drafts={departmentDescriptionDrafts} dirty={departmentDescriptionDirty} canEditDepartment={canEditDepartment} onUpdateDraft={onUpdateDepartmentDescriptionDraft} />}
        </div>}
      {!isOrganizationMode && positionEditor}
    </PanelCard>;
}
