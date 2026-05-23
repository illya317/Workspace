import bcrypt from "bcryptjs";
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

// ============================================================
// Permission helpers (resource tree + position/department)
// ============================================================

async function getUserPositionIds(userId: number): Promise<number[]> {
  const eps = await prisma.eDP.findMany({
    where: { employee: { userId } },
    select: { positionId: true },
  });
  return eps.map((e: any) => e.positionId).filter((id: any): id is number => id !== null);
}

async function getUserDepartmentIds(userId: number): Promise<number[]> {
  const eps = await prisma.eDP.findMany({
    where: { employee: { userId } },
    select: { departmentId: true },
  });
  return [...new Set(eps.map((e: any) => e.departmentId).filter((id: any): id is number => id !== null))];
}

// Get all descendant resource IDs (for batch granting)
export async function getResourceDescendants(resourceId: number): Promise<number[]> {
  const ids: number[] = [resourceId];
  const children = await prisma.resource.findMany({
    where: { parentId: resourceId },
    select: { id: true },
  });
  for (const child of children) {
    const childDescendants = await getResourceDescendants(child.id);
    ids.push(...childDescendants);
  }
  return ids;
}

// ============================================================
// Core permission check — union strategy (3 tables)
// ============================================================

// RULE: system.admin bypasses everything.
// Union strategy: any of UserRole | PositionRole | DepartmentRole = allowed.
// Descendant inference: having a child resource permission implies parent access.
export async function checkPermission(
  userId: number,
  resourceKey: string,
  roleKey: string
): Promise<boolean> {
  // 0. system.admin bypass (skip if already checking system.admin itself)
  if (!(resourceKey === "system" && roleKey === "admin")) {
    const isSysAdmin = await checkPermission(userId, "system", "admin");
    if (isSysAdmin) return true;
  }

  // 1. Resolve resource
  const resource = await prisma.resource.findUnique({
    where: { key: resourceKey },
    select: { id: true },
  });
  if (!resource) return false;

  // 2. Check this resource AND all its descendants (子权限推断父权限)
  const resourceIds = await getResourceDescendants(resource.id);

  const userGrant = await prisma.userResourceRole.findFirst({
    where: {
      userId,
      resourceId: { in: resourceIds },
      role: { key: roleKey },
    },
  });
  if (userGrant) return true;

  const posIds = await getUserPositionIds(userId);
  if (posIds.length > 0) {
    const positionGrant = await prisma.positionResourceRole.findFirst({
      where: {
        positionId: { in: posIds },
        resourceId: { in: resourceIds },
        role: { key: roleKey },
      },
    });
    if (positionGrant) return true;
  }

  const deptIds = await getUserDepartmentIds(userId);
  if (deptIds.length > 0) {
    const deptGrant = await prisma.departmentResourceRole.findFirst({
      where: {
        departmentId: { in: deptIds },
        resourceId: { in: resourceIds },
        role: { key: roleKey },
      },
    });
    if (deptGrant) return true;
  }

  return false;
}

// ============================================================
// Auth checks
// ============================================================

export async function authenticate(
  request: Request
): Promise<AuthPayload | null> {
  // 1. Cookie token (web)
  const token = getTokenFromCookie(request);
  if (token) {
    const payload = await verifyToken(token);
    if (payload) {
      const canLogin = await checkPermission(payload.userId, "system", "access");
      if (!canLogin) return null;
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

// ============================================================
// Admin / group checks
// ============================================================

export async function requireAdmin(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return { error: "未登录", status: 401, payload: null };
  if (await checkPermission(payload.userId, "system", "admin")) {
    return { error: null, status: 200, payload };
  }
  return { error: "无权限", status: 403, payload: null };
}

export async function isAdmin(request: Request): Promise<boolean> {
  const payload = await authenticate(request);
  if (!payload) return false;
  return isSuperAdmin(payload.userId);
}

export async function isSuperAdmin(userId: number): Promise<boolean> {
  return checkPermission(userId, "system", "admin");
}

// ============================================================
// Permission queries (for admin UI / listing)
// ============================================================

export async function getUserPermissions(userId: number) {
  const [direct, posIds, deptIds] = await Promise.all([
    prisma.userResourceRole.findMany({
      where: { userId },
      include: { resource: true, role: true },
      orderBy: { resource: { sortOrder: "asc" } },
    }),
    getUserPositionIds(userId),
    getUserDepartmentIds(userId),
  ]);

  const result: Array<{ resource: { id: number; key: string; name: string; description: string | null; sortOrder: number; parentId: number | null }; role: { id: number; key: string; name: string; description: string | null; sortOrder: number }; scopeId: string | null }> = [...direct];

  if (posIds.length > 0) {
    const posGrants = await prisma.positionResourceRole.findMany({
      where: { positionId: { in: posIds } },
      include: { resource: true, role: true },
      orderBy: { resource: { sortOrder: "asc" } },
    });
    for (const g of posGrants) result.push({ resource: g.resource, role: g.role, scopeId: g.scopeId });
  }
  if (deptIds.length > 0) {
    const deptGrants = await prisma.departmentResourceRole.findMany({
      where: { departmentId: { in: deptIds } },
      include: { resource: true, role: true },
      orderBy: { resource: { sortOrder: "asc" } },
    });
    for (const g of deptGrants) result.push({ resource: g.resource, role: g.role, scopeId: g.scopeId });
  }

  return result;
}

export async function getUserDepartmentAdmins(userId: number) {
  const [direct, posIds, deptIds] = await Promise.all([
    prisma.userResourceRole.findMany({
      where: { userId, resource: { key: "people.org" }, role: { key: "admin" } },
      include: { resource: true, role: true },
    }),
    getUserPositionIds(userId),
    getUserDepartmentIds(userId),
  ]);

  type DeptAdmin = { resource: { id: number; key: string; name: string; description: string | null; sortOrder: number; parentId: number | null }; role: { id: number; key: string; name: string; description: string | null; sortOrder: number }; scopeId: string | null };
  const result: DeptAdmin[] = [...direct];

  if (posIds.length > 0) {
    const posGrants = await prisma.positionResourceRole.findMany({
      where: { positionId: { in: posIds }, resource: { key: "people.org" }, role: { key: "admin" } },
      include: { resource: true, role: true },
    });
    for (const g of posGrants) result.push({ resource: g.resource, role: g.role, scopeId: g.scopeId });
  }
  if (deptIds.length > 0) {
    const deptGrants = await prisma.departmentResourceRole.findMany({
      where: { departmentId: { in: deptIds }, resource: { key: "people.org" }, role: { key: "admin" } },
      include: { resource: true, role: true },
    });
    for (const g of deptGrants) result.push({ resource: g.resource, role: g.role, scopeId: g.scopeId });
  }

  return result;
}

// ============================================================
// Convenience access checkers
// ============================================================

export async function checkHRAccess(userId: number): Promise<boolean> {
  return (await checkPermission(userId, "system", "admin"))
      || (await checkPermission(userId, "people", "access"));
}

export async function checkWorksAccess(userId: number): Promise<boolean> {
  return (await checkPermission(userId, "system", "admin"))
      || (await checkPermission(userId, "work", "access"));
}
