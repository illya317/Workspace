import {
  PERMISSION_ACTION_KEYS,
  actionImplies,
  type PermissionActionKey,
} from "./permission-actions";
import { isPermissionActionSupported } from "./permission-resource-policy";
import { isRegisteredSpaceResourceKey } from "./space-registry";

export function isPermissionActionGrantable(
  resourceKey: string | null | undefined,
  actionKey: PermissionActionKey,
) {
  if (!resourceKey) return false;
  if (!isPermissionActionSupported(resourceKey, actionKey)) return false;
  if (isRegisteredSpaceResourceKey(resourceKey)) return actionKey === "entry";
  return true;
}

export function getGrantablePermissionActions(resourceKey: string | null | undefined) {
  return PERMISSION_ACTION_KEYS.filter((actionKey) => isPermissionActionGrantable(resourceKey, actionKey));
}

export function permissionGrantContributesToAction(
  resourceKey: string | null | undefined,
  grantActionKey: PermissionActionKey,
  actionKey: PermissionActionKey,
) {
  if (isRegisteredSpaceResourceKey(resourceKey)) return actionKey === "entry";
  return actionImplies(grantActionKey, actionKey);
}
