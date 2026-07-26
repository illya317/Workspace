export { getUserApiKeyStatus, rotateUserApiKey } from "./personal-api-key";
import { activeModuleDefinitions } from "../effective-module-registry";
import {
  defaultPortalSlots,
  normalizePortalSlots,
  portalEntriesFromModules,
  type PortalSlot,
} from "../portal-preferences";
import { getSpaceChildResourceKeysForTargetType } from "../permission-resource-policy";
import {
  businessSpaceScopeId,
  getDepartmentNaturalSpaceActionProfile,
} from "./business-space-permissions";
import { prisma } from "./prisma";
import { evaluatePermissionAction } from "./rbac/action-grants";

export const MAX_PREFERRED_DEPARTMENTS = 3;

export interface RoutineItem {
  plan: string;
  nextGoal?: string;
}

export interface PreferredDepartmentOption {
  id: number;
  name: string;
  code: string;
}

function parseRoutineItems(value: string | null): RoutineItem[] {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is RoutineItem => (
        item &&
        typeof item === "object" &&
        typeof item.plan === "string" &&
        (item.nextGoal === undefined || typeof item.nextGoal === "string")
      ));
  } catch {
    return [];
  }
}

function parsePreferredDepartmentIds(value: string | null): number[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<number>();
    const ids: number[] = [];
    for (const item of parsed) {
      const id = typeof item === "number" ? item : Number(item);
      if (!Number.isInteger(id) || id <= 0 || seen.has(id)) continue;
      seen.add(id);
      ids.push(id);
      if (ids.length >= MAX_PREFERRED_DEPARTMENTS) break;
    }
    return ids;
  } catch {
    return [];
  }
}

function parsePortalSlots(value: string | null, validKeys?: ReadonlySet<string>): PortalSlot[] {
  if (!value) return normalizePortalSlots([], validKeys);
  try {
    return normalizePortalSlots(JSON.parse(value), validKeys);
  } catch {
    return normalizePortalSlots([], validKeys);
  }
}

function visiblePortalEntries(visibleResourceKeys: readonly string[] = []) {
  const visible = new Set(visibleResourceKeys);
  const visibleModules = activeModuleDefinitions
    .flatMap((registration) => {
      const moduleDef = registration.moduleDef;
      if (!moduleDef || moduleDef.presentation === "headless" || moduleDef.enabled === false || moduleDef.hidden) return [];
      const hasVisibleModule = Boolean(moduleDef.resourceKey && visible.has(moduleDef.resourceKey));
      const visibleChildren = moduleDef.children?.filter((child) => (
        child.enabled !== false &&
        !child.hidden &&
        child.resourceKey &&
        visible.has(child.resourceKey)
      ));
      if (!hasVisibleModule && !visibleChildren?.length) return [];
      return [{ ...moduleDef, children: visibleChildren }];
    });
  return portalEntriesFromModules(visibleModules);
}

function visiblePortalEntryKeys(visibleResourceKeys: readonly string[] = []) {
  return new Set(visiblePortalEntries(visibleResourceKeys).map((entry) => entry.key));
}

export async function getUserRoutineItems(userId: number): Promise<RoutineItem[]> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { routineItems: true },
  });
  return parseRoutineItems(user?.routineItems ?? null);
}

export async function updateUserRoutineItems(userId: number, routineItems: RoutineItem[]) {
  await prisma.user.update({
    where: { id: userId },
    data: { routineItems: JSON.stringify(routineItems) },
  });
}

async function canViewDepartmentPreferenceOption(userId: number, departmentId: number) {
  if (await getDepartmentNaturalSpaceActionProfile(userId, departmentId)) return true;
  const scopeId = businessSpaceScopeId("department", departmentId);
  const spaceResourceKeys = getSpaceChildResourceKeysForTargetType("department");
  const checks = await Promise.all(spaceResourceKeys.map((resourceKey) =>
    evaluatePermissionAction(userId, resourceKey, "read", { scopeId, projection: "space" })
  ));
  return checks.some(Boolean);
}

export async function listPreferredDepartmentOptions(userId?: number): Promise<PreferredDepartmentOption[]> {
  const departments = await prisma.department.findMany({
    where: { isArchived: false, hierarchyKind: "M" },
    select: { id: true, name: true, code: true },
    orderBy: [{ code: "asc" }, { id: "asc" }],
  });
  if (!userId) return departments;
  const visible = await Promise.all(departments.map((department) =>
    canViewDepartmentPreferenceOption(userId, department.id)
  ));
  return departments.filter((_, index) => visible[index]);
}

export async function getUserPreferredDepartmentIds(userId: number): Promise<number[]> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { preferredDepartmentIds: true },
  });
  return parsePreferredDepartmentIds(user?.preferredDepartmentIds ?? null);
}

export async function getUserPreferredDepartmentSettings(userId: number) {
  const [departments, preferredDepartmentIds] = await Promise.all([
    listPreferredDepartmentOptions(userId),
    getUserPreferredDepartmentIds(userId),
  ]);
  const availableIds = new Set(departments.map((department) => department.id));
  return {
    departments,
    preferredDepartmentIds: preferredDepartmentIds.filter((id) => availableIds.has(id)),
    maxPreferredDepartments: MAX_PREFERRED_DEPARTMENTS,
  };
}

export async function updateUserPreferredDepartmentIds(userId: number, departmentIds: number[]) {
  const nextIds = Array.from(new Set(departmentIds))
    .filter((id) => Number.isInteger(id) && id > 0)
    .slice(0, MAX_PREFERRED_DEPARTMENTS);
  const departments = await listPreferredDepartmentOptions(userId);
  const availableIds = new Set(departments.map((department) => department.id));
  if (nextIds.some((id) => !availableIds.has(id))) {
    throw new Error("不能选择不存在或已归档的部门");
  }
  await prisma.user.update({
    where: { id: userId },
    data: { preferredDepartmentIds: JSON.stringify(nextIds) },
  });
  return nextIds;
}

export async function getUserPortalSlots(userId: number, visibleResourceKeys: readonly string[] = []) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { portalSlots: true },
  });
  if (!user?.portalSlots) return defaultPortalSlots(visiblePortalEntries(visibleResourceKeys));
  return parsePortalSlots(user.portalSlots, visiblePortalEntryKeys(visibleResourceKeys));
}

export async function updateUserPortalSlots(userId: number, slots: PortalSlot[], visibleResourceKeys: readonly string[] = []) {
  const nextSlots = normalizePortalSlots(slots, visiblePortalEntryKeys(visibleResourceKeys));
  await prisma.user.update({
    where: { id: userId },
    data: { portalSlots: JSON.stringify(nextSlots) },
  });
  return nextSlots;
}
