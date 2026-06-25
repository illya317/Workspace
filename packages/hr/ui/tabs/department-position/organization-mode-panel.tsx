"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { putJson } from "@workspace/platform/ui/api-client";
import {
  ActionButton,
  DataTable,
  type DataTableColumn,
  EmptyStateCard,
  FkFieldInput,
  type FkFieldOption,
  PanelCard,
  TagPillButton,
  Toast,
  WorkspaceSplitPage,
} from "@workspace/core/ui";
import { HR_REFERENCE_OPTIONS_ENDPOINT } from "../../fk-keys";
import { selectedEntityName } from "./detail-editor-primitives";
import {
  createDepartmentDescriptionDraft,
  departmentDescriptionPayload,
  departmentManagerPositionName,
  sanitizeDepartmentDescriptionDetails,
} from "./draft-utils";
import type { Department, Position } from "./types";

type PositionRelationRow = {
  position: Position;
  reportTo: string;
  subordinates: Position[];
  label: string;
};

function normalizeName(value: unknown) {
  return String(value || "").trim();
}

function positionDetailsText(position: Position) {
  return position.positionDescriptionDetails ? JSON.stringify(position.positionDescriptionDetails) : null;
}

function reportValue(position: Position, draftReports: Record<number, string>) {
  return Object.prototype.hasOwnProperty.call(draftReports, position.id)
    ? normalizeName(draftReports[position.id])
    : normalizeName(position.reportTo);
}

function directSubordinates(position: Position, positions: Position[], draftReports: Record<number, string>) {
  const seen = new Set<string>();
  return positions.filter((candidate) => {
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
  canEdit,
  onDrawerOpenChange,
  onOpenPositionDetails,
  onSelectPosition,
  onUnsavedChange,
  onReload,
}: {
  drawerOpen: boolean;
  error: string | null;
  loading: boolean;
  selectedDepartment: Department | undefined;
  selectedPositionId: number | null;
  positions: Position[];
  positionsByDepartment: Map<number, Position[]>;
  renderSide: (mode: "desktop" | "drawer") => ReactNode;
  canEdit: boolean;
  onDrawerOpenChange: (open: boolean) => void;
  onOpenPositionDetails?: (positionId: number) => void;
  onSelectPosition: (position: Position) => void;
  onUnsavedChange?: (dirty: boolean) => void;
  onReload: () => Promise<void>;
}) {
  const [draftReports, setDraftReports] = useState<Record<number, string>>({});
  const [managerDraft, setManagerDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const directPositions = selectedDepartment ? positionsByDepartment.get(selectedDepartment.id) || [] : [];
  const positionsByName = useMemo(() => new Map(positions.map((position) => [position.name, position])), [positions]);
  const currentManagerName = selectedDepartment ? departmentManagerPositionName(selectedDepartment) : "";

  useEffect(() => {
    setDraftReports({});
    setManagerDraft(currentManagerName);
  }, [currentManagerName, selectedDepartment?.id]);

  const dirtyPositions = directPositions.filter((position) => reportValue(position, draftReports) !== normalizeName(position.reportTo));
  const managerDirty = selectedDepartment ? normalizeName(managerDraft) !== normalizeName(currentManagerName) : false;
  const dirtyChangeCount = dirtyPositions.length + (managerDirty ? 1 : 0);
  useEffect(() => {
    onUnsavedChange?.(dirtyChangeCount > 0);
  }, [dirtyChangeCount, onUnsavedChange]);
  const relations = directPositions.map((position) => ({
    position,
    reportTo: reportValue(position, draftReports),
    subordinates: directSubordinates(position, positions, draftReports),
    label: selectedDepartment ? relationLabel(position, selectedDepartment, positionsByName, draftReports) : "",
  }));
  const columns: DataTableColumn<PositionRelationRow>[] = [
    {
      key: "position",
      label: "岗位",
      required: true,
      cellClassName: "whitespace-normal align-middle",
      render: ({ position }) => (
        <div className="min-w-0">
          <ActionButton
            title={`打开 ${position.name} 的部门岗位说明`}
            onClick={() => onOpenPositionDetails?.(position.id)}
            className="!h-auto !justify-start !border-0 !bg-transparent !p-0 !text-left !text-sm !font-semibold !leading-5 !text-slate-900 !shadow-none hover:!bg-transparent hover:!text-sky-700 hover:!underline"
          >
            <span className="whitespace-normal break-words">{position.name}</span>
          </ActionButton>
          <div className="mt-0.5 font-mono text-xs text-slate-400">{position.code}</div>
        </div>
      ),
    },
    {
      key: "reportTo",
      label: "汇报给 / 上级岗位",
      required: true,
      headerClassName: "w-64 min-w-64",
      cellClassName: "w-64 min-w-64 align-middle",
      render: ({ position, reportTo }) => (
        <div className="flex min-w-0 items-center gap-2">
          <FkFieldInput
            fkKey="hr.position"
            endpoint={HR_REFERENCE_OPTIONS_ENDPOINT}
            value={reportTo}
            displayValue={reportTo}
            disabled={!canEdit || saving}
            placeholder="搜索上级岗位"
            onChange={(_label, option) => {
              const next = selectedEntityName("position", option);
              if (next === position.name) {
                setToast({ type: "error", message: "不能选择岗位自身作为上级" });
                return;
              }
              setDraftReports((prev) => ({ ...prev, [position.id]: next }));
            }}
          />
        </div>
      ),
    },
    {
      key: "subordinates",
      label: "下属岗位",
      required: true,
      headerClassName: "w-44 min-w-44",
      cellClassName: "w-44 min-w-44 whitespace-normal align-top",
      render: ({ subordinates }) => (
        <div className="flex min-w-0 flex-col items-start gap-1.5">
          {subordinates.length > 0 ? subordinates.map((item) => (
            <TagPillButton
              key={item.id}
              title={`跳转到 ${item.name}`}
              onClick={() => onSelectPosition(item)}
              className="border-slate-300 bg-white"
            >
              {item.name}
            </TagPillButton>
          )) : <span className="text-xs text-slate-400">-</span>}
        </div>
      ),
    },
    {
      key: "note",
      label: "说明",
      required: true,
      cellClassName: "align-middle",
      render: ({ label }) => (
        <span className={`inline-block rounded px-2 py-1 text-center text-xs font-medium ${
          label === "循环关系" || label === "待匹配"
            ? "bg-red-50 text-red-600"
            : label === "跨部门上级"
              ? "bg-amber-50 text-amber-700"
              : "bg-slate-100 text-slate-600"
        }`}>
          {label}
        </span>
      ),
    },
  ];

  async function saveChanges() {
    if (!selectedDepartment || dirtyChangeCount === 0) return;
    const invalid = dirtyPositions.find((position) => {
      const nextReportTo = reportValue(position, draftReports);
      return nextReportTo && createsCycle(position, nextReportTo, positionsByName, draftReports);
    });
    if (invalid) {
      setToast({ type: "error", message: `${invalid.name} 的汇报关系会形成循环` });
      return;
    }
    setSaving(true);
    try {
      if (managerDirty) {
        const descriptionDraft = createDepartmentDescriptionDraft(selectedDepartment, selectedDepartment.descriptions[0]);
        await putJson("/api/modules/hr/roster/departments", {
          id: selectedDepartment.id,
          descriptions: [departmentDescriptionPayload({
            ...descriptionDraft,
            details: sanitizeDepartmentDescriptionDetails(descriptionDraft.details, selectedDepartment.name, managerDraft),
          })],
        }, "保存部门负责人失败");
      }
      for (const position of dirtyPositions) {
        if (!position.positionDescriptionId || !position.positionDescriptionCode || !position.positionDescriptionName) {
          throw new Error(`${position.name} 缺少岗位说明书，无法保存汇报关系`);
        }
        const detailsText = positionDetailsText(position);
        await putJson("/api/modules/hr/roster/position-descriptions", {
          id: position.positionDescriptionId,
          code: position.positionDescriptionCode,
          name: position.positionDescriptionName,
          departmentName: position.positionDescriptionDepartmentName || position.departmentName || null,
          reportTo: reportValue(position, draftReports) || null,
          positionPurpose: position.positionPurpose || null,
          summary: position.summary || null,
          headcount: position.headcountPlan,
          version: position.positionDescriptionVersion || null,
          effectiveDate: position.effectiveDate || null,
          sourceFile: position.sourceFile || "",
          ...(detailsText ? { details: detailsText } : {}),
        }, "保存岗位汇报关系失败");
      }
      await onReload();
      setDraftReports({});
      setToast({ type: "success", message: "组织架构修改已保存" });
    } catch (error) {
      setToast({ type: "error", message: error instanceof Error ? error.message : "保存岗位汇报关系失败" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <WorkspaceSplitPage
        sideOpen
        sideLabel="全部部门层级"
        onSideOpenChange={() => undefined}
        drawerOpen={drawerOpen}
        onDrawerOpenChange={onDrawerOpenChange}
        showSideControls={false}
        contentClassName="!max-w-none !px-0 !py-0"
        renderSide={renderSide}
      >
        <PanelCard className="min-h-[520px]" bodyClassName="p-4">
          {loading && <EmptyStateCard compact>加载中...</EmptyStateCard>}
          {error && <EmptyStateCard compact className="border-red-100 bg-red-50 text-red-600">{error}</EmptyStateCard>}
          {!loading && !error && !selectedDepartment && <EmptyStateCard>请选择左侧部门查看岗位汇报关系</EmptyStateCard>}
          {!loading && !error && selectedDepartment && (
            <div className="space-y-4">
              <div className="flex min-w-0 flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-4">
                <div className="min-w-0">
                  <div className="flex min-w-0 items-baseline gap-3">
                    <h2 className="truncate text-lg font-semibold text-slate-900">{selectedDepartment.name}</h2>
                    <span className="shrink-0 font-mono text-sm text-slate-400">{selectedDepartment.code}</span>
                  </div>
                </div>
                <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
                  <div className="flex min-w-0 w-72 items-center gap-2">
                    <span className="shrink-0 text-xs font-semibold text-slate-500">负责人</span>
                    <FkFieldInput
                      fkKey="hr.position"
                      endpoint={HR_REFERENCE_OPTIONS_ENDPOINT}
                      value={managerDraft}
                      displayValue={managerDraft}
                      disabled={!canEdit || saving}
                      placeholder="搜索负责人岗位"
                      onChange={(_label, option?: FkFieldOption) => {
                        setManagerDraft(selectedEntityName("position", option));
                      }}
                    />
                  </div>
                  <ActionButton
                    disabled={!canEdit || saving || dirtyChangeCount === 0}
                    onClick={() => void saveChanges()}
                    variant="primary"
                  >
                    {saving ? "保存中..." : dirtyChangeCount > 0 ? `保存修改 (${dirtyChangeCount})` : "保存修改"}
                  </ActionButton>
                </div>
              </div>

              {directPositions.length === 0 ? (
                <EmptyStateCard>当前部门暂无直属岗位</EmptyStateCard>
              ) : (
                <div className="rounded-md border border-slate-200 bg-white">
                  <DataTable
                    rows={relations}
                    columns={columns}
                    visibleColumns={columns.map((column) => column.key)}
                    rowKey={(row) => row.position.id}
                    density="compact"
                    rowClassName={(row) => row.position.id === selectedPositionId ? "bg-sky-50 ring-1 ring-inset ring-sky-200" : ""}
                  />
                </div>
              )}
            </div>
          )}
        </PanelCard>
      </WorkspaceSplitPage>
      <Toast
        message={toast?.message || ""}
        type={toast?.type}
        show={!!toast}
        onClose={() => setToast(null)}
      />
    </>
  );
}
