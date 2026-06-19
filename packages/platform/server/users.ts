import bcrypt from "bcryptjs";
import { randomInt } from "crypto";

import {
  listUsersWithEffectiveResourceRoles,
  resourceRoleExists,
  setGrant,
} from "./auth";
import { prisma } from "./prisma";

export type CreateAdminUserInput = {
  name: string;
  username?: string | null;
};

export type AdminUserField = "canLogin" | "name" | "username" | "employeeId";

export type UpdateAdminUserFieldInput = {
  userId: number;
  field: AdminUserField;
  value: unknown;
};

export type UpdateAdminUserGrantInput = {
  userId: number;
  resourceKey: string;
  roleKey: string;
  value: boolean;
};

export type UpdateAdminUserGrantResult =
  | { success: true }
  | { success: false; status: number; error: string };

const PASSWORD_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

function randomPassword(length = 10): string {
  let result = "";
  for (let index = 0; index < length; index += 1) {
    result += PASSWORD_CHARS.charAt(randomInt(PASSWORD_CHARS.length));
  }
  return result;
}

export async function listAdminUsers() {
  return listUsersWithEffectiveResourceRoles();
}

export async function createAdminUser(input: CreateAdminUserInput) {
  return prisma.user.create({
    data: {
      name: input.name,
      username: input.username || null,
      canLogin: true,
    },
  });
}

export async function updateAdminUserField(input: UpdateAdminUserFieldInput) {
  await prisma.user.update({
    where: { id: input.userId },
    data: {
      [input.field]: input.field === "canLogin" ? Boolean(input.value) : input.value || null,
    },
  });
  return { success: true };
}

export async function updateAdminUserGrant(
  input: UpdateAdminUserGrantInput,
): Promise<UpdateAdminUserGrantResult> {
  if (!(await resourceRoleExists(input.resourceKey, input.roleKey))) {
    return { success: false, status: 400, error: "无效资源或角色" };
  }

  await setGrant("user", input.userId, input.resourceKey, input.roleKey, input.value, {
    scopeId: null,
  });
  return { success: true };
}

export async function resetAdminUserPassword(userId: number) {
  const password = randomPassword();
  await prisma.user.update({
    where: { id: userId },
    data: {
      password: bcrypt.hashSync(password, 10),
      sessionVersion: { increment: 1 },
    },
  });
  return { success: true, password };
}
