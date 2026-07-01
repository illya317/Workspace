import type { SpaceWorkbenchKindOption } from "@workspace/platform/ui";
import type { WorkTarget, WorkTaskSpace } from "./types";

export function targetNavigationKey(target: WorkTarget) {
  return `${target.targetType}:${target.targetId}`;
}

function preferredDepartmentSpaces(spaces: WorkTaskSpace[], preferredDepartmentIds: number[]) {
  const departments = spaces.filter((space) => space.targetType === "department");
  const byId = new Map(departments.map((space) => [space.targetId, space]));
  const preferred = preferredDepartmentIds.map((id) => byId.get(id)).filter((space): space is WorkTaskSpace => Boolean(space));
  return preferred.slice(0, 3);
}

export function createWorkSpaceTopNavigationItems(
  spaces: WorkTaskSpace[],
  preferredDepartmentIds: number[],
): SpaceWorkbenchKindOption[] {
  const items: SpaceWorkbenchKindOption[] = [];
  const personal = spaces.find((space) => space.targetType === "personal");
  const company = spaces.find((space) => space.targetType === "company");
  const committee = spaces.find((space) => space.targetType === "committee");
  if (personal) items.push({ key: targetNavigationKey(personal), label: "个人" });
  preferredDepartmentSpaces(spaces, preferredDepartmentIds).forEach((space) => {
    items.push({ key: targetNavigationKey(space), label: space.name });
  });
  if (committee) items.push({ key: targetNavigationKey(committee), label: "运营委员会" });
  if (company) items.push({ key: targetNavigationKey(company), label: "公司" });
  return items;
}

export function activeWorkSpaceNavigationKey(target: WorkTarget | null, items: SpaceWorkbenchKindOption[]) {
  if (!target) return items[0]?.key ?? null;
  const exactKey = targetNavigationKey(target);
  if (items.some((item) => item.key === exactKey)) return exactKey;
  return items[0]?.key ?? null;
}

export function filterWorkSpacesByNavigation(spaces: WorkTaskSpace[], key: string | null) {
  if (!key) return spaces;
  return spaces.filter((space) => targetNavigationKey(space) === key);
}

export function workSpaceNavigationTarget(spaces: WorkTaskSpace[], key: string, activeTarget: WorkTarget | null) {
  void activeTarget;
  return spaces.find((space) => targetNavigationKey(space) === key) ?? null;
}
