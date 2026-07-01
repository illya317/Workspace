import type { SpaceWorkbenchKindOption } from "@workspace/platform/ui";
import type { WorkTarget, WorkTaskSpace } from "./types";
import { sameTarget } from "./works-client-helpers";

export const PROJECT_NAVIGATION_KEY = "project";

export function targetNavigationKey(target: WorkTarget) {
  return `${target.targetType}:${target.targetId}`;
}

function preferredDepartmentSpaces(spaces: WorkTaskSpace[], preferredDepartmentIds: number[]) {
  const departments = spaces.filter((space) => space.targetType === "department");
  const byId = new Map(departments.map((space) => [space.targetId, space]));
  const preferred = preferredDepartmentIds.map((id) => byId.get(id)).filter((space): space is WorkTaskSpace => Boolean(space));
  return (preferred.length > 0 ? preferred : departments).slice(0, 3);
}

export function createWorkSpaceTopNavigationItems(
  spaces: WorkTaskSpace[],
  preferredDepartmentIds: number[],
): SpaceWorkbenchKindOption[] {
  const items: SpaceWorkbenchKindOption[] = [];
  const personal = spaces.find((space) => space.targetType === "personal");
  const company = spaces.find((space) => space.targetType === "company");
  if (personal) items.push({ key: targetNavigationKey(personal), label: "个人" });
  if (company) items.push({ key: targetNavigationKey(company), label: "运营委员会" });
  if (spaces.some((space) => space.targetType === "project")) items.push({ key: PROJECT_NAVIGATION_KEY, label: "项目" });
  preferredDepartmentSpaces(spaces, preferredDepartmentIds).forEach((space) => {
    items.push({ key: targetNavigationKey(space), label: space.name });
  });
  return items;
}

export function activeWorkSpaceNavigationKey(target: WorkTarget | null, items: SpaceWorkbenchKindOption[]) {
  if (!target) return items[0]?.key ?? null;
  const exactKey = targetNavigationKey(target);
  if (items.some((item) => item.key === exactKey)) return exactKey;
  if (target.targetType === "project" && items.some((item) => item.key === PROJECT_NAVIGATION_KEY)) return PROJECT_NAVIGATION_KEY;
  return items[0]?.key ?? null;
}

export function filterWorkSpacesByNavigation(spaces: WorkTaskSpace[], key: string | null) {
  if (!key) return spaces;
  if (key === PROJECT_NAVIGATION_KEY) return spaces.filter((space) => space.targetType === "project");
  return spaces.filter((space) => targetNavigationKey(space) === key);
}

export function workSpaceNavigationTarget(spaces: WorkTaskSpace[], key: string, activeTarget: WorkTarget | null) {
  if (key === PROJECT_NAVIGATION_KEY) {
    return activeTarget?.targetType === "project"
      ? spaces.find((space) => sameTarget(space, activeTarget)) ?? spaces.find((space) => space.targetType === "project") ?? null
      : spaces.find((space) => space.targetType === "project") ?? null;
  }
  return spaces.find((space) => targetNavigationKey(space) === key) ?? null;
}
