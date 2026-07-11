import "server-only";

import type { NextResponse } from "next/server";
import { findApiContract, type ApiContract, type ApiContractAuthorization } from "../api-registry";
import type { PermissionRegistryActionKey } from "../action-registry";
import { authenticate, isKicked } from "./auth/authenticate";
import { authorize } from "./auth/authorize";
import { getAdminResourceKeys, getManageableResourceKeys } from "./rbac/admin-scope";
import { evaluatePermissionAction } from "./rbac/action-grants";
import { canEnterResource } from "./rbac/resource-entry";
import type { AuthPayload } from "./auth-token";
import { disabledApiResponseForRequest } from "./module-runtime";
import { jsonErrorResponse } from "./api";

export type ApiAccessResult =
  | {
      ok: true;
      user: AuthPayload;
      contract: ApiContract;
    }
  | {
      ok: false;
      response: Response;
    };

function jsonError(error: string, status: number): NextResponse {
  return jsonErrorResponse(error, status);
}

async function unauthenticatedResponse(request: Request) {
  if (await isKicked(request)) {
    const response = jsonError("已在其他设备登录", 401);
    response.cookies.set("kicked", "1", {
      httpOnly: false,
      secure: false,
      path: "/",
      maxAge: 60,
    });
    return response;
  }
  return jsonError("未登录", 401);
}

async function evaluateRequiredApiAction(
  userId: number,
  authorization: ApiContractAuthorization,
  actionKey: PermissionRegistryActionKey,
) {
  if (!authorization.resourceKey) return true;
  if (actionKey === "entry" && !authorization.scopeId) return canEnterResource(userId, authorization.resourceKey);
  return evaluatePermissionAction(userId, authorization.resourceKey, actionKey, {
    scopeId: authorization.scopeId ?? undefined,
    projection: authorization.projection,
  });
}

async function requireBusinessApiActions(userId: number, contract: ApiContract) {
  const authorization = contract.authorization;
  if (!authorization.resourceKey) return true;
  if (authorization.runtimeEnforcement === "serviceDelegated") {
    return canEnterResource(userId, authorization.resourceKey);
  }
  for (const actionKey of authorization.requiredActions) {
    if (!(await evaluateRequiredApiAction(userId, authorization, actionKey))) return false;
  }
  return true;
}

export async function requireApiAccess(request: Request): Promise<ApiAccessResult> {
  const url = new URL(request.url);
  const contract = findApiContract(request.method as Parameters<typeof findApiContract>[0], url.pathname, url.searchParams);
  const disabledResponse = disabledApiResponseForRequest(request);
  if (disabledResponse) return { ok: false, response: disabledResponse };
  if (!contract) {
    const status = url.pathname.startsWith("/api/modules/") ? 500 : 404;
    return { ok: false, response: jsonError("API contract not registered", status) };
  }
  if (contract.access === "disabled" || contract.access === "internal") {
    return { ok: false, response: jsonError("API contract disabled", 403) };
  }

  const payload = await authenticate(request);
  if (!payload) return { ok: false, response: await unauthenticatedResponse(request) };

  if (contract.apiKind === "business") {
    const allowed = await requireBusinessApiActions(payload.userId, contract);
    if (!allowed) return { ok: false, response: jsonError("无权限", 403) };
  }

  return { ok: true, user: payload, contract };
}

export async function requireAdminApiAccess(request: Request): Promise<ApiAccessResult> {
  const url = new URL(request.url);
  const contract = findApiContract(request.method as Parameters<typeof findApiContract>[0], url.pathname, url.searchParams);
  const disabledResponse = disabledApiResponseForRequest(request);
  if (disabledResponse) return { ok: false, response: disabledResponse };
  if (!contract) {
    return { ok: false, response: jsonError("API contract not registered", 404) };
  }
  if (contract.access === "disabled" || contract.access === "internal") {
    return { ok: false, response: jsonError("API contract disabled", 403) };
  }

  const payload = await authenticate(request);
  if (!payload) return { ok: false, response: await unauthenticatedResponse(request) };

  const allowed = await authorize({
    user: payload.userId,
    resourceKey: "settings.admin",
    action: "entry",
  });
  if (!allowed) {
    const [manageableResourceKeys, adminResourceKeys] = await Promise.all([
      getManageableResourceKeys(payload.userId),
      getAdminResourceKeys(payload.userId),
    ]);
    if (manageableResourceKeys.size === 0 && adminResourceKeys.size === 0) {
      return { ok: false, response: jsonError("无权限", 403) };
    }
  }

  return { ok: true, user: payload, contract };
}
