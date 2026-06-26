"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { putJson } from "@workspace/platform/ui/api-client";
import { Badge, CommandButton, DataTable, type DataTableColumn, EmptyStateCard, FkFieldInput, type FkFieldOption, PanelCard, SelectionGrid, Toast, WorkspaceSplitPage } from "@workspace/core/ui";
import { HR_REFERENCE_OPTIONS_ENDPOINT } from "../../fk-keys";
import { selectedEntityName } from "./detail-editor-primitives";
import { createDepartmentDescriptionDraft, departmentDescriptionPayload, departmentManagerPositionName, sanitizeDepartmentDescriptionDetails } from "./draft-utils";
import type { Department, Position } from "./types";

type PositionRelationRow = {
  position: Position;
  subordinates: Position[];
  label: string;
};
function normalizeName(value: unknown) {
  return String(value || "").trim();
}
function reportValue(position: Position, draftReports: Record<number, string>) {
  return Object.prototype.hasOwnProperty.call(draftReports, position.id) ? normalizeName(draftReports[position.id]) : normalizeName(position.reportTo);
}
function directSubordinates(position: Position, positions: Position[], draftReports: Record<number, string>) {
  const seen = new Set<string>();
  return positions.filter(candidate => {
    if (candidate.id === position.id || reportValue(candidate, draftReports) !== position.name || seen.has(candidate.name)) return false;
    seen.add(candidate.name);
    return true;
  });
}
function createsCycle(position: Position, nextReportTo: string, positionsByName: Map<string, Position>, draftReports: Record<number, string>) {
  let parent = positionsByName.get(nextReportTo);
  const visited = new Set<number>();
  while (parent) {
    if (parent.id === position.id) return true;
    if (visited.has(parent.id)) return false;
    visited.add(parent.id);
    const parentReportTo = reportValue(parent, draftReports);
    parent = parentReportTo ? positionsByName.get(parentReportTo) : undefined;
  }
  return false;
}
function relationLabel(position: Position, selectedDepartment: Department, positionsByName: Map<string, Position>, draftReports: Record<number, string>) {
  const reportTo = reportValue(position, draftReports);
  const parent = reportTo ? positionsByName.get(reportTo) : undefined;
  if (!reportTo) return "顶层岗位";
  if (!parent) return "待匹配";
  if (parent.id === position.id || createsCycle(position, reportTo, positionsByName, draftReports)) return "循环关系";
  if (parent.departmentId !== selectedDepartment.id) return "跨部门上级";
  return "本部门";
}
export function OrganizationModePanel({
  drawerOpen,
  error,
  loading,
  selectedDepartment,
  selectedPositionId,
  positions,
  positionsByDepartment,
  renderSide,
  sideOpen,
  canEdit,
  onDrawerOpenChange,
  onOpenDepartmentDetails,
  onOpenPositionDetails,
  onSelectPosition,
  onSideOpenChange,
  onUnsavedChange,
  onReload
}: {
  drawerOpen: boolean;
  error: string | null;
  loading: boolean;
  selectedDepartment: Department | undefined;
  selectedPositionId: number | null;
  positions: Position[];
  positionsByDepartment: Map<number, Position[]>;
  renderSide: (mode: "desktop" | "drawer") => ReactNode;
  sideOpen: boolean;
  canEdit: boolean;
  onDrawerOpenChange: (open: boolean) => void;
  onOpenDepartmentDetails?: (departmentId: number) => void;
  onOpenPositionDetails?: (positionId: number) => void;
  onSelectPosition: (position: Position) => void;
  onSideOpenChange: (open: boolean) => void;
  onUnsavedChange?: (dirty: boolean) => void;
  onReload: () => Promise<void>;
}) {
  const [managerDraft, setManagerDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);
  const directPositions = selectedDepartment ? positionsByDepartment.get(selectedDepartment.id) || [] : [];
  const positionsByName = useMemo(() => new Map(positions.map(position => [position.name, position])), [positions]);
  const currentManagerName = selectedDepartment ? departmentManagerPositionName(selectedDepartment) : "";
  useEffect(() => {
    setManagerDraft(currentManagerName);
  }, [currentManagerName, selectedDepartment?.id]);
  const managerDirty = selectedDepartment ? normalizeName(managerDraft) !== normalizeName(currentManagerName) : false;
  useEffect(() => {
    onUnsavedChange?.(managerDirty);
  }, [managerDirty, onUnsavedChange]);
  const relations = directPositions.map(position => ({
    position,
    subordinates: directSubordinates(position, positions, {}),
    label: selectedDepartment ? relationLabel(position, selectedDepartment, positionsByName, {}) : ""
  }));
  const columns: DataTableColumn<PositionRelationRow>[] = [{
    key: "position",
    label: "岗位",
    required: true,
    className: "w-1/3",
    cellClassName: "whitespace-normal align-middle",
    render: ({
      position,
      label
    }) => <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <CommandButton
              title={`打开 ${position.name} 的部门岗位说明`}
              onClick={() => onOpenPositionDetails?.(position.id)}
              size="sm"
              truncate
              className="min-w-0 !h-auto !justify-start !border-0 !bg-transparent !p-0 !text-left !text-sm !font-semibold !leading-5 !text-slate-900 !shadow-none hover:!bg-transparent hover:!text-sky-700 hover:!underline"
            >
              {position.name}
            </CommandButton>
            <Badge
              label={label}
              tone={label === "循环关系" || label === "待匹配" ? "red" : label === "跨部门上级" ? "amber" : label === "顶层岗位" ? "emerald" : "slate"}
            />
          </div>
          <div className="mt-0.5 truncate font-mono text-xs text-slate-400" title={position.code}>{position.code}</div>
        </div>
  }, {
    key: "subordinates",
    label: "下属岗位",
    required: true,
    className: "w-2/3",
    cellClassName: "whitespace-normal align-top",
    render: ({
      subordinates
    }) => subordinates.length > 0 ? (
      <SelectionGrid
        mode="action"
        layout="fixed"
        columns={2}
        ariaLabel="下属岗位"
        options={subordinates.map((position) => ({
          value: String(position.id),
          label: position.name,
        }))}
        onItemClick={(option) => {
          const position = subordinates.find((p) => String(p.id) === option.value);
          if (position) onSelectPosition(position);
        }}
      />
    ) : <span className="text-xs text-slate-400">-</span>
  }];
  async function saveChanges() {
    if (!selectedDepartment || !managerDirty) return;
    setSaving(true);
    try {
      const descriptionDraft = createDepartmentDescriptionDraft(selectedDepartment, selectedDepartment.descriptions[0]);
      await putJson("/api/modules/hr/roster/departments", {
        id: selectedDepartment.id,
        descriptions: [departmentDescriptionPayload({
          ...descriptionDraft,
          details: sanitizeDepartmentDescriptionDetails(descriptionDraft.details, selectedDepartment.name, managerDraft)
        })]
      }, "保存部门负责人失败");
      await onReload();
      setToast({
        type: "success",
        message: "部门负责人已保存"
      });
    } catch (error) {
      setToast({
        type: "error",
        message: error instanceof Error ? error.message : "保存部门负责人失败"
      });
    } finally {
      setSaving(false);
    }
  }
  return <>
      <WorkspaceSplitPage sideOpen={sideOpen} sideLabel="全部部门层级" onSideOpenChange={onSideOpenChange} drawerOpen={drawerOpen} onDrawerOpenChange={onDrawerOpenChange} contentClassName="!max-w-none !px-0 !py-0" renderSide={renderSide}>
        <PanelCard className="min-h-[520px]" bodyClassName="p-4">
          {loading && <EmptyStateCard compact>加载中...</EmptyStateCard>}
          {error && <EmptyStateCard compact className="border-red-100 bg-red-50 text-red-600">{error}</EmptyStateCard>}
          {!loading && !error && !selectedDepartment && <EmptyStateCard>请选择左侧部门查看岗位汇报关系</EmptyStateCard>}
          {!loading && !error && selectedDepartment && <div className="space-y-4">
              <div className="flex min-w-0 flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-4">
                <div className="min-w-0">
                  <div className="flex min-w-0 items-baseline gap-3">
                    <CommandButton
                      title={`打开 ${selectedDepartment.name} 的部门说明书`}
                      onClick={() => onOpenDepartmentDetails?.(selectedDepartment.id)}
                      size="sm"
                      className="!h-auto !justify-start !border-0 !bg-transparent !p-0 !text-left !text-lg !font-semibold !leading-7 !text-slate-900 !shadow-none hover:!bg-transparent hover:!text-sky-700 hover:!underline"
                    >
                      <span className="truncate">{selectedDepartment.name}</span>
                    </CommandButton>
                    <span className="shrink-0 font-mono text-sm text-slate-400">{selectedDepartment.code}</span>
                  </div>
                </div>
                <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
                  <div className="flex min-w-0 w-72 items-center gap-2">
                    <span className="shrink-0 text-xs font-semibold text-slate-500">负责人</span>
                    <FkFieldInput fkKey="hr.position" endpoint={HR_REFERENCE_OPTIONS_ENDPOINT} value={managerDraft} displayValue={managerDraft} disabled={!canEdit || saving} placeholder="搜索负责人岗位" onChange={(_label, option?: FkFieldOption) => {
                  setManagerDraft(selectedEntityName("position", option));
                }} />
                  </div>
                  <CommandButton variant="primary" disabled={!canEdit || saving || !managerDirty} onClick={() => void saveChanges()}>
                    {saving ? "保存中..." : "保存修改"}
                  </CommandButton>
                </div>
              </div>

              {directPositions.length === 0 ? <EmptyStateCard>当前部门暂无直属岗位</EmptyStateCard> : <div className="rounded-md border border-slate-200 bg-white">
                  <DataTable rows={relations} columns={columns} visibleColumns={columns.map(column => column.key)} rowKey={row => row.position.id} density="compact" rowClassName={row => row.position.id === selectedPositionId ? "bg-sky-50 ring-1 ring-inset ring-sky-200" : ""} />
                </div>}
            </div>}
        </PanelCard>
      </WorkspaceSplitPage>
      <Toast message={toast?.message || ""} type={toast?.type} show={!!toast} onClose={() => setToast(null)} />
    </>;
}
