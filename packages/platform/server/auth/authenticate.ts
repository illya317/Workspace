import { prisma } from "@workspace/platform/server/prisma";
import { verifyToken, getTokenFromCookie } from "../auth-token";

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
