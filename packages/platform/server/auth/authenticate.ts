import { prisma } from "@workspace/platform/server/prisma";
import { verifyToken, getTokenFromCookie, type AuthPayload } from "../auth-token";
import { findUserByPersonalApiKey } from "../personal-api-key";
import { evaluatePermissionAction } from "../rbac/action-grants";
import {
  AGENT_API_DELEGATION_HEADER,
  verifyAgentApiDelegation,
} from "../agent-api-delegation";

function getPersonalApiKey(request: Request) {
  return request.headers.get("x-api-key")?.trim() || null;
}

export function isProgrammaticApiRequest(request: Request) {
  return Boolean(getPersonalApiKey(request) || request.headers.get(AGENT_API_DELEGATION_HEADER)?.trim());
}

export async function authenticate(request: Request): Promise<AuthPayload | null> {
  if (request.headers.has(AGENT_API_DELEGATION_HEADER)) {
    const delegation = await verifyAgentApiDelegation(request);
    if (!delegation) return null;
    const user = await prisma.user.findUnique({
      where: { id: delegation.requesterId },
      select: { canLogin: true, sessionVersion: true, wxUserId: true },
    });
    if (!user?.canLogin) return null;
    return {
      userId: delegation.requesterId,
      wxUserId: user.wxUserId ?? "",
      departmentId: 0,
      sessionVersion: user.sessionVersion,
      agentDelegation: delegation,
    };
  }

  const token = getTokenFromCookie(request);
  if (token) {
    const payload = await verifyToken(token);
    if (payload) {
      const user = await prisma.user.findUnique({
        where: { id: payload.userId },
        select: { canLogin: true, sessionVersion: true },
      });
      if (!user || !user.canLogin) return null;
      if (user.sessionVersion !== payload.sessionVersion) return null;
      return payload;
    }
  }

  const apiKey = getPersonalApiKey(request);
  if (apiKey) {
    const user = await findUserByPersonalApiKey(apiKey);
    if (!user || !user.canLogin) return null;
    if (!(await evaluatePermissionAction(user.id, "settings.account.apiAccess", "entry"))) return null;
    return {
      userId: user.id,
      wxUserId: user.wxUserId ?? "",
      departmentId: 0,
      sessionVersion: user.sessionVersion,
    };
  }

  return null;
}

export async function isKicked(request: Request): Promise<boolean> {
  const token = getTokenFromCookie(request);
  if (!token) return false;
  const payload = await verifyToken(token);
  if (!payload) return false;
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { sessionVersion: true },
  });
  if (!user) return false;
  return user.sessionVersion !== payload.sessionVersion;
}
