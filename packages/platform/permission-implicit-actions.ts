import type { PermissionActionKey } from "./permission-actions";
import { getPermissionResourceActionPolicy } from "./permission-resource-policy";
import { isRegisteredSpaceResourceKey } from "./space-registry";

export function getImplicitAllResourceAdminActionKeys(resourceKey: string): PermissionActionKey[] {
  if (isRegisteredSpaceResourceKey(resourceKey)) return ["entry"];
  const supportedActions = getPermissionResourceActionPolicy(resourceKey)?.supportedActions ?? [];
  return supportedActions.filter((actionKey) =>
    actionKey !== "grant" &&
    !(resourceKey === "settings.admin" && actionKey === "entry")
  );
}

export function getImplicitAllResourceGrantActionKeys(resourceKey: string): PermissionActionKey[] {
  if (isRegisteredSpaceResourceKey(resourceKey)) return [];
  const supportedActions = getPermissionResourceActionPolicy(resourceKey)?.supportedActions ?? [];
  return supportedActions.includes("grant") ? ["grant"] : [];
}
