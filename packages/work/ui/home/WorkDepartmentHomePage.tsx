"use client";

import { useEffect, useMemo, useState } from "react";
import { workspacePath } from "@workspace/core/routing";
import {
  createMetricsSection,
  createPageBody,
  createPageDataSection,
  createPageTabBar,
  createSectionSection,
  createSelectorTreeExpandedIds,
  createStatusSection,
  PageSurface,
  setSelectorTreeNodeExpanded,
  type BodySurfaceProps,
  type BodySurfaceSelectorProps,
  type DataSurfaceStructuredCellSpec,
  type SelectorSurfaceStructuredTreeItemSpec,
  type SurfaceToolbarItems,
} from "@workspace/core/ui";
import type { SessionUser } from "@workspace/platform/types";
import {
  createSpaceWorkbenchBody,
  createStandardBusinessSpaceNavigationSelector,
  spaceWorkbenchPanelToolbarItems,
} from "@workspace/platform/ui";
import { renderAppShellPage } from "@workspace/platform/ui/app-shell-page";
import { useWorkGanttViewport } from "../gantt";
import { getWorkSpacePath } from "../works/model";
import type { WorkTaskSpace } from "../works/types";

export type WorkDepartmentHomeDepartment = {
  id: number;
  code: string;
  name: string;
  hierarchyKind: "G" | "M";
  level: number;
  levelLabel: string;
  parentId: number | null;
  parentName: string | null;
  managerPositionName: string | null;
  managerName: string | null;
  isArchived: boolean;
  childCount: number;
  directEmployeeCount: number;
  totalEmployeeCount: number;
  directPositionCount: number;
  totalPositionCount: number;
  activePlanCount: number;
  activeItemCount: number;
};

export type WorkDepartmentHomeEmployee = {
  id: number;
  employeeId: string;
  name: string;
  departmentId: number;
  departmentName: string;
  departmentCode: string;
  positionNames: string[];
  isPrimary: boolean;
  workPercent: string | null;
  personnelType: string | null;
  rank: string | null;
  title: string | null;
  joinDate: string | null;
};

export type WorkDepartmentHomeData = {
  selectedDepartmentId: number | null;
  departments: WorkDepartmentHomeDepartment[];
  employees: WorkDepartmentHomeEmployee[];
};

export type WorkDepartmentHomeNavigationData = {
  spaces: WorkTaskSpace[];
  preferredDepartmentIds: number[];
  preferredProjectIds: number[];
};

const departmentHomeTabs = [
  { key: "overview", label: "部门总览" },
  { key: "gantt", label: "部门甘特" },
];

export function WorkDepartmentHomePageView({
  user,
  data,
  navigation,
}: {
  user: SessionUser;
  data: WorkDepartmentHomeData;
  navigation: WorkDepartmentHomeNavigationData;
}) {
  const [activeTab, setActiveTab] = useState("overview");
  const [activeDepartmentId, setActiveDepartmentId] = useState(data.selectedDepartmentId);
  const ganttViewport = useWorkGanttViewport();
  const [sideOpen, setSideOpen] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsedDepartmentIds, setCollapsedDepartmentIds] = useState<Set<number>>(() => new Set());
  const departmentById = useMemo(() => new Map(data.departments.map((department) => [department.id, department])), [data.departments]);
  const activeDepartment = activeDepartmentId ? departmentById.get(activeDepartmentId) ?? null : null;
  const childMap = useMemo(() => childrenByDepartment(data.departments), [data.departments]);
  const activeScopeIds = useMemo(() => activeDepartment ? new Set([activeDepartment.id, ...descendantIds(activeDepartment.id, childMap)]) : new Set<number>(), [activeDepartment, childMap]);
  const activeEmployees = useMemo(
    () => data.employees.filter((employee) => activeScopeIds.has(employee.departmentId)),
    [activeScopeIds, data.employees],
  );

  useEffect(() => {
    if (!activeDepartment) return;
    setCollapsedDepartmentIds((current) => setSelectorTreeNodeExpanded(current, activeDepartment.id, true));
  }, [activeDepartment]);

  useEffect(() => {
    function handlePopState() {
      const id = departmentIdFromPath(window.location.pathname);
      if (id && departmentById.has(id)) setActiveDepartmentId(id);
    }
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [departmentById]);

  const selectDepartment = (department: WorkDepartmentHomeDepartment) => {
    if (department.id !== activeDepartmentId) {
      window.location.assign(workspacePath(`/work/department/${department.id}`));
      return;
    }
    setActiveDepartmentId(department.id);
  };

  const openDepartmentSpace = () => {
    if (!activeDepartment) return;
    window.location.assign(workspacePath(`/work/department/${activeDepartment.id}/space`));
  };

  const left = createDepartmentNavigation({
    departments: data.departments,
    activeDepartment,
    collapsedDepartmentIds,
    onSelect: selectDepartment,
    onToggle: (id, expanded) => setCollapsedDepartmentIds((current) => setSelectorTreeNodeExpanded(current, id, expanded)),
  });
  const right = activeDepartment
    ? activeTab === "gantt"
      ? departmentGanttBody(activeDepartment, ganttViewport)
      : overviewBody(activeDepartment, activeEmployees, openDepartmentSpace)
    : overviewPlaceholderBody();
  const toolbarItems: SurfaceToolbarItems = spaceWorkbenchPanelToolbarItems({
    label: "组织层级",
    open: sideOpen,
    onOpenDrawer: () => setDrawerOpen(true),
    onToggleSide: () => setSideOpen(!sideOpen),
  });

  const preferredDepartmentIds = activeDepartmentId
    ? [activeDepartmentId, ...navigation.preferredDepartmentIds.filter((id) => id !== activeDepartmentId)]
    : navigation.preferredDepartmentIds;
  const spaceSelector = createStandardBusinessSpaceNavigationSelector({
    spaces: navigation.spaces,
    preferredDepartmentIds,
    preferredProjectIds: navigation.preferredProjectIds,
    active: activeDepartmentId ? { targetType: "department", targetId: activeDepartmentId } : null,
    label: "工作空间",
    order: ["personal", "departments", "projects"],
    onChange: (space) => window.location.assign(workspacePath(getWorkSpacePath(space.targetType, space.targetId))),
  });
  const headerSelector = spaceSelector && !activeDepartmentId
    ? {
        ...spaceSelector,
        value: "department-home",
        options: [{ value: "department-home", label: "部门" }, ...spaceSelector.options],
        onChange: (value: string) => {
          if (value !== "department-home") spaceSelector.onChange(value);
        },
      }
    : spaceSelector;

  return renderAppShellPage({
    title: "部门主页",
    backHref: "/work",
    user,
    headerSelector,
    children: <PageSurface
      kind="standard"
      tabbar={createPageTabBar({
        items: departmentHomeTabs,
        active: activeTab,
        onChange: setActiveTab,
        variant: "large",
        ariaLabel: "部门主页视图",
      })}
      toolbar={{ items: toolbarItems }}
      body={createSpaceWorkbenchBody({
        left,
        right,
        label: "组织层级",
        open: sideOpen,
        drawerOpen,
        onOpenChange: setSideOpen,
        onDrawerOpenChange: setDrawerOpen,
        ratio: [0.32, 0.68],
        showControls: false,
      })}
    />,
  });
}

function overviewPlaceholderBody(): BodySurfaceProps {
  return createPageBody([
    createStatusSection("department-overview-placeholder", {
      kind: "empty",
      content: "请选择左侧部门",
    }),
  ]);
}

function departmentGanttBody(
  department: WorkDepartmentHomeDepartment,
  viewport: ReturnType<typeof useWorkGanttViewport>,
): BodySurfaceProps {
  return createPageBody([
    {
      key: "department-gantt",
      body: {
        kind: "visualization",
        visualization: {
          kind: "gantt",
          gantt: {
            frame: { title: `${department.name}甘特` },
            timeline: {
              kind: "gantt",
              rows: [],
              periodStart: viewport.periodStart,
              zoom: viewport.zoom,
              leftHeader: "任务",
              emptyText: "暂无部门甘特数据",
            },
          },
        },
      },
    },
  ]);
}

function createDepartmentNavigation({
  departments,
  activeDepartment,
  collapsedDepartmentIds,
  onSelect,
  onToggle,
}: {
  departments: WorkDepartmentHomeDepartment[];
  activeDepartment: WorkDepartmentHomeDepartment | null;
  collapsedDepartmentIds: ReadonlySet<number>;
  onSelect: (department: WorkDepartmentHomeDepartment) => void;
  onToggle: (id: number, expanded: boolean) => void;
}): BodySurfaceSelectorProps {
  const childMap = childrenByDepartment(departments);
  const departmentById = new Map(departments.map((department) => [department.id, department]));
  const roots = departments
    .filter((department) => department.parentId == null || !departmentById.has(department.parentId))
    .sort(sortDepartments);
  const expandedIds = createSelectorTreeExpandedIds({
    items: departments,
    getKey: (department) => department.id,
    collapsedIds: collapsedDepartmentIds,
  });

  function declareItems(nodes: WorkDepartmentHomeDepartment[], level = 1): SelectorSurfaceStructuredTreeItemSpec<WorkDepartmentHomeDepartment>[] {
    return nodes.map((department) => {
      const children = childMap.get(department.id)?.sort(sortDepartments) ?? [];
      return {
        key: department.id,
        value: department,
        card: {
          title: department.name,
          code: department.code,
          level: department.level || level,
          showLevelBadge: false,
          tone: department.hierarchyKind === "G" ? "blue" : "amber",
          archived: department.isArchived,
          meta: [department.managerName ? `负责人：${department.managerName}` : null, `下级 ${department.childCount}`].filter(Boolean) as string[],
        },
        children: children.length ? declareItems(children, level + 1) : undefined,
      };
    });
  }

  return {
    kind: "selector",
    selector: {
      kind: "tree",
      title: "全部组织层级",
      items: declareItems(roots),
      selectedId: activeDepartment?.id ?? null,
      onSelect,
      expandedIds,
      onToggle: (id, expanded) => onToggle(Number(id), expanded),
    },
  };
}

function overviewBody(
  department: WorkDepartmentHomeDepartment,
  employees: WorkDepartmentHomeEmployee[],
  onOpenSpace: () => void,
): BodySurfaceProps {
  return createPageBody([
    metricSection(department),
    createSectionSection("department-profile", {
      title: "部门轮廓",
      actions: [{ key: "open-space", label: "查看", icon: "view", variant: "primary", onClick: onOpenSpace }],
      sections: [
        createPageDataSection("department-profile-table", {
          kind: "structured",
          rows: departmentRows(department),
          frame: "bordered",
          presentation: { density: "compact", header: "tinted" },
        }),
      ],
    }),
    createSectionSection("department-people-preview", {
      title: "员工概览",
      sections: employees.length
        ? [employeeTableSection(employees.slice(0, 8), "当前部门及下级员工")]
        : [createStatusSection("department-people-empty", { kind: "empty", content: "当前部门暂无在职员工" })],
    }),
  ]);
}

function metricSection(department: WorkDepartmentHomeDepartment) {
  return createMetricsSection("department-home-metrics", {
    metrics: [
      { key: "employees", label: "员工", value: department.totalEmployeeCount },
      { key: "positions", label: "岗位", value: department.totalPositionCount },
      { key: "children", label: "下级", value: department.childCount },
      { key: "items", label: "工作项", value: department.activeItemCount },
    ],
  });
}

function departmentRows(department: WorkDepartmentHomeDepartment): DataSurfaceStructuredCellSpec[][] {
  return [
    [header("字段"), header("内容")],
    [label("部门编码"), value(department.code)],
    [label("部门名称"), value(department.name)],
    [label("层级"), value(department.levelLabel)],
    [label("上级组织"), value(department.parentName || "-")],
    [label("负责人岗位"), value(displayPositionText(department.managerPositionName))],
    [label("负责人"), value(department.managerName || "-")],
    [label("工作空间"), value(`计划 ${department.activePlanCount} · 工作项 ${department.activeItemCount}`)],
  ];
}

function employeeTableSection(employees: WorkDepartmentHomeEmployee[], empty: string) {
  return createPageDataSection("department-employee-table", {
    kind: "structured",
    rows: [
      [header("工号"), header("姓名"), header("部门"), header("岗位"), header("任职"), header("入职日期")],
      ...employees.map((employee) => [
        value(employee.employeeId),
        value(employee.name),
        value(`${employee.departmentCode} ${employee.departmentName}`),
        value(displayPositionText(employee.positionNames.join("、"))),
        value([employee.isPrimary ? "主岗" : null, employee.workPercent, employee.rank || employee.title || employee.personnelType].filter(Boolean).join(" · ") || "-"),
        value(employee.joinDate || "-"),
      ]),
    ],
    empty,
    frame: "bordered",
    structuredScroll: true,
    scroll: { x: true },
    presentation: { density: "compact", header: "tinted" },
  });
}

function header(content: string): DataSurfaceStructuredCellSpec {
  return { content, header: true, cellRole: "header" };
}

function label(content: string): DataSurfaceStructuredCellSpec {
  return { content, cellRole: "label", width: "sm" };
}

function value(content: string | number): DataSurfaceStructuredCellSpec {
  return { content, cellRole: "value" };
}

function displayPositionText(content: string | null | undefined) {
  const value = content?.trim();
  if (!value) return "-";
  return value.length > 10 ? `${value.slice(0, 10)}...` : value;
}

function childrenByDepartment(departments: WorkDepartmentHomeDepartment[]) {
  const map = new Map<number, WorkDepartmentHomeDepartment[]>();
  for (const department of departments) {
    if (!department.parentId) continue;
    map.set(department.parentId, [...(map.get(department.parentId) ?? []), department]);
  }
  return map;
}

function descendantIds(departmentId: number, childMap: ReadonlyMap<number, WorkDepartmentHomeDepartment[]>) {
  const result: number[] = [];
  const stack = [...(childMap.get(departmentId) ?? [])];
  while (stack.length) {
    const department = stack.shift()!;
    result.push(department.id);
    stack.push(...(childMap.get(department.id) ?? []));
  }
  return result;
}

function sortDepartments(a: WorkDepartmentHomeDepartment, b: WorkDepartmentHomeDepartment) {
  return a.hierarchyKind.localeCompare(b.hierarchyKind) || a.level - b.level || a.code.localeCompare(b.code) || a.id - b.id;
}

function departmentIdFromPath(pathname: string) {
  const match = pathname.match(/\/work\/department\/(\d+)/);
  return match ? Number(match[1]) : null;
}
