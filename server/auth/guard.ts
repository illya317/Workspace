/**
 * Unified page-level permission gates.
 *
 * Every server component facade that corresponds to a resource-scoped page
 * must use one of these instead of a bare `getCurrentUser() + redirect`.
 *
 * Usage:
 *   const user = await requireResourceAccess("external.investor");
 *   // user is guaranteed authenticated + has visibleResourceKeys including the argument.
 */

import "server-only";
import { redirect } from "next/navigation";
import { getCurrentUser } from "./session";
import type { SessionUser } from "@/lib/types";

/**
 * Require the user to have `resourceKey` in their visibleResourceKeys.
 * Redirects to /login if unauthenticated, /portal if unauthorized.
 */
export async function requireResourceAccess(resourceKey: string): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.visibleResourceKeys?.includes(resourceKey)) redirect("/portal");
  return user;
}

/**
 * HR module requires either system admin bypass or active employment.
 * Mirrors the old `canAccessHR = isAdmin || (hasHR && isActiveEmployee)` logic.
 */
export function canUseHr(user: SessionUser): boolean {
  return !!user.isSuperAdmin || !!user.isActiveEmployee;
}
