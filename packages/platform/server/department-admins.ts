import {
  deleteUserResourceRoleAssignment,
  getUserResourceRoleAssignments,
  resourceRoleExists,
  setGrant,
  userResourceRoleAssignmentExists,
} from "./auth";
import { prisma } from "./prisma";

const PEOPLE_RESOURCE_KEY = "people";
const ADMIN_ROLE_KEY = "admin";

type DepartmentAdminInput = {
  departmentId: number;
  userId: number;
};

export type AddDepartmentAdminResult =
  | { success: true }
  | { success: false; status: number; error: string };

export async function listDepartmentAdmins() {
  const [departments, admins] = await Promise.all([
    prisma.department.findMany({
      where: { level: 1 },
      select: { id: true, name: true, code: true },
      orderBy: [{ code: "asc" }, { name: "asc" }],
    }),
    getUserResourceRoleAssignments(PEOPLE_RESOURCE_KEY, ADMIN_ROLE_KEY),
  ]);

  return { departments, admins };
}

export async function addDepartmentAdmin(
  input: DepartmentAdminInput,
): Promise<AddDepartmentAdminResult> {
  if (!(await resourceRoleExists(PEOPLE_RESOURCE_KEY, ADMIN_ROLE_KEY))) {
    return { success: false, status: 500, error: "系统未初始化RBAC基础数据" };
  }

  const scopeId = String(input.departmentId);
  const existing = await userResourceRoleAssignmentExists(
    input.userId,
    PEOPLE_RESOURCE_KEY,
    ADMIN_ROLE_KEY,
    scopeId,
  );
  if (existing) return { success: false, status: 409, error: "该用户已是此部门管理员" };

  await setGrant("user", input.userId, PEOPLE_RESOURCE_KEY, ADMIN_ROLE_KEY, true, { scopeId });
  return { success: true };
}

export async function removeDepartmentAdmin(id: number) {
  await deleteUserResourceRoleAssignment(id);
  return { success: true };
}
