import { prisma } from "@workspace/platform/server/prisma";
import { verifyToken, getTokenFromCookie } from "../auth-token";
import { findUserByPersonalApiKey } from "../personal-api-key";
import { evaluatePermissionAction } from "../rbac/action-grants";

function getPersonalApiKey(request: Request) {
  return request.headers.get("x-api-key")?.trim() || null;
}

export async function authenticate(request: Request) {
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
