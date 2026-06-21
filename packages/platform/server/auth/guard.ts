/**
 * Unified page-level permission gates.
 *
 * Every server component facade that corresponds to a resource-scoped page
 * must use one of these instead of a bare `getCurrentUser() + redirect`.
 *
 * Usage:
 *   const user = await requireRouteAccess("/external/investors");
 *   // user is guaranteed authenticated + has visibleResourceKeys including the argument.
 */

import "server-only";
import { redirect } from "next/navigation";
import { getCurrentUser } from "./session";
import { authorize } from "./authorize";
import {
  findModuleByRoute,
  getDisabledReasonForResource,
  isResourceEnabled,
} from "../../effective-module-registry";
import type { SessionUser } from "../../types";

function redirectToDisabled(resourceKey: string, reason?: string | null): never {
  const params = new URLSearchParams({
    resourceKey,
    reason: reason ?? getDisabledReasonForResource(resourceKey) ?? "模块未启用",
  });
  redirect(`/module-disabled?${params.toString()}`);
}

/**
 * Require the user to have `resourceKey` in their visibleResourceKeys.
 * Redirects to /login if unauthenticated, /portal if unauthorized.
 */
export async function requireResourceAccess(resourceKey: string): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isResourceEnabled(resourceKey)) redirectToDisabled(resourceKey);
  if (
    !(user.visibleResourceKeys || []).includes(resourceKey) &&
    !(await authorize({ user, resourceKey, action: "access" }))
  ) redirect("/portal");
  return user;
}

/**
 * Resolve an app route through module registry and require the derived resource.
 * Page shells should use this helper instead of hard-coding resource keys.
 */
export async function requireRouteAccess(pathname: string): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const match = findModuleByRoute(pathname);
  if (!match) redirect("/portal");
  if (!match.state.enabled) redirectToDisabled(match.resourceKey, match.state.disabledReason);
  if (
    !(user.visibleResourceKeys || []).includes(match.resourceKey) &&
    !(await authorize({ user, resourceKey: match.resourceKey, action: "access" }))
  ) redirect("/portal");
  return user;
}

export async function requireAnyResourceAccess(resourceKeys: string[]): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  for (const resourceKey of resourceKeys) {
    if (!isResourceEnabled(resourceKey)) continue;
    if ((user.visibleResourceKeys || []).includes(resourceKey)) return user;
    if (await authorize({ user, resourceKey, action: "access" })) return user;
  }
  redirect("/portal");
}

/**
 * Require the user to manage at least one resource.
 * Resource admins can enter /settings/admin without broad system access.
 */
export async function requireAdminManageAccess(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.isSuperAdmin) return user;
  if ((user.manageableResourceKeys?.length ?? 0) === 0) redirect("/portal");
  return user;
}
