import { workSpaceRoleAllows, type WorkSpaceRole } from "../access";

export function canPersistWorkSpaceRole(role: WorkSpaceRole) {
  return workSpaceRoleAllows(role, "viewer");
}
