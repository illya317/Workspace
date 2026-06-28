"use client";

import { useEffect, useMemo, useState } from "react";
import { putJson } from "@workspace/platform/ui/api-client";
import {
  type DataSurfaceColumnSpec,
  InputControl,
  PageSurface,
  type PageSurfaceBlockSpec,
  type PageSurfaceSideSpec,
  type ReferenceOption,
  useFeedback,
} from "@workspace/core/ui";
import { HR_REFERENCE_OPTIONS_ENDPOINT } from "../../fk-keys";
import type { RosterSurfaceNavigationProps } from "../../roster-surface";
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
  sideBlocks,
  sideOpen,
  canEdit,
  onDrawerOpenChange,
  onOpenDepartmentDetails,
  onOpenPositionDetails,
  onSelectPosition,
  onSideOpenChange,
  onUnsavedChange,
  onReload,
  surface,
}: {
  drawerOpen: boolean;
  error: string | null;
  loading: boolean;
  selectedDepartment: Department | undefined;
  selectedPositionId: number | null;
  positions: Position[];
  positionsByDepartment: Map<number, Position[]>;
  sideBlocks: (mode: "desktop" | "drawer") => PageSurfaceBlockSpec[];
  sideOpen: boolean;
  canEdit: boolean;
  onDrawerOpenChange: (open: boolean) => void;
  onOpenDepartmentDetails?: (departmentId: number) => void;
  onOpenPositionDetails?: (positionId: number) => void;
  onSelectPosition: (position: Position) => void;
  onSideOpenChange: (open: boolean) => void;
  onUnsavedChange?: (dirty: boolean) => void;
  onReload: () => Promise<void>;
  surface?: RosterSurfaceNavigationProps;
}) {
  const [managerDraft, setManagerDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const feedback = useFeedback();
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
  const columns: DataSurfaceColumnSpec<PositionRelationRow>[] = [{
    key: "position",
    label: "岗位",
    required: true,
    className: "w-1/3",
    cellClassName: "whitespace-normal align-middle",
    cell: ({
      position,
      label
    }) => ({
      kind: "group",
      direction: "column",
      className: "gap-0.5",
      items: [
        {
          kind: "group",
          items: [
            {
              kind: "action",
              action: {
                key: `open-${position.id}`,
                label: position.name,
                onClick: () => onOpenPositionDetails?.(position.id),
                size: "sm",
                truncate: true,
                className: "min-w-0 !h-auto !justify-start !border-0 !bg-transparent !p-0 !text-left !text-sm !font-semibold !leading-5 !text-slate-900 !shadow-none hover:!bg-transparent hover:!text-sky-700 hover:!underline",
              },
            },
            {
              kind: "badge",
              label,
              tone: label === "循环关系" || label === "待匹配" ? "red" : label === "跨部门上级" ? "amber" : label === "顶层岗位" ? "emerald" : "slate",
            },
          ],
        },
        { kind: "text", value: position.code, className: "truncate font-mono text-xs text-slate-400" },
      ],
    })
  }, {
    key: "subordinates",
    label: "下属岗位",
    required: true,
    className: "w-2/3",
    cellClassName: "whitespace-normal align-top",
    cell: ({
      subordinates
    }) => subordinates.length > 0 ? ({
      kind: "selectionGrid",
      mode: "action",
      layout: "fixed",
      columns: 2,
      ariaLabel: "下属岗位",
      options: subordinates.map((position) => ({
        value: String(position.id),
        label: position.name,
      })),
      onItemClick: (option) => {
        const position = subordinates.find((p) => String(p.id) === option.value);
        if (position) onSelectPosition(position);
      },
    }) : { kind: "empty", content: "-", className: "text-xs text-slate-400" }
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
      feedback.success("部门负责人已保存");
    } catch (error) {
      feedback.error(error instanceof Error ? error.message : "保存部门负责人失败");
    } finally {
      setSaving(false);
    }
  }
  const side: PageSurfaceSideSpec = {
    blocks: sideBlocks("desktop"),
    drawerBlocks: sideBlocks("drawer"),
  };
  const organizationHeaderDepartment = !loading && !error ? selectedDepartment : undefined;
  const organizationPanelTitle = organizationHeaderDepartment ? (
    <div
      className="organization-title-layout min-w-0 whitespace-normal"
    >
      <button
        type="button"
        onClick={() => onOpenDepartmentDetails?.(organizationHeaderDepartment.id)}
        className="min-w-0 truncate text-left text-lg font-semibold leading-7 text-slate-900 hover:text-sky-700 hover:underline"
      >
        {organizationHeaderDepartment.name}
      </button>
      <span className="shrink-0 font-mono text-sm text-slate-400">{organizationHeaderDepartment.code}</span>
      <span className="flex min-w-0 w-72 items-center gap-2">
        <span className="shrink-0 text-xs font-semibold text-slate-500">负责人</span>
        <span className="min-w-0 flex-1 text-sm font-normal">
          <InputControl
            spec={{
              valueType: "reference",
              control: "reference",
              state: !canEdit || saving ? "disabled" : "normal",
              options: { source: "remote", fkKey: "hr.position", endpoint: HR_REFERENCE_OPTIONS_ENDPOINT, returnField: "name" },
            }}
            value={managerDraft}
            displayValue={managerDraft}
            placeholder="搜索负责人岗位"
            onChange={(_label, option) => {
              setManagerDraft(selectedEntityName("position", option as ReferenceOption | undefined));
            }}
          />
        </span>
      </span>
    </div>
  ) : undefined;
  const panelBlocks: PageSurfaceBlockSpec[] = [];

  if (loading) panelBlocks.push({ kind: "message", key: "loading", content: "加载中...", tone: "muted" });
  if (error) panelBlocks.push({ kind: "message", key: "error", content: error, tone: "danger" });
  if (!loading && !error && !selectedDepartment) {
    panelBlocks.push({ kind: "empty", key: "empty", presentation: "plain", content: "请选择左侧部门查看岗位汇报关系" });
  }
  if (!loading && !error && selectedDepartment) {
    panelBlocks.push(directPositions.length === 0
      ? { kind: "empty", key: "empty-direct", presentation: "plain", content: "当前部门暂无直属岗位" }
      : {
          kind: "data",
          key: "relations",
          surface: {
            kind: "table",
            rows: relations,
            columns,
            visibleColumns: columns.map(column => column.key),
            rowKey: row => row.position.id,
            density: "compact",
            rowClassName: row => row.position.id === selectedPositionId ? "bg-sky-50 ring-1 ring-inset ring-sky-200" : "",
            className: "rounded-md border border-slate-200 bg-white",
          },
        });
  }

  return (
    <PageSurface
      embedded={!surface}
      kind="split"
      {...surface}
      sideOpen={sideOpen}
      sideLabel="全部部门层级"
      onSideOpenChange={onSideOpenChange}
      drawerOpen={drawerOpen}
      onDrawerOpenChange={onDrawerOpenChange}
      side={side}
      blocks={[{
        kind: "panel",
        key: "organization-mode",
        title: organizationPanelTitle,
        actions: organizationHeaderDepartment ? [{
          key: "save",
          label: saving ? "保存中..." : "保存修改",
          variant: "primary",
          disabled: !canEdit || saving || !managerDirty,
          onClick: () => void saveChanges(),
        }] : undefined,
        className: "min-h-96",
        bodyClassName: "p-4",
        blocks: panelBlocks,
      }]}
    />
  );
}
