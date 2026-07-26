import type { PermissionActionKey } from "./permission-actions";
import { listBusinessActionRegistrations } from "./business-action-registry";
import { activeWorkspacePackages } from "./modules";
import { isWorkflowManagementResourceKey } from "./workflow-management-resources";

function derivePageEntryResourceKeys() {
  const keys = new Set<string>();

  for (const definition of activeWorkspacePackages) {
    const moduleDef = definition.moduleDef;
    if (moduleDef?.resourceKey && moduleDef.presentation !== "headless" && moduleDef.href) {
      keys.add(moduleDef.resourceKey);
    }
    for (const child of moduleDef?.children ?? []) {
      if (child.resourceKey && child.href) keys.add(child.resourceKey);
    }
    for (const route of definition.routes ?? []) {
      if (typeof route !== "string" && route.resourceKey && route.access !== "public") {
        keys.add(route.resourceKey);
      }
    }
  }

  return keys;
}

const PAGE_ENTRY_RESOURCE_KEYS = derivePageEntryResourceKeys();

const BUSINESS_PERMISSION_ACTIONS_BY_RESOURCE = new Map<string, Set<PermissionActionKey>>();

for (const registration of listBusinessActionRegistrations()) {
  const actions = BUSINESS_PERMISSION_ACTIONS_BY_RESOURCE.get(registration.resourceKey) ?? new Set<PermissionActionKey>();
  for (const actionKey of [
    registration.directPermissionAction,
    registration.submitPermissionAction,
    registration.processPermissionAction,
  ]) {
    if (actionKey) actions.add(actionKey);
  }
  BUSINESS_PERMISSION_ACTIONS_BY_RESOURCE.set(registration.resourceKey, actions);
}

function isSpaceResourceKey(resourceKey: string) {
  return resourceKey.startsWith("space.");
}

function structuralSupportedActions(resourceKey: string): PermissionActionKey[] {
  const actions: PermissionActionKey[] = isWorkflowManagementResourceKey(resourceKey) ? [] : ["grant"];
  if (PAGE_ENTRY_RESOURCE_KEYS.has(resourceKey) || isSpaceResourceKey(resourceKey)) actions.push("entry");
  actions.push(...BUSINESS_PERMISSION_ACTIONS_BY_RESOURCE.get(resourceKey) ?? []);
  return actions;
}

function structuralExplicitOnlyActions(resourceKey: string): PermissionActionKey[] {
  const actions: PermissionActionKey[] = isWorkflowManagementResourceKey(resourceKey) ? [] : ["grant"];
  if (BUSINESS_PERMISSION_ACTIONS_BY_RESOURCE.get(resourceKey)?.has("configure")) actions.push("configure");
  return actions;
}

export function getStructuralPermissionResourceActions(resourceKey: string) {
  return {
    supportedActions: structuralSupportedActions(resourceKey),
    explicitOnlyActions: structuralExplicitOnlyActions(resourceKey),
  };
}
