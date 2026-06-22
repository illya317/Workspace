import "server-only";

import { authorize, type AuthorizeAction } from "@workspace/platform/server/auth";
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

export function withOpenApiConsoleManage(handler: AuthHandler) {
  return withOpenApiConsolePermission("write", handler);
}

export async function readRouteId(params: Promise<Record<string, string>> | undefined, key = "id") {
  const resolved = await params;
  const id = Number(resolved?.[key]);
  return Number.isInteger(id) && id > 0 ? id : null;
}
