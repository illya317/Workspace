import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { verifyToken } from "../auth-token";
import { getPermissionContext } from "../rbac/context";
import { getAdminResourceKeys, getManageableResourceKeys } from "../rbac/admin-scope";
import { prisma } from "@workspace/platform/server/prisma";
import { currentEmploymentDateWhere } from "@workspace/platform/server/relation-registry";
import { isRootAdminUser, ROOT_ADMIN_ACTOR_NAME } from "./root";
import type { SessionUser } from "../../types";
import type { AuthPayload } from "../auth-token";

async function buildSessionUser(
  userId: number,
  expectedSessionVersion?: number,
  options: { requireLogin?: boolean } = {},
): Promise<SessionUser | null> {
  const userWithPerms = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      wxUserId: true,
      avatar: true,
      apiKeyHash: true,
      employeeId: true,
      canLogin: true,
      sessionVersion: true,
    },
  });
  if (!userWithPerms) return null;
  if (options.requireLogin !== false && !userWithPerms.canLogin) return null;
  if (expectedSessionVersion != null && userWithPerms.sessionVersion !== expectedSessionVersion) {
    return null;
  }

  const employee = await prisma.employee.findFirst({
    where: {
      OR: [
        { userId },
        ...(userWithPerms.employeeId ? [{ employeeId: userWithPerms.employeeId }] : []),
      ],
    },
    select: {
      name: true,
      employeeId: true,
      employments: {
        where: currentEmploymentDateWhere(),
        select: { id: true },
        orderBy: { id: "desc" },
        take: 1,
      },
    },
  });
  const isActiveEmployee = Boolean(employee?.employments.length);

  const isAdmin = await isRootAdminUser(userId);
  const ctx = await getPermissionContext(userId);

  const { getVisibleResourceKeys } = await import("../rbac/visibility");
  const { ensureGrantCache } = await import("../rbac/context");
  const { RESOURCE_KEYS } = await import("@workspace/platform/resources");
  await ensureGrantCache(ctx); // preload all grants for the in-memory fast path

  const [visibleAccess, visibleRead, visibleUpdate, visibleSubmit, visibleConfigure] = await Promise.all([
    getVisibleResourceKeys(ctx, "entry"),
    getVisibleResourceKeys(ctx, "read"),
    getVisibleResourceKeys(ctx, "update"),
    getVisibleResourceKeys(ctx, "submit"),
    getVisibleResourceKeys(ctx, "configure"),
  ]);
  const activeResourceKeySet = new Set(RESOURCE_KEYS);
  const activeVisibleAccess = [...visibleAccess].filter((key) => activeResourceKeySet.has(key));
  const activeVisibleRead = [...visibleRead].filter((key) => activeResourceKeySet.has(key));
  const activeVisibleUpdate = [...visibleUpdate].filter((key) => activeResourceKeySet.has(key));
  const activeVisibleSubmit = [...visibleSubmit].filter((key) => activeResourceKeySet.has(key));
  const activeVisibleConfigure = [...visibleConfigure].filter((key) => activeResourceKeySet.has(key));
  const allResourceKeys = new Set([
    ...RESOURCE_KEYS,
    ...activeVisibleAccess,
    ...activeVisibleRead,
    ...activeVisibleUpdate,
    ...activeVisibleSubmit,
    ...activeVisibleConfigure,
  ]);

  const [manageableKeys, adminKeys] = await Promise.all([
    getManageableResourceKeys(userId),
    getAdminResourceKeys(userId),
  ]);

  const { apiKeyHash, ...safeUser } = userWithPerms;
  return {
    ...safeUser,
    hasApiKey: Boolean(apiKeyHash),
    isWorkListAdmin: isAdmin,
    isSuperAdmin: isAdmin,
    visibleResourceKeys: isAdmin ? [...allResourceKeys] : activeVisibleAccess,
    visibleReadResourceKeys: isAdmin ? [...allResourceKeys] : activeVisibleRead,
    visibleUpdateResourceKeys: isAdmin ? [...allResourceKeys] : activeVisibleUpdate,
    visibleSubmitResourceKeys: isAdmin ? [...allResourceKeys] : activeVisibleSubmit,
    visibleConfigureResourceKeys: isAdmin ? [...allResourceKeys] : activeVisibleConfigure,
    manageableResourceKeys: isAdmin ? [...new Set([...manageableKeys, ...RESOURCE_KEYS])] : [...manageableKeys],
    adminResourceKeys: isAdmin ? [...new Set([...adminKeys, ...RESOURCE_KEYS])] : [...adminKeys],
    employeeId: employee?.employeeId ?? userWithPerms.employeeId ?? null,
    employeeName: employee?.name ?? (isAdmin ? ROOT_ADMIN_ACTOR_NAME : null),
    isActiveEmployee,
  };
}

async function _getCurrentUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;
  if (!token) return null;

  const payload = await verifyToken(token);
  if (!payload) return null;

  return buildSessionUser(payload.userId, payload.sessionVersion);
}

/** Cached per-request: layout + page can both call without double DB queries. */
export const getCurrentUser = cache(_getCurrentUser);

export async function getSessionUserFromAuthPayload(payload: AuthPayload): Promise<SessionUser | null> {
  const expectedSessionVersion = (payload as AuthPayload & { sessionVersion?: number }).sessionVersion;
  return buildSessionUser(payload.userId, expectedSessionVersion);
}

/** Build a permission-bearing identity for a non-login virtual employee. */
export async function getAgentActorSessionUser(userId: number): Promise<SessionUser | null> {
  const user = await buildSessionUser(userId, undefined, { requireLogin: false });
  return user?.canLogin === false ? user : null;
}

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
