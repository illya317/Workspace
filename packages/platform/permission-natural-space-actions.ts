import { PERMISSION_ACTION_KEYS, type PermissionActionKey } from "./permission-actions";
import { getPermissionResourceActionPolicy } from "./permission-resource-policy";

export type NaturalSpaceActionProfile = "read" | "allBusiness";

export function getNaturalSpaceActionProfileActionKeys(
  resourceKey: string,
  profile: NaturalSpaceActionProfile,
): PermissionActionKey[] {
  const supportedActions = new Set(getPermissionResourceActionPolicy(resourceKey)?.supportedActions ?? []);
  if (profile === "read") {
    if (supportedActions.has("read")) return ["read"];
    return supportedActions.has("entry") ? ["entry"] : [];
  }
  return PERMISSION_ACTION_KEYS.filter((actionKey) =>
    actionKey !== "grant" && supportedActions.has(actionKey)
  );
}
