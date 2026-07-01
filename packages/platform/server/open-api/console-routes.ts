import "server-only";

import { authorize, evaluatePermissionAction, type AuthorizeAction } from "@workspace/platform/server/auth";
import type { PermissionActionKey } from "@workspace/platform/permission-actions";
import { withAuth, type AuthHandler } from "@workspace/platform/server/with-auth";

function withOpenApiConsolePermission(action: AuthorizeAction, handler: AuthHandler) {
  return withAuth(
    handler,
    (userId) => authorize({ user: userId, resourceKey: "settings.api", action }),
  );
}

export function withOpenApiConsoleAccess(handler: AuthHandler) {
  return withOpenApiConsolePermission("access", handler);
}

export function withOpenApiConsoleManage(handler: AuthHandler, action: PermissionActionKey = "write") {
  return withAuth(
    handler,
    async (userId) => {
      const [canReadConsole, canManageClients] = await Promise.all([
        authorize({ user: userId, resourceKey: "settings.api", action: "access" }),
        evaluatePermissionAction(userId, "settings.api.manage", action),
      ]);
      return canReadConsole && canManageClients;
    },
  );
}

export async function readRouteId(params: Promise<Record<string, string | string[]>> | undefined, key = "id") {
  const resolved = await params;
  const id = Number(resolved?.[key]);
  return Number.isInteger(id) && id > 0 ? id : null;
}
