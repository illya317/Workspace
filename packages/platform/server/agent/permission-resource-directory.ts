import "server-only";

import { isResourceEnabled } from "@workspace/platform/effective-module-registry";
import { RESOURCE_DEFS } from "@workspace/platform/resources";
import { canManageResourceGrant } from "../rbac/admin-scope";
import type { AgentPermissionResourceItem } from "@workspace/platform/types";

export function listRegisteredAgentCapabilityResources() {
  return RESOURCE_DEFS
    .filter((resource) => (
      resource.kind === "capability"
      && resource.runtimeParentKey === "agent"
      && isResourceEnabled(resource.key)
    ))
    .map((resource) => ({
      key: resource.key,
      name: resource.name,
    }))
    .sort((left, right) => left.key.localeCompare(right.key));
}

export function listRegisteredAgentCapabilityKeys() {
  return listRegisteredAgentCapabilityResources().map((resource) => resource.key);
}

export async function listAgentPermissionResourcesForActor(
  actorUserId: number,
): Promise<AgentPermissionResourceItem[]> {
  return Promise.all(listRegisteredAgentCapabilityResources().map(async (resource) => ({
    ...resource,
    grantManageable: await canManageResourceGrant(actorUserId, resource.key, "grant"),
  })));
}
