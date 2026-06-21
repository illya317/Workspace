import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { verifyToken } from "../auth-token";
import { getPermissionContext } from "../rbac/context";
import { evaluatePermissionWithContext } from "../rbac/check";
import { getManageableResourceKeys } from "../rbac/admin-scope";
import { prisma } from "@workspace/platform/server/prisma";
import type { SessionUser } from "../../types";

async function _getCurrentUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;
  if (!token) return null;

  const payload = await verifyToken(token);
  if (!payload) return null;

  const userWithPerms = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: {
      id: true,
      name: true,
      username: true,
      wxUserId: true,
      avatar: true,
      apiKey: true,
      canLogin: true,
      sessionVersion: true,
    },
  });
  if (!userWithPerms) return null;
  if (!userWithPerms.canLogin) return null;
  if (userWithPerms.sessionVersion !== payload.sessionVersion) {
    return null;
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

  const { getVisibleResourceKeys } = await import("../rbac/visibility");
  const { ensureGrantCache } = await import("../rbac/context");
  const { RESOURCE_KEYS } = await import("@workspace/platform/resources");
  await ensureGrantCache(ctx); // preload all grants for the in-memory fast path

  const [visibleAccess, visibleWrite] = await Promise.all([
    getVisibleResourceKeys(ctx, "access"),
    getVisibleResourceKeys(ctx, "write"),
  ]);
  const activeResourceKeySet = new Set(RESOURCE_KEYS);
  const activeVisibleAccess = [...visibleAccess].filter((key) => activeResourceKeySet.has(key));
  const activeVisibleWrite = [...visibleWrite].filter((key) => activeResourceKeySet.has(key));
  const allResourceKeys = new Set([
    ...RESOURCE_KEYS,
    ...activeVisibleAccess,
    ...activeVisibleWrite,
  ]);

  const canAnyWeek = isAdmin || await evaluatePermissionWithContext(ctx, "work.reports", "write");

  const manageableKeys = await getManageableResourceKeys(payload.userId);

  return {
    ...userWithPerms,
    isWorkListAdmin: isAdmin,
    isSuperAdmin: isAdmin,
    canSelectAnyWeek: canAnyWeek,
    visibleResourceKeys: isAdmin ? [...allResourceKeys] : activeVisibleAccess,
    visibleWriteResourceKeys: isAdmin ? [...allResourceKeys] : activeVisibleWrite,
    manageableResourceKeys: isAdmin ? [...new Set([...manageableKeys, ...RESOURCE_KEYS])] : [...manageableKeys],
    employeeId: employee?.employeeId ?? null,
    isActiveEmployee,
  };
}

/** Cached per-request: layout + page can both call without double DB queries. */
export const getCurrentUser = cache(_getCurrentUser);

/** For API routes: throws on unauthenticated. */
export async function requireCurrentUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHORIZED");
  return user;
}

/** For page components: redirects to /login on unauthenticated. */
export async function requireAuth(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) {
    const { redirect } = await import("next/navigation");
    redirect("/login");
  }
  return user!;
}
