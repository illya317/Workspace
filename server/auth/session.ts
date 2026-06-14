import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { verifyToken, getPermissionContext, checkPermissionWithContext } from "@/lib/auth";
import { getManageableResourceKeys } from "@/server/rbac/admin-scope";
import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/lib/types";

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
      erpnextUserId: true,
      erpnextUsername: true,
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

  const { getVisibleResourceKeys } = await import("@/server/rbac/visibility");
  const { ensureGrantCache } = await import("@/server/rbac/context");
  await ensureGrantCache(ctx); // preload all grants → checkPermissionWithContext hits in-memory fast path

  const [visibleAccess, visibleWrite] = await Promise.all([
    getVisibleResourceKeys(ctx, "access"),
    getVisibleResourceKeys(ctx, "write"),
  ]);

  const canAnyWeek = await checkPermissionWithContext(ctx, "work.report", "write");

  const manageableKeys = await getManageableResourceKeys(payload.userId);

  return {
    ...userWithPerms,
    isWorkListAdmin: isAdmin,
    isSuperAdmin: isAdmin,
    canSelectAnyWeek: canAnyWeek,
    visibleResourceKeys: [...visibleAccess],
    visibleWriteResourceKeys: [...visibleWrite],
    manageableResourceKeys: [...manageableKeys],
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
