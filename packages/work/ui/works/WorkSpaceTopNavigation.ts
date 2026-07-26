import {
  activeStandardBusinessSpaceNavigationKey,
  createStandardBusinessSpaceNavigationItems,
  filterStandardBusinessSpacesByNavigation,
  standardBusinessSpaceNavigationKey,
  standardBusinessSpaceNavigationTarget,
  type SpaceWorkbenchKindOption,
} from "@workspace/platform/ui";
import { WORK_REPORT_STAGE_OPTIONS } from "./WorkReportPayload";
import type { WorkReportingSettings } from "./work-okr-settings-types";
import type { WorkTarget, WorkTaskSpace } from "./types";

export const WORK_OKR_SETTINGS_NAVIGATION_KEY = "okr-settings";
export const WORK_OKR_SETTINGS_VIEW_NAVIGATION_KEY = "settings";
export const WORK_TASKS_NAVIGATION_KEY = "tasks";
export const WORK_TASKS_OWNED_VIEW_KEY = "owned";
export const WORK_TASKS_ASSIGNED_VIEW_KEY = "assigned";
export const WORK_TASKS_COLLABORATION_VIEW_KEY = "collaboration";
export const WORK_REPORTS_NAVIGATION_KEY = "reports";
export const WORK_REPORTING_NAVIGATION_KEY = "work-reporting";
export const WORK_GANTT_NAVIGATION_KEY = "gantt";
export const WORK_KPI_NAVIGATION_KEY = "kpi";

export type WorkTasksChildView = typeof WORK_TASKS_OWNED_VIEW_KEY | typeof WORK_TASKS_ASSIGNED_VIEW_KEY | typeof WORK_TASKS_COLLABORATION_VIEW_KEY;

export const WORK_TASK_VIEW_NAVIGATION_ITEMS = [
  { key: WORK_TASKS_NAVIGATION_KEY, label: "计划", children: [
    { key: WORK_TASKS_OWNED_VIEW_KEY, label: "负责" },
    { key: WORK_TASKS_ASSIGNED_VIEW_KEY, label: "承接" },
    { key: WORK_TASKS_COLLABORATION_VIEW_KEY, label: "协作" },
    { key: WORK_GANTT_NAVIGATION_KEY, label: "甘特图" },
  ] },
  { key: WORK_REPORTS_NAVIGATION_KEY, label: "目标考核", children: [
    ...WORK_REPORT_STAGE_OPTIONS.filter((option) => option.value === "kr").map((option) => ({ key: option.value, label: option.label })),
    { key: WORK_KPI_NAVIGATION_KEY, label: "指标计分卡" },
  ] },
  { key: WORK_REPORTING_NAVIGATION_KEY, label: "工作汇报", children: [
    { key: "weekly", label: "周报" },
    { key: "monthly", label: "月报" },
    ...WORK_REPORT_STAGE_OPTIONS.filter((option) => option.value === "final").map((option) => ({ key: option.value, label: option.label })),
  ] },
];

export const WORK_OKR_SETTINGS_VIEW_NAVIGATION_ITEM = { key: WORK_OKR_SETTINGS_VIEW_NAVIGATION_KEY, label: "周期与流程" };

export function workViewNavigationItemsForSpace(
  items: ReadonlyArray<{ key: string; label: string; children?: ReadonlyArray<{ key: string; label: string }> }>,
  targetType?: string | null,
  reportingSettings?: WorkReportingSettings | null,
): Array<{ key: string; label: string; children?: Array<{ key: string; label: string }> }> {
  return items.map((item) => ({
    ...item,
    children: item.children
      ? [...(item.key === WORK_REPORTING_NAVIGATION_KEY
        ? item.children.filter((child) => child.key === "final" || (
          (child.key === "weekly" || child.key === "monthly")
          && reportingSettings?.[child.key].enabled !== false
        ))
        : item.key !== WORK_TASKS_NAVIGATION_KEY || targetType === "personal"
        ? item.children
        : targetType === "department"
          ? item.children.filter((child) => child.key === WORK_TASKS_OWNED_VIEW_KEY
            || child.key === WORK_TASKS_COLLABORATION_VIEW_KEY
            || child.key === WORK_GANTT_NAVIGATION_KEY)
          : item.children.filter((child) => child.key === WORK_TASKS_OWNED_VIEW_KEY
            || child.key === WORK_GANTT_NAVIGATION_KEY))]
      : undefined,
  }));
}

export function targetNavigationKey(target: WorkTarget) {
  return standardBusinessSpaceNavigationKey(target);
}

export function createWorkSpaceTopNavigationItems(
  spaces: WorkTaskSpace[],
  preferredDepartmentIds: number[],
  preferredProjectIds: number[],
): SpaceWorkbenchKindOption[] {
  return createStandardBusinessSpaceNavigationItems({
    spaces,
    preferredDepartmentIds,
    preferredProjectIds,
    order: ["personal", "departments", "projects"],
  });
}

export function workTopNavigationItems(items: SpaceWorkbenchKindOption[], canManageOkrSettings: boolean) {
  return canManageOkrSettings ? [...items, { key: WORK_OKR_SETTINGS_NAVIGATION_KEY, label: "周期与流程" }] : items;
}

export function activeWorkTopNavigationKey(activeTab: string, activeSpaceKey: string | null, items: SpaceWorkbenchKindOption[]) {
  return activeTab === "settings" ? WORK_OKR_SETTINGS_NAVIGATION_KEY : activeSpaceKey ?? items[0]?.key ?? WORK_OKR_SETTINGS_NAVIGATION_KEY;
}

export function isWorkOkrSettingsNavigationKey(key: string) {
  return key === WORK_OKR_SETTINGS_NAVIGATION_KEY;
}

export function activeWorkSpaceNavigationKey(target: WorkTarget | null, items: SpaceWorkbenchKindOption[]) {
  return activeStandardBusinessSpaceNavigationKey(target, items);
}

export function filterWorkSpacesByNavigation(spaces: WorkTaskSpace[], key: string | null) {
  return filterStandardBusinessSpacesByNavigation(spaces, key);
}

export function workSpaceNavigationTarget(spaces: WorkTaskSpace[], key: string, activeTarget: WorkTarget | null) {
  void activeTarget;
  return standardBusinessSpaceNavigationTarget(spaces, key);
}
