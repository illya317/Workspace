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
import { agentPolicyAllowsActions } from "../agent-permission-policy";
import { getSystemConfig } from "./system-config";
import { setKickedCookie } from "../auth-cookies";

async function identityCanUseContract(userId: number, contract: ApiContract) {
  const authorization = contract.authorization;
  if (!authorization.resourceKey) return false;
  if (authorization.runtimeEnforcement === "serviceDelegated") {
    return canEnterResource(userId, authorization.resourceKey);
  }
  for (const action of authorization.requiredActions) {
    const allowed = action === "entry" && !authorization.scopeId
      ? await canEnterResource(userId, authorization.resourceKey)
      : await evaluatePermissionAction(userId, authorization.resourceKey, action, {
          scopeId: authorization.scopeId ?? undefined,
          projection: authorization.projection,
        });
    if (!allowed) return false;
  }
  return true;
}

async function authorizeAgentApiDelegation(payload: AuthPayload, contract: ApiContract) {
  const delegation = payload.agentDelegation;
  if (!delegation || payload.userId !== delegation.requesterId) return false;
  if (
    contract.apiKind !== "business"
    || contract.access !== "protected"
    || !contract.pathPrefix.startsWith("/api/modules/")
  ) return false;
  const { agentAllowedActions } = await getSystemConfig();
  if (!agentPolicyAllowsActions(contract.requiredActions, agentAllowedActions)) return false;
  if (delegation.profileId !== null && contract.runtimeEnforcement === "serviceDelegated") return false;
  const identities = delegation.requesterId === delegation.actorId
    ? [delegation.requesterId]
    : [delegation.requesterId, delegation.actorId];
  const checks = await Promise.all(identities.map((userId) => identityCanUseContract(userId, contract)));
  return checks.every(Boolean);
}

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
    setKickedCookie(response);
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

  if (payload.agentDelegation && (
    contract.apiKind !== "business"
    || contract.access !== "protected"
    || !contract.pathPrefix.startsWith("/api/modules/")
  )) {
    return { ok: false, response: jsonError("Agent delegation is limited to protected business APIs", 403) };
  }

  if (contract.apiKind === "business") {
    const allowed = await requireBusinessApiActions(payload.userId, contract);
    if (!allowed) return { ok: false, response: jsonError("无权限", 403) };
    if (payload.agentDelegation && !(await authorizeAgentApiDelegation(payload, contract))) {
      return { ok: false, response: jsonError("Agent API 委托权限无效", 403) };
    }
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
