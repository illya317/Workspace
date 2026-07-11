import type { WorkflowCategoryKey } from "./workflow-category-registry";

export const WORKFLOW_MANAGEMENT_ROOT_RESOURCE_KEY = "settings.admin.workflow";
const WORKFLOW_CATEGORY_RESOURCE_PREFIX = `${WORKFLOW_MANAGEMENT_ROOT_RESOURCE_KEY}.category.`;
const WORKFLOW_ACTION_RESOURCE_PREFIX = `${WORKFLOW_MANAGEMENT_ROOT_RESOURCE_KEY}.action.`;

export function workflowCategoryManagementResourceKey(categoryKey: WorkflowCategoryKey) {
  return `${WORKFLOW_CATEGORY_RESOURCE_PREFIX}${categoryKey}`;
}

export function workflowActionManagementResourceKey(businessActionKey: string) {
  return `${WORKFLOW_ACTION_RESOURCE_PREFIX}${businessActionKey}`;
}

export function isWorkflowManagementResourceKey(resourceKey: string | null | undefined) {
  return Boolean(resourceKey && (
    resourceKey === WORKFLOW_MANAGEMENT_ROOT_RESOURCE_KEY
    || resourceKey.startsWith(WORKFLOW_CATEGORY_RESOURCE_PREFIX)
    || resourceKey.startsWith(WORKFLOW_ACTION_RESOURCE_PREFIX)
  ));
}
