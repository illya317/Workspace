import type { PermissionActionKey } from "./permission-actions";
import { permissionGrantContributesToAction } from "./permission-action-grantability";

export const DEFAULT_RESOURCE_ACTIONS = {
  "settings.account": "read",
  docs: "read",
  "docs.company": "read",
  news: "create",
} as const satisfies Record<string, PermissionActionKey>;

const DEFAULT_ACCESS_RESOURCE_KEYS = Object.keys(DEFAULT_RESOURCE_ACTIONS);

export function isDefaultAccessResource(resourceKey: string | undefined | null) {
  return Boolean(resourceKey && DEFAULT_ACCESS_RESOURCE_KEYS.includes(resourceKey));
}

export function getDefaultResourceAction(resourceKey: string | undefined | null) {
  if (!resourceKey) return null;
  return DEFAULT_RESOURCE_ACTIONS[resourceKey as keyof typeof DEFAULT_RESOURCE_ACTIONS] ?? null;
}

export function defaultResourceActionAllows(
  resourceKey: string | undefined | null,
  actionKey: PermissionActionKey,
) {
  const defaultAction = getDefaultResourceAction(resourceKey);
  return Boolean(
    defaultAction
    && permissionGrantContributesToAction(resourceKey, defaultAction, actionKey),
  );
}
