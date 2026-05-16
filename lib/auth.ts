import { SignJWT, jwtVerify } from "jose";
import { prisma } from "./prisma";

const secret = new TextEncoder().encode(
  process.env.NEXTAUTH_SECRET || "weekly-report-secret-key-2026"
);

export async function createToken(payload: {
  userId: number;
  wxUserId: string;
  name: string;
  departmentId: number;
  departmentName?: string | null;
}) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("7d")
    .setIssuedAt()
    .sign(secret);
}

export async function verifyToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, secret, {
      clockTolerance: 60,
    });
    return payload as unknown as {
      userId: number;
      wxUserId: string;
      name: string;
      departmentId: number;
      departmentName?: string | null;
    };
  } catch {
    return null;
  }
}

export function getTokenFromCookie(request: Request) {
  const cookie = request.headers.get("cookie");
  if (!cookie) return null;
  const match = cookie.match(/token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export type AuthPayload = {
  userId: number;
  wxUserId: string;
  name: string;
  departmentId: number;
  departmentName?: string | null;
};

export async function requireAdmin(request: Request) {
  const payload = await authenticate(request);
  if (!payload) {
    return { error: "未登录", status: 401, payload: null };
  }
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { isWorkListAdmin: true },
  });
  if (!user?.isWorkListAdmin) {
    return { error: "无权限", status: 403, payload: null };
  }
  return { error: null, status: 200, payload };
}

export async function isGroupAdmin(userId: number, groupId: number) {
  const admin = await prisma.reportGroupAdmin.findUnique({
    where: { reportGroupId_userId: { reportGroupId: groupId, userId } },
  });
  return !!admin;
}

export async function isAnyGroupAdmin(userId: number) {
  const count = await prisma.reportGroupAdmin.count({
    where: { userId },
  });
  return count > 0;
}

export async function requireGroupAdmin(request: Request, groupId: number) {
  const payload = await authenticate(request);
  if (!payload) {
    return { error: "未登录", status: 401, payload: null };
  }
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { isWorkListAdmin: true },
  });
  if (user?.isWorkListAdmin) {
    return { error: null, status: 200, payload };
  }
  const isAdmin = await isGroupAdmin(payload.userId, groupId);
  if (!isAdmin) {
    return { error: "无权限", status: 403, payload: null };
  }
  return { error: null, status: 200, payload };
}

export async function authenticate(
  request: Request
): Promise<AuthPayload | null> {
  // 1. 先尝试 Cookie token 认证（网页版）
  const token = getTokenFromCookie(request);
  if (token) {
    const payload = await verifyToken(token);
    if (payload) {
      const user = await prisma.user.findUnique({
        where: { id: payload.userId },
        select: { canLogin: true },
      });
      if (user?.canLogin === false) return null;
      return payload;
    }
  }

  // 2. 尝试 API Key + Username + Password 认证（机器人接入）
  const apiKey = request.headers.get("X-API-Key");
  const username = request.headers.get("X-Username");
  const password = request.headers.get("X-Password");

  if (apiKey && username && password) {
    const user = await prisma.user.findUnique({
      where: { username },
    });

    if (user && user.password === password && user.apiKey === apiKey && user.canLogin !== false) {
      return {
        userId: user.id,
        wxUserId: user.wxUserId,
        name: user.name,
        departmentId: user.departmentId,
        departmentName: user.departmentName,
      };
    }
  }

  return null;
}
