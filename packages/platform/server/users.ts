import {
  setSubjectPermissionActionGrant,
  listUsersWithEffectiveResourceRoles,
} from "./auth";
import { isPermissionActionKey } from "../permission-actions";
import { isPermissionActionSupported } from "../permission-resource-policy";
import { rotateUserApiKey } from "./personal-api-key";
import { prisma } from "./prisma";

export type CreateAdminUserInput = {
  username: string;
  employeeId?: string | null;
};

export type AdminUserField = "canLogin" | "username" | "employeeId";

export type UpdateAdminUserFieldInput = {
  userId: number;
  field: AdminUserField;
  value: unknown;
};

export type UpdateAdminUserGrantInput = {
  userId: number;
  resourceKey: string;
  actionKey: string;
  value: boolean;
};

export type UpdateAdminUserGrantResult =
  | { success: true }
  | { success: false; status: number; error: string };

export type UpdateAdminUserFieldResult =
  | { success: true }
  | { success: false; status: number; error: string };

export async function listAdminUsers() {
  return listUsersWithEffectiveResourceRoles();
}

export async function createAdminUser(input: CreateAdminUserInput) {
  const username = normalizeRequiredText(input.username);
  const employeeId = normalizeNullableText(input.employeeId);
  const duplicate = await validateUsernameAvailable(0, username);
  if (duplicate) throw new Error(duplicate);
  const employeeError = await validateEmployeeAccountLink(0, employeeId);
  if (employeeError) throw new Error(employeeError);
  return prisma.user.create({
    data: {
      username,
      employeeId,
      canLogin: true,
    },
  });
}

function normalizeRequiredText(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) throw new Error("用户名不能为空");
  return text;
}

function normalizeNullableText(value: unknown) {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

async function validateUsernameAvailable(userId: number, username: string) {
  const duplicate = await prisma.user.findFirst({
    where: { username, ...(userId > 0 ? { id: { not: userId } } : {}) },
    select: { id: true },
  });
  return duplicate ? "用户名已被使用" : null;
}

async function validateEmployeeAccountLink(userId: number, employeeId: string | null) {
  if (!employeeId) return null;

  const [duplicateUser, employee] = await Promise.all([
    prisma.user.findFirst({
      where: { employeeId, id: { not: userId } },
      select: { id: true, username: true },
    }),
    prisma.employee.findUnique({
      where: { employeeId },
      select: { userId: true, name: true },
    }),
  ]);

  if (duplicateUser) {
    return `工号 ${employeeId} 已绑定账号 ${duplicateUser.username}`;
  }
  if (employee?.userId && employee.userId !== userId) {
    return `工号 ${employeeId} 已绑定员工 ${employee.name} 的账号`;
  }
  return null;
}

export async function updateAdminUserField(input: UpdateAdminUserFieldInput): Promise<UpdateAdminUserFieldResult> {
  if (input.field === "employeeId") {
    const value = normalizeNullableText(input.value);
    const error = await validateEmployeeAccountLink(input.userId, value);
    if (error) return { success: false, status: 409, error };
    await prisma.user.update({
      where: { id: input.userId },
      data: { employeeId: value },
    });
    return { success: true };
  }

  if (input.field === "canLogin") {
    await prisma.user.update({
      where: { id: input.userId },
      data: { canLogin: Boolean(input.value) },
    });
    return { success: true };
  }

  if (input.field === "username") {
    let value: string;
    try {
      value = normalizeRequiredText(input.value);
    } catch (error) {
      return { success: false, status: 400, error: error instanceof Error ? error.message : "用户名不能为空" };
    }
    const error = await validateUsernameAvailable(input.userId, value);
    if (error) return { success: false, status: 409, error };
    await prisma.user.update({
      where: { id: input.userId },
      data: { username: value },
    });
    return { success: true };
  }

  const value = normalizeNullableText(input.value);
  await prisma.user.update({
    where: { id: input.userId },
    data: { [input.field]: value },
  });
  return { success: true };
}

export async function updateAdminUserGrant(
  input: UpdateAdminUserGrantInput,
): Promise<UpdateAdminUserGrantResult> {
  if (!isPermissionActionKey(input.actionKey) || !isPermissionActionSupported(input.resourceKey, input.actionKey)) {
    return { success: false, status: 400, error: "无效资源或权限动作" };
  }

  await setSubjectPermissionActionGrant("user", input.userId, input.resourceKey, input.actionKey, input.value, {
    scopeId: null,
  });
  return { success: true };
}

export async function resetAdminUserApiKey(userId: number) {
  const apiKey = await rotateUserApiKey(userId);
  await prisma.user.update({
    where: { id: userId },
    data: { sessionVersion: { increment: 1 } },
  });
  return { success: true, apiKey };
}
