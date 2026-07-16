import { prisma, type Prisma } from "@workspace/platform/server/prisma";
import { RESOURCE_DEFS, RESOURCE_KEYS, getCapabilityOwnerKey } from "@workspace/platform/resources";
import { isResourceEnabled } from "../../effective-module-registry";
import { getProjectedDescendantResourceIdsForRoots } from "./resource-projection";
import { getUserPositionIds, getUserDepartmentIds } from "./helpers";
import { isRootAdminUser } from "../auth/root";
import {
  getImplicitAdminResourceIdsForUser,
  getImplicitGrantResourceIdsForUser,
  isImplicitAllResourceGrantUser,
} from "./implicit-admins";
import {
  listWorkflowManagementResourceRegistrations,
} from "../../workflow-management-resources";

const AUTHORIZATION_MANAGER_ACTION_KEYS = ["grant"] as const;
const RESOURCE_CONFIGURE_ACTION_KEYS = ["configure"] as const;
const ADMIN_CONFIGURATION_RESOURCE_KEYS = [
  "settings.admin",
  ...listWorkflowManagementResourceRegistrations().map((resource) => resource.key),
];
type PermissionDatabaseClient = Prisma.TransactionClient | typeof prisma;

/**
 * Find all resource IDs where the user (or their positions/departments)
 * has been granted explicit authorization management.
 */
async function findGrantManagerResourceIds(userId: number, client: PermissionDatabaseClient): Promise<number[]> {
  const [directAction, positionAction, departmentAction] = await Promise.all([
    client.userResourceActionGrant.findMany({
      where: { userId, actionKey: { in: [...AUTHORIZATION_MANAGER_ACTION_KEYS] }, scopeId: null },
      select: { resourceId: true },
    }),
    (async () => {
      const posIds = await getUserPositionIds(userId, client);
      if (posIds.length === 0) return [] as Array<{ resourceId: number }>;
      return client.positionResourceActionGrant.findMany({
        where: { positionId: { in: posIds }, actionKey: { in: [...AUTHORIZATION_MANAGER_ACTION_KEYS] }, scopeId: null },
        select: { resourceId: true },
      });
    })(),
    (async () => {
      const deptIds = await getUserDepartmentIds(userId, client);
      if (deptIds.length === 0) return [] as Array<{ resourceId: number }>;
      return client.departmentResourceActionGrant.findMany({
        where: { departmentId: { in: deptIds }, actionKey: { in: [...AUTHORIZATION_MANAGER_ACTION_KEYS] }, scopeId: null },
        select: { resourceId: true },
      });
    })(),
  ]);

  return [
    ...new Set([
      ...directAction.map((r) => r.resourceId),
      ...positionAction.map((r) => r.resourceId),
      ...departmentAction.map((r) => r.resourceId),
    ]),
  ];
}

async function findResourceConfigureResourceIds(userId: number, client: PermissionDatabaseClient): Promise<number[]> {
  const [directAction, positionAction, departmentAction] = await Promise.all([
    client.userResourceActionGrant.findMany({
      where: { userId, actionKey: { in: [...RESOURCE_CONFIGURE_ACTION_KEYS] }, resource: { key: { in: ADMIN_CONFIGURATION_RESOURCE_KEYS } } },
      select: { resourceId: true },
    }),
    (async () => {
      const posIds = await getUserPositionIds(userId, client);
      if (posIds.length === 0) return [] as Array<{ resourceId: number }>;
      return client.positionResourceActionGrant.findMany({
        where: { positionId: { in: posIds }, actionKey: { in: [...RESOURCE_CONFIGURE_ACTION_KEYS] }, resource: { key: { in: ADMIN_CONFIGURATION_RESOURCE_KEYS } } },
        select: { resourceId: true },
      });
    })(),
    (async () => {
      const deptIds = await getUserDepartmentIds(userId, client);
      if (deptIds.length === 0) return [] as Array<{ resourceId: number }>;
      return client.departmentResourceActionGrant.findMany({
        where: { departmentId: { in: deptIds }, actionKey: { in: [...RESOURCE_CONFIGURE_ACTION_KEYS] }, resource: { key: { in: ADMIN_CONFIGURATION_RESOURCE_KEYS } } },
        select: { resourceId: true },
      });
    })(),
  ]);

  return [
    ...new Set([
      ...directAction.map((r) => r.resourceId),
      ...positionAction.map((r) => r.resourceId),
      ...departmentAction.map((r) => r.resourceId),
    ]),
  ];
}

/**
 * Return all resource keys this user is allowed to manage grants for.
 * Includes the admin resource itself and all its descendants.
 */
export async function getManageableResourceKeys(
  userId: number,
  client: PermissionDatabaseClient = prisma,
): Promise<Set<string>> {
  const activeResourceKeys = new Set(RESOURCE_KEYS.filter((key) => isResourceEnabled(key)));
  if (
    await isRootAdminUser(userId, client) ||
    await isImplicitAllResourceGrantUser(userId, client)
  ) {
    return new Set(activeResourceKeys);
  }

  const adminResourceIds = [
    ...await findGrantManagerResourceIds(userId, client),
    ...await getImplicitGrantResourceIdsForUser(userId, client),
  ];
  const manageableIds = new Set(await getProjectedDescendantResourceIdsForRoots(adminResourceIds, undefined, client));

  const resources = await client.resource.findMany({
    where: { id: { in: [...manageableIds] } },
    select: { key: true },
  });

  const manageableKeys = new Set(resources.map((r) => r.key).filter((key) => activeResourceKeys.has(key)));
  for (const resource of RESOURCE_DEFS) {
    const ownerKey = getCapabilityOwnerKey(resource.key);
    if (ownerKey && manageableKeys.has(ownerKey)) manageableKeys.add(resource.key);
  }
  return manageableKeys;
}

export async function getAdminResourceKeys(
  userId: number,
  client: PermissionDatabaseClient = prisma,
): Promise<Set<string>> {
  const activeResourceKeys = new Set(RESOURCE_KEYS.filter((key) => isResourceEnabled(key)));
  if (await isRootAdminUser(userId, client)) return new Set(activeResourceKeys);

  const adminResourceIds = [
    ...await findResourceConfigureResourceIds(userId, client),
    ...await getImplicitAdminResourceIdsForUser(userId, client),
  ];
  const adminIds = new Set(await getProjectedDescendantResourceIdsForRoots(adminResourceIds, undefined, client));

  const resources = await client.resource.findMany({
    where: { id: { in: [...adminIds] } },
    select: { key: true },
  });

  const adminKeys = new Set(resources.map((r) => r.key).filter((key) => activeResourceKeys.has(key)));
  for (const resource of RESOURCE_DEFS) {
    const ownerKey = getCapabilityOwnerKey(resource.key);
    if (ownerKey && adminKeys.has(ownerKey)) adminKeys.add(resource.key);
  }
  return adminKeys;
}

export async function hasResourceAdminAccess(userId: number, client: PermissionDatabaseClient = prisma): Promise<boolean> {
  return (await getAdminResourceKeys(userId, client)).size > 0;
}

export async function hasGlobalGrantManagementAccess(userId: number, client: PermissionDatabaseClient = prisma): Promise<boolean> {
  return (await getManageableResourceKeys(userId, client)).size > 0;
}

export function manageableResourceKeysAllowGrant(
  manageableResourceKeys: ReadonlySet<string>,
  resourceKey: string,
) {
  if (!RESOURCE_KEYS.includes(resourceKey) || !isResourceEnabled(resourceKey)) return false;
  const capabilityOwnerKey = getCapabilityOwnerKey(resourceKey);
  return manageableResourceKeys.has(resourceKey)
    || Boolean(capabilityOwnerKey && manageableResourceKeys.has(capabilityOwnerKey));
}

/**
 * Can this user manage grants for the given resourceKey + actionKey?
 */
export async function canManageResourceGrant(
  userId: number,
  resourceKey: string,
  _actionKey: string,
  client: PermissionDatabaseClient = prisma,
): Promise<boolean> {
  const activeResourceKeys = new Set(RESOURCE_KEYS.filter((key) => isResourceEnabled(key)));
  if (!activeResourceKeys.has(resourceKey)) return false;
  if (await isRootAdminUser(userId, client)) return true;
  const manageable = await getManageableResourceKeys(userId, client);
  return manageableResourceKeysAllowGrant(manageable, resourceKey);
}
