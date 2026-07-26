import {
  businessSpaceScopeId,
  canManageScopedPermissionGrant,
} from "@workspace/platform/server/business-space-permissions";
import { prisma } from "@workspace/platform/server/prisma";
import { currentEmploymentDateWhere } from "@workspace/platform/server/relation-registry";
import { evaluatePermissionAction } from "@workspace/platform/server/auth";
import { getUserPreferredDepartmentIds } from "@workspace/platform/server/user-preferences";
import { getUserPreferredProjectIds } from "./project-preferences";
import {
  buildVisibleProjectWhere,
  getEffectiveWorkTaskActionPermissions,
  getWorkTaskPermissionProjection,
  getWorkTaskPermissionResourceKey,
  normalizeWorkTargetType,
  type WorkSpaceTargetType,
} from "./access";
import { getWorkDepartmentSpacePermissionMap } from "./department-space-access";
import { listStandardOrganizationSpaceSeeds } from "./standard-space-seeds";
import { resolveWorkTaskActionRuntimes } from "./work-task-action-runtime";

export type WorkTaskSpace = {
  targetType: WorkSpaceTargetType;
  targetId: number;
  name: string;
  subtitle: string | null;
  lifecycleStatus: "active" | "archived" | "inactive";
  actionPermissions: WorkTaskScopedActionPermissions;
  actionRuntimes: Awaited<ReturnType<typeof resolveWorkTaskActionRuntimes>>;
  counts: { objective: number; keyResult: number; task: number; archived: number };
};

export type WorkTaskScopedActionPermissions = {
  canRead: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  canArchive: boolean;
  canSubmit: boolean;
  canApprove: boolean;
  canManagePermissions: boolean;
};

type SpaceSeed = {
  targetType: WorkSpaceTargetType;
  targetId: number;
  name: string;
  subtitle: string | null;
  lifecycleStatus: WorkTaskSpace["lifecycleStatus"];
};

export async function listWorkTaskSpaces(userId: number): Promise<{ spaces: WorkTaskSpace[]; preferredDepartmentIds: number[]; preferredProjectIds: number[] }> {
  const [user, organizationSpaces, projectSpaces, preferredDepartmentIds, preferredProjectIds] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        employees: {
          select: {
            name: true,
            employments: { where: currentEmploymentDateWhere(), select: { id: true } },
          },
        },
      },
    }),
    listStandardOrganizationSpaceSeeds(),
    listProjectSpaceSeeds(userId),
    getUserPreferredDepartmentIds(userId),
    getUserPreferredProjectIds(userId),
  ]);

  const organizationPermissionMap = await getWorkDepartmentSpacePermissionMap(
    userId,
    organizationSpaces.map((space) => space.targetId),
  );
  const readableOrganizationSpaces = organizationSpaces.filter((space) =>
    organizationPermissionMap.get(space.targetId)?.canRead
  );

  const seeds = dedupeSeeds([
    {
      targetType: "personal",
      targetId: userId,
      name: user?.employees[0]?.name || "我的工作",
      subtitle: "个人工作台",
      lifecycleStatus: user && user.employees.length > 0 && !user.employees.some((employee) => employee.employments.length > 0) ? "inactive" : "active",
    },
    ...readableOrganizationSpaces.map(taskSpaceSeed),
    ...projectSpaces,
  ]);
  const countMap = await getSpaceCountsMap(seeds);

  const spaces = await Promise.all(seeds.map(async (seed) => {
    const actionPermissions = seed.targetType === "department"
      ? organizationPermissionMap.get(seed.targetId) ?? emptyScopedActionPermissions()
      : await getEffectiveWorkTaskActionPermissions(userId, seed.targetType, seed.targetId);
    if (!actionPermissions.canRead) return null;
    const actionRuntimes = await resolveWorkTaskActionRuntimes(userId, seed, actionPermissions);
    return {
      ...seed,
      actionPermissions,
      actionRuntimes,
      counts: countMap.get(spaceKey(seed.targetType, seed.targetId)) ?? emptyCounts(),
    };
  }));

  return {
    spaces: spaces.filter((space): space is WorkTaskSpace => Boolean(space)),
    preferredDepartmentIds,
    preferredProjectIds,
  };
}

function taskSpaceSeed(space: {
  targetType: SpaceSeed["targetType"];
  targetId: number;
  name: string;
  subtitle: string | null;
  lifecycleStatus: "active" | "archived";
}): SpaceSeed {
  return {
    targetType: space.targetType,
    targetId: space.targetId,
    name: space.name,
    subtitle: space.subtitle,
    lifecycleStatus: space.lifecycleStatus,
  };
}

async function listProjectSpaceSeeds(userId: number): Promise<SpaceSeed[]> {
  const visibleWhere = await buildVisibleProjectWhere(userId);
  const projects = await prisma.project.findMany({
    where: {
      ...visibleWhere,
      isArchived: false,
      workspaceEnabled: true,
    },
    select: {
      id: true,
      code: true,
      name: true,
      projectLevel: true,
    },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: 12,
  });
  return projects.map((project) => ({
    targetType: "project" as const,
    targetId: project.id,
    name: project.name,
    subtitle: [project.code, project.projectLevel].filter(Boolean).join(" · ") || "项目空间",
    lifecycleStatus: "active" as const,
  }));
}

function dedupeSeeds(seeds: SpaceSeed[]) {
  const seen = new Set<string>();
  return seeds.filter((seed) => {
    const key = `${seed.targetType}:${seed.targetId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function emptyCounts() {
  return { objective: 0, keyResult: 0, task: 0, archived: 0 };
}

function emptyScopedActionPermissions(): WorkTaskScopedActionPermissions {
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

function spaceKey(targetType: string, targetId: number) {
  return `${targetType}:${targetId}`;
}

export function workTaskScopeId(targetType: string, targetId: number) {
  return businessSpaceScopeId(normalizeWorkTargetType(targetType), targetId);
}

export async function getWorkTaskScopedActionPermissions(
  userId: number,
  targetType: string,
  targetId: number,
): Promise<WorkTaskScopedActionPermissions> {
  const scopeId = workTaskScopeId(targetType, targetId);
  const resourceKey = getWorkTaskPermissionResourceKey(targetType);
  const projection = getWorkTaskPermissionProjection(targetType);
  const [canRead, canCreate, canUpdate, canDelete, canArchive, canSubmit, canApprove, canReject, canManagePermissions] = await Promise.all([
    evaluatePermissionAction(userId, resourceKey, "read", { scopeId, projection }),
    evaluatePermissionAction(userId, resourceKey, "create", { scopeId, projection }),
    evaluatePermissionAction(userId, resourceKey, "update", { scopeId, projection }),
    evaluatePermissionAction(userId, resourceKey, "delete", { scopeId, projection }),
    evaluatePermissionAction(userId, resourceKey, "archive", { scopeId, projection }),
    evaluatePermissionAction(userId, resourceKey, "submit", { scopeId, projection }),
    evaluatePermissionAction(userId, resourceKey, "approve", { scopeId, projection }),
    evaluatePermissionAction(userId, resourceKey, "reject", { scopeId, projection }),
    canManageScopedPermissionGrant(userId, resourceKey, scopeId),
  ]);
  return {
    canRead: canRead || canCreate || canUpdate || canDelete || canArchive || canSubmit || canApprove || canReject,
    canCreate,
    canUpdate,
    canDelete,
    canArchive,
    canSubmit,
    canApprove: canApprove || canReject,
    canManagePermissions,
  };
}

export async function canManageWorkTaskPermissionResource(
  userId: number,
  targetType: string,
  targetId: number,
  resourceKey: string,
) {
  const scopeId = workTaskScopeId(targetType, targetId);
  return canManageScopedPermissionGrant(userId, resourceKey, scopeId);
}

async function getSpaceCountsMap(seeds: SpaceSeed[]) {
  const map = new Map<string, WorkTaskSpace["counts"]>();
  for (const seed of seeds) map.set(spaceKey(seed.targetType, seed.targetId), emptyCounts());
  if (seeds.length === 0) return map;

  const rows = await prisma.workItem.groupBy({
    by: ["targetType", "targetId", "itemType", "isArchived"],
    where: {
      OR: seeds.map((seed) => ({ targetType: seed.targetType, targetId: seed.targetId })),
      plan: { kind: "okr" },
    },
    _count: { _all: true },
  });

  for (const row of rows) {
    if (row.targetId == null) continue;
    const counts = map.get(spaceKey(row.targetType, row.targetId));
    if (!counts) continue;
    if (row.isArchived) {
      counts.archived += row._count._all;
    } else if (row.itemType === "objective") {
      counts.objective += row._count._all;
    } else if (row.itemType === "key_result") {
      counts.keyResult += row._count._all;
    } else {
      counts.task += row._count._all;
    }
  }
  return map;
}
