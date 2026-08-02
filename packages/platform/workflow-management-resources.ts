import type { ResourceRegistration } from "@workspace/core/module-contract";
import {
  listWorkflowEligibleBusinessActions,
  type BusinessActionRegistration,
} from "./business-action-registry";
import {
  listWorkflowCategoryRegistrations,
} from "./workflow-category-registry";
import {
  WORKFLOW_MANAGEMENT_ROOT_RESOURCE_KEY,
  workflowActionManagementResourceKey,
  workflowCategoryManagementResourceKey,
} from "./workflow-management-resource-keys";

export {
  isWorkflowManagementResourceKey,
  WORKFLOW_MANAGEMENT_ROOT_RESOURCE_KEY,
  workflowActionManagementResourceKey,
  workflowCategoryManagementResourceKey,
} from "./workflow-management-resource-keys";

const workflowActions = listWorkflowEligibleBusinessActions();
const workflowActionByKey = new Map(workflowActions.map((action) => [action.key, action]));
const actionByManagementResourceKey = new Map(
  workflowActions.map((action) => [workflowActionManagementResourceKey(action.key), action]),
);

export function getWorkflowActionForManagementResource(resourceKey: string | null | undefined) {
  return resourceKey ? actionByManagementResourceKey.get(resourceKey) ?? null : null;
}

export function getWorkflowActionManagementResourceKey(businessActionKey: string) {
  return workflowActionByKey.has(businessActionKey)
    ? workflowActionManagementResourceKey(businessActionKey)
    : null;
}

export function projectWorkflowManagementAccess(resourceKeys: Iterable<string>) {
  const keys = new Set(resourceKeys);
  if (keys.has(WORKFLOW_MANAGEMENT_ROOT_RESOURCE_KEY)) {
    return { hasFullAccess: true as const, allowedBusinessActionKeys: null };
  }
  const allowedBusinessActionKeys = new Set<string>();
  for (const resourceKey of keys) {
    const action = getWorkflowActionForManagementResource(resourceKey);
    if (action) allowedBusinessActionKeys.add(action.key);
  }
  return { hasFullAccess: false as const, allowedBusinessActionKeys };
}

export function listWorkflowManagementResourceRegistrations(): ResourceRegistration[] {
  const owner = "settings.admin";
  const root: ResourceRegistration = {
    key: WORKFLOW_MANAGEMENT_ROOT_RESOURCE_KEY,
    name: "流程管理",
    kind: "capability",
    capabilityOwnerKey: owner,
    parentKey: owner,
    runtimeParentKey: owner,
    sortOrder: 40,
  };
  const categories = listWorkflowCategoryRegistrations().map((category) => ({
    key: workflowCategoryManagementResourceKey(category.key),
    name: category.label,
    kind: "capability" as const,
    capabilityOwnerKey: owner,
    parentKey: WORKFLOW_MANAGEMENT_ROOT_RESOURCE_KEY,
    runtimeParentKey: WORKFLOW_MANAGEMENT_ROOT_RESOURCE_KEY,
    sortOrder: category.sortOrder,
  }));
  const actions = workflowActions.map(workflowActionResourceRegistration);
  return [root, ...categories, ...actions];
}

function workflowActionResourceRegistration(action: BusinessActionRegistration): ResourceRegistration {
  return {
    key: workflowActionManagementResourceKey(action.key),
    name: action.label,
    kind: "capability",
    capabilityOwnerKey: "settings.admin",
    parentKey: workflowCategoryManagementResourceKey(action.workflowCategoryKey!),
    runtimeParentKey: workflowCategoryManagementResourceKey(action.workflowCategoryKey!),
    sortOrder: action.settingsSortOrder ?? 0,
  };
}
