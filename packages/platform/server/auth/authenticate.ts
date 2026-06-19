import { prisma } from "@workspace/platform/server/prisma";
import { verifyToken, getTokenFromCookie } from "../auth-token";
import { authorize } from "./authorize";

export async function authenticate(request: Request) {
  // 1. Cookie token (web)
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

  // 2. API Key + Username (bot/API接入)
  const apiKey = request.headers.get("X-API-Key");
  const username = request.headers.get("X-Username");

  if (apiKey && username) {
    const user = await prisma.user.findUnique({ where: { username } });
    if (user && user.apiKey === apiKey) {
      if (!user.canLogin) return null;
      if (!(await authorize({ user: user.id, resourceKey: "system.api", action: "access" }))) return null;
      return {
        userId: user.id,
        wxUserId: user.wxUserId ?? "",
        name: user.name,
        departmentId: 0,
      };
    }
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
