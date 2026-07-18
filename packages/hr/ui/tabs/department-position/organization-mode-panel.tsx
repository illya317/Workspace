"use client";

import { useMemo } from "react";
import {
  createPageBody, createEmptySection, createMessageSection,
  createPanelSection,
  type DataSurfaceColumnSpec,
  type DataSurfaceRowActionSpec,
  type BodySurfaceProps,
  type PageSurfaceStandardProps,
  PageSurface,
  type BodySurfaceSectionSpec,
  type SelectorSurfaceProps,
  type SurfaceToolbarItems,
} from "@workspace/core/ui";
import type { RosterSurfaceTabBarProps } from "../../roster-surface";
import type { ActionRuntime } from "@workspace/platform/workflow-action-runtime";
import { rosterAssistantToolbarItems } from "../../roster-surface";
import { useDepartmentCreateSurface } from "./department-create-panel";
import type { Department, Position } from "./types";

type PositionRelationRow = {
  position: Position;
  subordinates: Position[];
  label: string;
};
function normalizeName(value: unknown) {
  return String(value || "").trim();
}
function reportValue(position: Position) {
  return normalizeName(position.reportTo);
}
function directSubordinates(position: Position, positions: Position[]) {
  const seen = new Set<string>();
  return positions.filter(candidate => {
    if (candidate.id === position.id || reportValue(candidate) !== position.name || seen.has(normalizeName(candidate.name))) return false;
    seen.add(normalizeName(candidate.name));
    return true;
  });
}
function createsCycle(position: Position, positionsByName: Map<string, Position>) {
  let parent = positionsByName.get(reportValue(position));
  const visited = new Set<number>();
  while (parent) {
    if (parent.id === position.id) return true;
    if (visited.has(parent.id)) return false;
    visited.add(parent.id);
    parent = positionsByName.get(reportValue(parent));
  }
  return false;
}
function relationLabel(position: Position, selectedDepartment: Department, positionsByName: Map<string, Position>) {
  const reportTo = reportValue(position);
  const parent = reportTo ? positionsByName.get(reportTo) : undefined;
  if (!reportTo) return position.id === selectedDepartment.managerPositionId ? "负责人岗位" : "顶层岗位";
  if (!parent) return "待匹配";
  if (parent.id === position.id || createsCycle(position, positionsByName)) return "循环关系";
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
  departmentCreateRuntime,
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
  departmentCreateRuntime: ActionRuntime | null;
  onDrawerOpenChange: (open: boolean) => void;
  onCreatePanelChange: (panel: "department" | "position" | null) => void;
  onOpenDepartmentDetails?: (departmentId: number) => void;
  onOpenPositionDetails?: (positionId: number) => void;
  onSelectPosition: (position: Position) => void;
  onSideOpenChange: (open: boolean) => void;
  onUnsavedChange?: (dirty: boolean) => void;
  onReload: () => Promise<void>;
  surface?: RosterSurfaceTabBarProps;
}) {
  const createDepartmentSurface = useDepartmentCreateSurface({
    departments,
    departmentById,
    actionRuntime: departmentCreateRuntime,
    open: createPanel === "department",
    onOpenChange: (open) => onCreatePanelChange(open ? "department" : null),
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
    subordinates: directSubordinates(position, positions),
    label: selectedDepartment ? relationLabel(position, selectedDepartment, positionsByName) : ""
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
              tone: label === "循环关系" || label === "待匹配" ? "red" : label === "跨部门上级" ? "amber" : label === "负责人岗位" || label === "顶层岗位" ? "emerald" : "slate",
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
      <span className="flex w-full min-w-0 items-center gap-2 sm:w-72">
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
      content: "请选择左侧组织查看岗位汇报关系"
    }));
  }
  if (!loading && !error && selectedDepartment) {
    panelSections.push(directPositions.length === 0
      ? createEmptySection("empty-direct", {
        presentation: "plain",
        content: "当前组织暂无直属岗位"
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
  const toolbarItems: SurfaceToolbarItems = [];
  toolbarItems.push(...rosterAssistantToolbarItems(surface));
  const rightSections = [
    { key: "department-create", chrome: "plain" as const, body: { kind: "create" as const, create: createDepartmentSurface } },
    ...(createPanel === "department" ? [] : [createPanelSection("organization-mode", {
        title: organizationPanelTitle,
        actions: organizationHeaderDepartment && onOpenDepartmentDetails ? [{
          key: "open-department",
          label: "查看组织详情",
          icon: "view",
          onClick: () => onOpenDepartmentDetails(organizationHeaderDepartment.id),
          presentation: "icon",
        }] : undefined,
        sections: panelSections,
      })]),
  ];
  const body: BodySurfaceProps = {
        kind: "section",
        layout: "split",
        left: { kind: "selector", selector },
        right: createPageBody(rightSections),
        sideOpen,
        sideLabel: "全部组织层级",
        onSideOpenChange,
        drawerOpen,
        onDrawerOpenChange,
  };
  const pageProps: PageSurfaceStandardProps = surface
    ? { ...surface, toolbar: toolbarItems.length ? { items: toolbarItems } : undefined, body }
    : { body };
  return <PageSurface {...pageProps} />;
}
