"use client";

import { useMemo } from "react";
import {
  createPageBody, createEmptySection, createMessageSection,
  createPanelSection,
  type DataSurfaceColumnSpec,
  type DataSurfaceRowActionSpec,
  PageSurface,
  type BodySurfaceSectionSpec,
  type SelectorSurfaceProps,
  type SurfaceToolbarItems,
} from "@workspace/core/ui";
import type { RosterSurfaceNavigationProps } from "../../roster-surface";
import { useDepartmentCreatePanelSection } from "./department-create-panel";
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
  createPanel,
  departments,
  departmentById,
  selectedDepartment,
  selectedPositionId,
  positions,
  positionsByDepartment,
  selector,
  sideOpen,
  canEdit,
  onDrawerOpenChange,
  onCreatePanelChange,
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
  createPanel: "department" | "position" | null;
  departments: Department[];
  departmentById: Map<number, Department>;
  selectedDepartment: Department | undefined;
  selectedPositionId: number | null;
  positions: Position[];
  positionsByDepartment: Map<number, Position[]>;
  selector: SelectorSurfaceProps<Department>;
  sideOpen: boolean;
  canEdit: boolean;
  onDrawerOpenChange: (open: boolean) => void;
  onCreatePanelChange: (panel: "department" | "position" | null) => void;
  onOpenDepartmentDetails?: (departmentId: number) => void;
  onOpenPositionDetails?: (positionId: number) => void;
  onSelectPosition: (position: Position) => void;
  onSideOpenChange: (open: boolean) => void;
  onUnsavedChange?: (dirty: boolean) => void;
  onReload: () => Promise<void>;
  surface?: RosterSurfaceNavigationProps;
}) {
  const createDepartmentSection = useDepartmentCreatePanelSection({
    departments,
    departmentById,
    canEdit,
    onCancel: () => onCreatePanelChange(null),
    onCreated: async () => {
      onCreatePanelChange(null);
      await onReload();
    },
  });
  const directPositions = selectedDepartment ? positionsByDepartment.get(selectedDepartment.id) || [] : [];
  const positionsByName = useMemo(() => new Map(positions.map(position => [position.name, position])), [positions]);
  void onUnsavedChange;
  const relations = directPositions.map(position => ({
    position,
    subordinates: directSubordinates(position, positions, {}),
    label: selectedDepartment ? relationLabel(position, selectedDepartment, positionsByName, {}) : ""
  }));
  const columns: DataSurfaceColumnSpec<PositionRelationRow>[] = [{
    key: "position",
    label: "岗位",
    required: true,

    wrap: "wrap",
    cell: ({
      position,
      label
    }) => ({
      kind: "group",
      direction: "column",

      items: [
        {
          kind: "group",
          items: [
            {
              kind: "text",
              value: position.name,
              emphasis: "strong",
              tone: "info",
              wrap: "truncate",
            },
            {
              kind: "badge",
              label,
              tone: label === "循环关系" || label === "待匹配" ? "red" : label === "跨部门上级" ? "amber" : label === "顶层岗位" ? "emerald" : "slate",
            },
          ],
        },
        { kind: "text", value: position.code, font: "mono", tone: "muted", wrap: "truncate", },
      ],
    })
  }, {
    key: "subordinates",
    label: "下属岗位",
    required: true,

    wrap: "wrap",
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
    }) : { kind: "empty", content: "-", tone: "muted", }
  }];
  const organizationHeaderDepartment = !loading && !error ? selectedDepartment : undefined;
  const organizationPanelTitle = organizationHeaderDepartment ? (
    <div
      className="organization-title-layout min-w-0 whitespace-normal"
    >
      <span className="min-w-0 truncate text-left text-lg font-semibold leading-7 text-slate-900">
        {organizationHeaderDepartment.name}
      </span>
      <span className="shrink-0 font-mono text-sm text-slate-400">{organizationHeaderDepartment.code}</span>
      <span className="flex min-w-0 w-72 items-center gap-2">
        <span className="shrink-0 text-xs font-semibold text-slate-500">负责人</span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-700" title={organizationHeaderDepartment.managerName || "未设置"}>
          {organizationHeaderDepartment.managerName || "未设置"}
        </span>
      </span>
    </div>
  ) : undefined;
  const panelSections: BodySurfaceSectionSpec[] = [];

  if (loading) panelSections.push(createMessageSection("loading", {
    content: "加载中...",
    tone: "muted"
  }));
  if (error) panelSections.push(createMessageSection("error", {
    content: error,
    tone: "danger"
  }));
  if (!loading && !error && !selectedDepartment) {
    panelSections.push(createEmptySection("empty", {
      presentation: "plain",
      content: "请选择左侧部门查看岗位汇报关系"
    }));
  }
  if (!loading && !error && selectedDepartment) {
    panelSections.push(directPositions.length === 0
      ? createEmptySection("empty-direct", {
        presentation: "plain",
        content: "当前部门暂无直属岗位"
      })
      : {
          key: "relations",
          body: { kind: "data", data: {
            kind: "table",
            rows: relations,
            columns,
            visibleColumns: columns.map(column => column.key),
            rowKey: row => row.position.id,
            rowActions: onOpenPositionDetails
              ? (row): DataSurfaceRowActionSpec[] => [{
                  key: `open-position-${row.position.id}`,
                  label: "查看岗位详情",
                  kind: "view",
                  onClick: () => onOpenPositionDetails(row.position.id),
                }]
              : undefined,
            presentation: { density: "compact" },
            rowState: row => row.position.id === selectedPositionId ? "selected" : "normal",
            frame: "bordered",
          } },
        });
  }
  const toolbarItems: SurfaceToolbarItems = canEdit ? [{
    kind: "create",
    key: "create-department",
    label: "新建部门",
    active: createPanel === "department",
    onClick: () => onCreatePanelChange(createPanel === "department" ? null : "department"),
  }] : [];
  const rightSections = createPanel === "department"
    ? [createDepartmentSection]
    : [createPanelSection("organization-mode", {
        title: organizationPanelTitle,
        actions: organizationHeaderDepartment && onOpenDepartmentDetails ? [{
          key: "open-department",
          label: "查看部门详情",
          icon: "view",
          onClick: () => onOpenDepartmentDetails(organizationHeaderDepartment.id),
          presentation: "icon",
        }] : undefined,
        sections: panelSections,
      })];

  return (
    <PageSurface kind="standard"
      embedded={!surface}
      {...surface}
      body={{
        kind: "section",
        layout: "split",
        left: { kind: "selector", selector },
        right: createPageBody(rightSections),
        toolbarItems,
        sideOpen,
        sideLabel: "全部部门层级",
        onSideOpenChange,
        drawerOpen,
        onDrawerOpenChange,
      }}
    />
  );
}
