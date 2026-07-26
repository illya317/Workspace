import { actionImplies, PERMISSION_ACTION_KEYS, type PermissionActionKey } from "@workspace/platform/permission-actions";
import { getNaturalSpaceActionProfileActionKeys, type NaturalSpaceActionProfile } from "@workspace/platform/permission-natural-space-actions";
import { evaluatePermissionAction, isSuperAdmin } from "@workspace/platform/server/auth";
import {
  getOperatingCommitteeDepartmentContext,
  getOperatingCommitteeNaturalSpaceActionProfile,
  listDepartmentIdsManagedByUserPosition,
} from "@workspace/platform/server/business-space-permissions";
import { currentEmploymentDateWhere, currentOpenEndedDateWhere } from "@workspace/platform/server/relation-registry";
import { prisma } from "@workspace/platform/server/prisma";
import type { PermissionResourceProjectionKind } from "@workspace/platform/server/rbac/resource-projection";
import { getWorkTaskPermissionProjection, getWorkTaskPermissionResourceKey } from "./access";
import type { StandardOrganizationSpaceSeed } from "./standard-space-seeds";

type WorkTaskScopedActionPermissions = {
  canRead: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  canArchive: boolean;
  canSubmit: boolean;
  canApprove: boolean;
  canManagePermissions: boolean;
};

const WORK_TASK_ACTION_KEYS = [
  "read",
  "create",
  "update",
  "delete",
  "archive",
  "submit",
  "approve",
  "reject",
  "grant",
] as const satisfies readonly PermissionActionKey[];

export async function filterReadableWorkDepartmentSpaces(
  userId: number,
  spaces: StandardOrganizationSpaceSeed[],
) {
  const permissionMap = await getWorkDepartmentSpacePermissionMap(userId, spaces.map((space) => space.targetId));
  return spaces.filter((space) => permissionMap.get(space.targetId)?.canRead);
}

export async function getWorkDepartmentSpacePermissionMap(
  userId: number,
  departmentIds: number[],
): Promise<Map<number, WorkTaskScopedActionPermissions>> {
  const targetIds = Array.from(new Set(departmentIds.filter((id) => Number.isInteger(id) && id > 0)));
  const result = new Map<number, WorkTaskScopedActionPermissions>();
  if (targetIds.length === 0) return result;

  if (await isSuperAdmin(userId)) {
    for (const id of targetIds) result.set(id, allWorkTaskActions());
    return result;
  }

  const resourceKey = getWorkTaskPermissionResourceKey("department");
  const projection = getWorkTaskPermissionProjection("department");
  const [
    globalActions,
    naturalMemberIds,
    managedDepartmentIds,
    assigneeDepartmentIds,
    scopedActionMap,
    operatingCommittee,
    operatingCommitteeProfile,
  ] = await Promise.all([
    evaluateGlobalWorkTaskActions(userId, resourceKey, projection),
    listActiveMemberDepartmentIds(userId, targetIds),
    listDepartmentIdsManagedByUserPosition(userId),
    listDepartmentWorkAssigneeIds(userId, targetIds),
    listScopedDepartmentTaskActionMap(userId, resourceKey, targetIds),
    getOperatingCommitteeDepartmentContext(),
    getOperatingCommitteeNaturalSpaceActionProfile(userId),
  ]);

  const targetSet = new Set(targetIds);
  const naturalMemberIdSet = new Set(naturalMemberIds);
  const managedIdSet = new Set(managedDepartmentIds.filter((id) => targetSet.has(id)));
  const assigneeIdSet = new Set(assigneeDepartmentIds);

  for (const id of targetIds) {
    const profile = naturalProfileForDepartment({
      departmentId: id,
      operatingCommitteeId: operatingCommittee?.id ?? null,
      operatingCommitteeProfile,
      managedIdSet,
      naturalMemberIdSet,
    });
    const naturalActions = profile
      ? actionsFromKeys(resourceKey, getNaturalSpaceActionProfileActionKeys(resourceKey, profile))
      : emptyWorkTaskActions();
    const assigneeActions = assigneeIdSet.has(id)
      ? { ...emptyWorkTaskActions(), canRead: true, canCreate: true, canUpdate: true, canSubmit: true }
      : emptyWorkTaskActions();
    result.set(id, mergeWorkTaskActions(
      globalActions,
      naturalActions,
      assigneeActions,
      scopedActionMap.get(id) ?? emptyWorkTaskActions(),
    ));
  }

  return result;
}

function naturalProfileForDepartment(input: {
  departmentId: number;
  operatingCommitteeId: number | null;
  operatingCommitteeProfile: NaturalSpaceActionProfile | null;
  managedIdSet: ReadonlySet<number>;
  naturalMemberIdSet: ReadonlySet<number>;
}): NaturalSpaceActionProfile | null {
  if (input.managedIdSet.has(input.departmentId)) return "allBusiness";
  if (input.departmentId === input.operatingCommitteeId && input.operatingCommitteeProfile) {
    return input.operatingCommitteeProfile;
  }
  return input.naturalMemberIdSet.has(input.departmentId) ? "read" : null;
}

async function evaluateGlobalWorkTaskActions(
  userId: number,
  resourceKey: string,
  projection: PermissionResourceProjectionKind,
) {
  const checks = await Promise.all(WORK_TASK_ACTION_KEYS.map((actionKey) =>
    evaluatePermissionAction(userId, resourceKey, actionKey, { scopeId: null, projection }),
  ));
  const values = new Map<PermissionActionKey, boolean>(
    WORK_TASK_ACTION_KEYS.map((actionKey, index) => [actionKey, checks[index] ?? false]),
  );
  return {
    canRead: Boolean(values.get("read")),
    canCreate: Boolean(values.get("create")),
    canUpdate: Boolean(values.get("update")),
    canDelete: Boolean(values.get("delete")),
    canArchive: Boolean(values.get("archive")),
    canSubmit: Boolean(values.get("submit")),
    canApprove: Boolean(values.get("approve") || values.get("reject")),
    canManagePermissions: Boolean(values.get("grant")),
  };
}

async function listActiveMemberDepartmentIds(userId: number, departmentIds: number[]) {
  const rows = await prisma.eDP.findMany({
    where: currentOpenEndedDateWhere({
      departmentId: { in: departmentIds },
      employee: { userId, employments: { some: currentEmploymentDateWhere() } },
      department: { isArchived: false },
    }),
    select: { departmentId: true },
  });
  return Array.from(new Set(rows.map((row) => row.departmentId).filter((id): id is number => Boolean(id))));
}

async function listDepartmentWorkAssigneeIds(userId: number, departmentIds: number[]) {
  const rows = await prisma.departmentWorkAssignee.findMany({
    where: { userId, kind: "task", departmentId: { in: departmentIds } },
    select: { departmentId: true },
  });
  return Array.from(new Set(rows.map((row) => row.departmentId)));
}

async function listScopedDepartmentTaskActionMap(
  userId: number,
  resourceKey: string,
  departmentIds: number[],
) {
  const targetIds = new Set(departmentIds);
  const actionMap = new Map<number, Set<PermissionActionKey>>();
  const prefix = "department:";
  const [positionIds, userDepartmentIds] = await Promise.all([
    getUserPositionIds(userId),
    getUserDepartmentIds(userId),
  ]);
  const [userRows, positionRows, departmentRows] = await Promise.all([
    prisma.userResourceActionGrant.findMany({
      where: {
        userId,
        resource: { key: resourceKey },
        actionKey: { in: [...PERMISSION_ACTION_KEYS] },
        scopeId: { startsWith: prefix },
      },
      select: { actionKey: true, scopeId: true },
    }),
    positionIds.length ? prisma.positionResourceActionGrant.findMany({
      where: {
        positionId: { in: positionIds },
        resource: { key: resourceKey },
        actionKey: { in: [...PERMISSION_ACTION_KEYS] },
        scopeId: { startsWith: prefix },
      },
      select: { actionKey: true, scopeId: true },
    }) : Promise.resolve([]),
    userDepartmentIds.length ? prisma.departmentResourceActionGrant.findMany({
      where: {
        departmentId: { in: userDepartmentIds },
        resource: { key: resourceKey },
        actionKey: { in: [...PERMISSION_ACTION_KEYS] },
        scopeId: { startsWith: prefix },
      },
      select: { actionKey: true, scopeId: true },
    }) : Promise.resolve([]),
  ]);

  for (const row of [...userRows, ...positionRows, ...departmentRows]) {
    if (!isPermissionActionKey(row.actionKey)) continue;
    const id = Number(row.scopeId?.slice(prefix.length));
    if (!Number.isInteger(id) || !targetIds.has(id)) continue;
    const actionKeys = actionMap.get(id) ?? new Set<PermissionActionKey>();
    actionKeys.add(row.actionKey);
    actionMap.set(id, actionKeys);
  }

  return new Map(Array.from(actionMap, ([id, actionKeys]) => [id, actionsFromKeys(resourceKey, [...actionKeys])]));
}

function isPermissionActionKey(value: string): value is PermissionActionKey {
  return (PERMISSION_ACTION_KEYS as readonly string[]).includes(value);
}

function allWorkTaskActions(): WorkTaskScopedActionPermissions {
  return {
    canRead: true,
    canCreate: true,
    canUpdate: true,
    canDelete: true,
    canArchive: true,
    canSubmit: true,
    canApprove: true,
    canManagePermissions: true,
  };
}

function emptyWorkTaskActions(): WorkTaskScopedActionPermissions {
  return {
    canRead: false,
    canCreate: false,
    canUpdate: false,
    canDelete: false,
    canArchive: false,
    canSubmit: false,
    canApprove: false,
    canManagePermissions: false,
  };
}

function actionsFromKeys(resourceKey: string, actionKeys: PermissionActionKey[]): WorkTaskScopedActionPermissions {
  const grants = new Set(actionKeys);
  const allows = (actionKey: PermissionActionKey) =>
    actionKeys.some((grantedActionKey) => actionImplies(grantedActionKey, actionKey));
  return {
    ...emptyWorkTaskActions(),
    canRead: allows("read"),
    canCreate: grants.has("create"),
    canUpdate: grants.has("update"),
    canDelete: grants.has("delete"),
    canArchive: grants.has("archive"),
    canSubmit: grants.has("submit"),
    canApprove: grants.has("approve") || grants.has("reject"),
    canManagePermissions: grants.has("grant") && resourceKey !== "work.tasks",
  };
}

function mergeWorkTaskActions(...items: WorkTaskScopedActionPermissions[]): WorkTaskScopedActionPermissions {
  return items.reduce((merged, item) => ({
    canRead: merged.canRead || item.canRead,
    canCreate: merged.canCreate || item.canCreate,
    canUpdate: merged.canUpdate || item.canUpdate,
    canDelete: merged.canDelete || item.canDelete,
    canArchive: merged.canArchive || item.canArchive,
    canSubmit: merged.canSubmit || item.canSubmit,
    canApprove: merged.canApprove || item.canApprove,
    canManagePermissions: merged.canManagePermissions || item.canManagePermissions,
  }), emptyWorkTaskActions());
}

async function getUserPositionIds(userId: number): Promise<number[]> {
  const rows = await prisma.eDP.findMany({
    where: { employee: { userId } },
    select: { positionId: true },
  });
  return rows.map((row) => row.positionId).filter((id): id is number => id !== null);
}

async function getUserDepartmentIds(userId: number): Promise<number[]> {
  const rows = await prisma.eDP.findMany({
    where: { employee: { userId } },
    select: { departmentId: true },
  });
  return Array.from(new Set(rows.map((row) => row.departmentId).filter((id): id is number => id !== null)));
}
