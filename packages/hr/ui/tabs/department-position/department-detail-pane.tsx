"use client";

import type { Dispatch, ReactNode, SetStateAction } from "react";
import { ActionButton, Badge, FormField, MetricCard, PanelCard, TextField } from "@workspace/core/ui";
import PositionAliasTagsInput from "./PositionAliasTagsInput";
import { DetailSectionHeader, formInputClassName, readOnlyInputClassName } from "./detail-editors";
import { DepartmentDescriptionsPanel } from "./department-descriptions-panel";
import { DirectPositionPanel } from "./navigation-panels";
import type { Department, DepartmentDescriptionDraft, DepartmentDraft, DepartmentPositionStats, CreatePositionDraft, Position, Selection } from "./types";

export function DepartmentDetailPane({
  selection,
  selectedDepartment,
  selectedDepartmentParentPath,
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
  onArchiveDepartment,
}: {
  selection: Selection;
  selectedDepartment: Department | undefined;
  selectedDepartmentParentPath: string;
  selectedDepartmentStats: DepartmentPositionStats | null | undefined;
  departmentDraft: DepartmentDraft | null;
  departmentDescriptionDrafts: DepartmentDescriptionDraft[];
  positionsByDepartment: Map<number, Position[]>;
  isOrganizationMode: boolean;
  canEdit: boolean;
  canEditDepartment: boolean;
  canEditPosition: boolean;
  createPanel: "position" | null;
  createPositionCode: string;
  createPositionDepartment: Department | undefined;
  createPositionDraft: CreatePositionDraft;
  departmentById: Map<number, Department>;
  departmentDirty: boolean;
  departmentDescriptionDirty: boolean;
  saving: boolean;
  showArchived: boolean;
  positionEditor: ReactNode;
  setCreatePanel: (panel: "position" | null) => void;
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

  return (
    <PanelCard className="min-h-[520px]" bodyClassName="p-4">
      {!selection && <p className="py-12 text-center text-sm text-slate-400">选择部门或岗位查看详情</p>}
      {selectedDepartment && (
        <div className="space-y-4">
          {!isOrganizationMode && (
            <DirectPositionPanel
              canCreatePosition={canEditPosition}
              createPanel={createPanel}
              createPositionCode={createPositionCode}
              createPositionDepartment={createPositionDepartment}
              createPositionDraft={createPositionDraft}
              departmentId={selectedDepartment.id}
              departmentById={departmentById}
              positionsByDepartment={positionsByDepartment}
              saving={saving}
              selection={selection}
              setCreatePanel={setCreatePanel}
              setCreatePositionDraft={setCreatePositionDraft}
              onSelect={onSelect}
              onCreatePosition={onCreatePosition}
            />
          )}
          <PanelCard bodyClassName="p-4">
            <DetailSectionHeader
              title="部门信息"
              meta={<Badge level={selectedDepartment.level} className="shrink-0 px-2 py-0.5 font-semibold" />}
              actions={
                <div className="flex items-center gap-2">
                  {canEditDepartment && (departmentDirty || departmentDescriptionDirty) && (
                    <span className="text-xs text-amber-600">有未保存修改</span>
                  )}
                  {canEditDepartment && (
                    <ActionButton
                      disabled={!canEditDepartment || (!departmentDirty && !departmentDescriptionDirty) || saving}
                      onClick={() => void saveDepartment()}
                      variant="primary"
                    >
                      {saving ? "保存中..." : "保存"}
                    </ActionButton>
                  )}
                  {canEdit && (
                    <ActionButton
                      disabled={saving}
                      onClick={() => void onArchiveDepartment(selectedDepartment.id, !showArchived)}
                    >
                      {showArchived ? "恢复" : "归档"}
                    </ActionButton>
                  )}
                </div>
              }
            />
            {departmentDraft && (
              <div className="mt-4 space-y-3">
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  <FormField label="部门编码">
                    <TextField value={selectedDepartment.code} disabled className={readOnlyInputClassName} />
                  </FormField>
                  <FormField label="部门名称">
                    <TextField
                      value={departmentDraft.name}
                      disabled={!canEditDepartment}
                      onChange={(next) => onUpdateDepartmentDraft("name", next)}
                      className={formInputClassName}
                    />
                  </FormField>
                  <FormField label="上级路径">
                    <TextField
                      value={selectedDepartmentParentPath || "无"}
                      disabled
                      className={readOnlyInputClassName}
                    />
                  </FormField>
                  <FormField label="别名">
                    <PositionAliasTagsInput
                      value={departmentDraft.alias}
                      disabled={!canEditDepartment}
                      onChange={(value) => onUpdateDepartmentDraft("alias", value)}
                    />
                  </FormField>
                  <FormField label="部门负责人">
                    <TextField value={departmentDraft.managerPositionName || "未设置"} disabled className={readOnlyInputClassName} />
                  </FormField>
                  <div className="block min-w-0">
                    <span className="mb-0.5 block text-xs font-semibold text-slate-500">状态</span>
                    <PanelCard bodyClassName="flex h-10 items-center justify-between gap-2 px-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${showArchived ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>
                        {showArchived ? "已归档" : "现用"}
                      </span>
                    </PanelCard>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                  {[
                    { label: "直属岗位", value: selectedDepartmentStats?.directPositions ?? 0 },
                    { label: "总岗位", value: selectedDepartmentStats?.totalPositions ?? 0 },
                    { label: "直属编制", value: selectedDepartmentStats?.directHeadcount ?? 0 },
                    { label: "总编制", value: selectedDepartmentStats?.totalHeadcount ?? 0 },
                  ].map((item) => (
                    <MetricCard key={item.label} label={item.label} value={item.value} className="px-3 py-2" />
                  ))}
                </div>
              </div>
            )}
          </PanelCard>
          {!isOrganizationMode && (
            <DepartmentDescriptionsPanel
              drafts={departmentDescriptionDrafts}
              dirty={departmentDescriptionDirty}
              canEditDepartment={canEditDepartment}
              onUpdateDraft={onUpdateDepartmentDescriptionDraft}
            />
          )}
        </div>
      )}
      {!isOrganizationMode && positionEditor}
    </PanelCard>
  );
}
