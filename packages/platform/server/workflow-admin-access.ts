import "server-only";

import { isSuperAdmin } from "./auth/admin";
import { getAdminResourceKeys } from "./rbac/admin-scope";
import {
  projectWorkflowManagementAccess,
} from "../workflow-management-resources";

export type WorkflowAdminAccess = {
  isSystemAdmin: boolean;
  hasFullAccess: boolean;
  allowedBusinessActionKeys: Set<string> | null;
};

export async function getWorkflowAdminAccess(userId: number): Promise<WorkflowAdminAccess> {
  if (await isSuperAdmin(userId)) {
    return {
      isSystemAdmin: true,
      hasFullAccess: true,
      allowedBusinessActionKeys: null,
    };
  }

  const adminResourceKeys = await getAdminResourceKeys(userId);
  const projected = projectWorkflowManagementAccess(adminResourceKeys);
  return {
    isSystemAdmin: false,
    ...projected,
  };
}

export function hasWorkflowAdminAccess(access: WorkflowAdminAccess) {
  return access.hasFullAccess || (access.allowedBusinessActionKeys?.size ?? 0) > 0;
}

export function canManageWorkflowBusinessAction(access: WorkflowAdminAccess, businessActionKey: string) {
  return access.hasFullAccess || access.allowedBusinessActionKeys?.has(businessActionKey) === true;
}
