import "server-only";
import { cookies } from "next/headers";
import { verifyToken, checkPermission, getPermissionContext, checkPermissionWithContext } from "@/lib/auth";
import { getManageableResourceKeys } from "@/server/rbac/admin-scope";
import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/lib/types";

export async function getCurrentUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;
  if (!token) return null;

  const payload = await verifyToken(token);
  if (!payload) return null;

  const canLogin = await checkPermission(payload.userId, "system", "access");
  if (!canLogin) return null;

  const userWithPerms = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: {
      id: true,
      name: true,
      username: true,
      wxUserId: true,
      apiKey: true,
      canLogin: true,
      sessionVersion: true,
    },
  });
  if (!userWithPerms) return null;
  if (!userWithPerms.canLogin) return null;
  if (userWithPerms.sessionVersion !== payload.sessionVersion) {
    throw new Error("SESSION_KICKED");
  }

  const employee = await prisma.employee.findFirst({
    where: { userId: payload.userId },
    select: {
      employeeId: true,
      employments: {
        select: { isActive: true },
        orderBy: { id: "desc" },
        take: 1,
      },
    },
  });
  const isActiveEmployee = employee?.employments?.[0]?.isActive ?? false;

  const ctx = await getPermissionContext(payload.userId);
  const isAdmin = ctx.isAdmin;
  const [
    canAnyWeek,
    hasHRAccess,
    hasHRWrite,
    hasHRDelete,
    hasWorks,
    hasFinance,
    hasInventory,
    hasContract,
  ] = await Promise.all([
    checkPermissionWithContext(ctx, "work.report", "write"),
    checkPermissionWithContext(ctx, "people", "access"),
    checkPermissionWithContext(ctx, "people", "write"),
    checkPermissionWithContext(ctx, "people", "delete"),
    checkPermissionWithContext(ctx, "work", "access"),
    checkPermissionWithContext(ctx, "finance", "access"),
    checkPermissionWithContext(ctx, "inventory", "access"),
    checkPermissionWithContext(ctx, "contract", "access"),
  ]);

  const hasHR = hasHRAccess || hasHRWrite || hasHRDelete;

  const manageableKeys = await getManageableResourceKeys(payload.userId);
  const canManagePermissions = manageableKeys.size > 0;

  return {
    ...userWithPerms,
    isWorkListAdmin: isAdmin,
    isSuperAdmin: isAdmin,
    canSelectAnyWeek: canAnyWeek,
    canAccessHR: isAdmin || (hasHR && isActiveEmployee),
    canEditHR: isAdmin || (hasHRWrite && isActiveEmployee),
    canDeleteHR: isAdmin || (hasHRDelete && isActiveEmployee),
    canAccessWorks: hasWorks,
    canAccessFinance: hasFinance,
    canAccessInventory: hasInventory,
    canAccessContract: hasContract,
    canAccessAdmin: isAdmin || canManagePermissions,
    canManagePermissions,
    manageableResourceKeys: [...manageableKeys],
    employeeId: employee?.employeeId ?? null,
    isActiveEmployee,
  };
}

export async function requireCurrentUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("UNAUTHORIZED");
  }
  return user;
}

export async function requireHRAccess(): Promise<SessionUser> {
  const user = await requireCurrentUser();
  if (!user.canAccessHR) {
    throw new Error("FORBIDDEN");
  }
  return user;
}

export async function requireAdminAccess(): Promise<SessionUser> {
  const user = await requireCurrentUser();
  if (!user.canAccessAdmin) {
    throw new Error("FORBIDDEN");
  }
  return user;
}

export async function requireFinanceAccess(): Promise<SessionUser> {
  const user = await requireCurrentUser();
  if (!user.canAccessFinance) {
    throw new Error("FORBIDDEN");
  }
  return user;
}

export async function requireWorksAccess(): Promise<SessionUser> {
  const user = await requireCurrentUser();
  if (!user.canAccessWorks) {
    throw new Error("FORBIDDEN");
  }
  return user;
}

export async function requireContractAccess(): Promise<SessionUser> {
  const user = await requireCurrentUser();
  if (!user.canAccessContract) {
    throw new Error("FORBIDDEN");
  }
  return user;
}

export async function requireInventoryAccess(): Promise<SessionUser> {
  const user = await requireCurrentUser();
  if (!user.canAccessInventory) {
    throw new Error("FORBIDDEN");
  }
  return user;
}
