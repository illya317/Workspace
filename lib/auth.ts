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
// Permission system helpers
// ============================================================

// Helper: get all position IDs for a user
async function getUserPositionIds(userId: number): Promise<number[]> {
  const eps = await prisma.employeePosition.findMany({
    where: { employee: { userId } },
    select: { positionId: true },
  });
  return eps.map((e) => e.positionId);
}

export async function requireAdmin(request: Request) {
  const payload = await authenticate(request);
  if (!payload) {
    return { error: "未登录", status: 401, payload: null };
  }
  const isSysAdmin = await checkPermission(payload.userId, "system.admin");
  if (isSysAdmin) {
    return { error: null, status: 200, payload };
  }
  return { error: "无权限", status: 403, payload: null };
}

export async function isGroupAdmin(userId: number, groupId: number) {
  if (await checkPermission(userId, "system.admin")) return true;
  const scopeId = String(groupId);
  // Direct grant
  const direct = await prisma.userResourceRole.findFirst({
    where: {
      userId,
      resource: { key: "report_group" },
      role: { key: "admin" },
      scopeId,
      positionId: null,
    },
  });
  if (direct) return true;
  // Position-inherited grant
  const posIds = await getUserPositionIds(userId);
  if (posIds.length > 0) {
    const inherited = await prisma.userResourceRole.findFirst({
      where: {
        resource: { key: "report_group" },
        role: { key: "admin" },
        scopeId,
        positionId: { in: posIds },
      },
    });
    if (inherited) return true;
  }
  return false;
}

export async function isAnyGroupAdmin(userId: number) {
  if (await checkPermission(userId, "system.admin")) return true;
  const directCount = await prisma.userResourceRole.count({
    where: { userId, resource: { key: "report_group" }, role: { key: "admin" } },
  });
  if (directCount > 0) return true;
  const posIds = await getUserPositionIds(userId);
  if (posIds.length > 0) {
    const inheritedCount = await prisma.userResourceRole.count({
      where: { resource: { key: "report_group" }, role: { key: "admin" }, positionId: { in: posIds } },
    });
    if (inheritedCount > 0) return true;
  }
  return false;
}

export async function requireGroupAdmin(request: Request, groupId: number) {
  const payload = await authenticate(request);
  if (!payload) {
    return { error: "未登录", status: 401, payload: null };
  }
  if (await checkPermission(payload.userId, "system.admin")) {
    return { error: null, status: 200, payload };
  }
  const isAdmin = await isGroupAdmin(payload.userId, groupId);
  if (!isAdmin) {
    return { error: "无权限", status: 403, payload: null };
  }
  return { error: null, status: 200, payload };
}

// 验证用户是否有权限访问该周报部门（成员/负责人/viewer/管理员）
export async function requireGroupAccess(request: Request, groupId: number) {
  const payload = await authenticate(request);
  if (!payload) {
    return { error: "未登录", status: 401, payload: null };
  }
  if (await checkPermission(payload.userId, "system.admin")) {
    return { error: null, status: 200, payload };
  }
  const hasAccess = await canAccessReportGroup(payload.userId, groupId);
  if (hasAccess) {
    return { error: null, status: 200, payload };
  }
  return { error: "无权限访问该部门", status: 403, payload: null };
}

// 验证用户是否有权限提交该周报（成员/负责人/管理员，viewer 不行）
export async function requireGroupSubmit(request: Request, groupId: number) {
  const payload = await authenticate(request);
  if (!payload) {
    return { error: "未登录", status: 401, payload: null };
  }
  if (await checkPermission(payload.userId, "system.admin")) {
    return { error: null, status: 200, payload };
  }
  const canSubmit = await canSubmitToReportGroup(payload.userId, groupId);
  if (canSubmit) {
    return { error: null, status: 200, payload };
  }
  return { error: "无权限提交该部门周报", status: 403, payload: null };
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
        wxUserId: user.wxUserId ?? "",
        name: user.name,
        departmentId: 0,
      };
    }
  }

  return null;
}

// ============================================================
// RBAC checkPermission with position inheritance
// ============================================================

// Known role keys — used to parse "resourceKey.roleKey" strings
const KNOWN_ROLES = ["access", "admin", "write", "read", "member", "viewer"];

function parsePermKey(permKey: string): { resourceKey: string; roleKey: string } {
  for (const role of KNOWN_ROLES) {
    if (permKey.endsWith(`.${role}`)) {
      const resourceKey = permKey.slice(0, -(role.length + 1));
      return { resourceKey, roleKey: role };
    }
  }
  return { resourceKey: permKey, roleKey: "access" };
}

// Check if a user has a specific resource+role grant (e.g. "system.admin", "module.hr.access")
// Supports direct user grants AND position-inherited grants
// RULE: system.admin bypasses all checks — super admin has every permission
export async function checkPermission(userId: number, permKey: string): Promise<boolean> {
  const parsed = parsePermKey(permKey);

  // Shortcut: system.admin is all-powerful (skip if already checking system.admin itself)
  if (permKey !== "system.admin") {
    const directAdmin = await prisma.userResourceRole.findFirst({
      where: { userId, resource: { key: "system" }, role: { key: "admin" }, scopeId: null, positionId: null },
    });
    if (directAdmin) return true;
    // Also check position-inherited system.admin
    const posIds = await getUserPositionIds(userId);
    if (posIds.length > 0) {
      const inheritedAdmin = await prisma.userResourceRole.findFirst({
        where: { resource: { key: "system" }, role: { key: "admin" }, scopeId: null, positionId: { in: posIds } },
      });
      if (inheritedAdmin) return true;
    }
  }

  // 1. Direct grant: userId matches AND positionId is null (direct user grant)
  const direct = await prisma.userResourceRole.findFirst({
    where: {
      userId,
      resource: { key: parsed.resourceKey },
      role: { key: parsed.roleKey },
      scopeId: null,
      positionId: null,
    },
  });
  if (direct) return true;

  // 2. Position-inherited grant
  const eps = await prisma.employeePosition.findMany({
    where: { employee: { userId } },
    select: { positionId: true },
  });
  if (eps.length > 0) {
    const posIds = eps.map((e) => e.positionId);
    const inherited = await prisma.userResourceRole.findFirst({
      where: {
        resource: { key: parsed.resourceKey },
        role: { key: parsed.roleKey },
        scopeId: null,
        positionId: { in: posIds },
      },
    });
    if (inherited) return true;
  }

  return false;
}

// Get all UserResourceRole grants for a user (direct + position-inherited)
export async function getUserPermissions(userId: number) {
  const [directGrants, posIds] = await Promise.all([
    prisma.userResourceRole.findMany({
      where: { userId },
      include: { resource: true, role: true },
      orderBy: { resource: { sortOrder: "asc" } },
    }),
    getUserPositionIds(userId),
  ]);

  let inheritedGrants: typeof directGrants = [];
  if (posIds.length > 0) {
    inheritedGrants = await prisma.userResourceRole.findMany({
      where: { positionId: { in: posIds } },
      include: { resource: true, role: true },
      orderBy: { resource: { sortOrder: "asc" } },
    });
  }

  return [...directGrants, ...inheritedGrants];
}

// Get user's report group memberships (direct + position-inherited)
export async function getUserReportGroupMemberships(userId: number) {
  const [directGrants, posIds] = await Promise.all([
    prisma.userResourceRole.findMany({
      where: {
        userId,
        resource: { key: "report_group" },
        role: { key: { in: ["admin", "member", "viewer"] } },
      },
      select: { id: true, scopeId: true, role: { select: { key: true } } },
    }),
    getUserPositionIds(userId),
  ]);

  let inheritedGrants: typeof directGrants = [];
  if (posIds.length > 0) {
    inheritedGrants = await prisma.userResourceRole.findMany({
      where: {
        resource: { key: "report_group" },
        role: { key: { in: ["admin", "member", "viewer"] } },
        positionId: { in: posIds },
      },
      select: { id: true, scopeId: true, role: { select: { key: true } } },
    });
  }

  return [...directGrants, ...inheritedGrants];
}

// Get user's department admin assignments (direct + position-inherited)
export async function getUserDepartmentAdmins(userId: number) {
  const [directGrants, posIds] = await Promise.all([
    prisma.userResourceRole.findMany({
      where: { userId, resource: { key: "department" }, role: { key: "admin" } },
      include: { resource: true, role: true },
    }),
    getUserPositionIds(userId),
  ]);

  let inheritedGrants: typeof directGrants = [];
  if (posIds.length > 0) {
    inheritedGrants = await prisma.userResourceRole.findMany({
      where: { resource: { key: "department" }, role: { key: "admin" }, positionId: { in: posIds } },
      include: { resource: true, role: true },
    });
  }

  return [...directGrants, ...inheritedGrants];
}

// Check if the request is from a system admin
export async function isAdmin(request: Request): Promise<boolean> {
  const payload = await authenticate(request);
  if (!payload) return false;
  return isSuperAdmin(payload.userId);
}

// Check if user is system admin (has "system.admin" permission)
export async function isSuperAdmin(userId: number): Promise<boolean> {
  return checkPermission(userId, "system.admin");
}

// Check if user has any access to a report group (admin, member, OR viewer)
export async function canAccessReportGroup(userId: number, groupId: number): Promise<boolean> {
  if (await checkPermission(userId, "system.admin")) return true;
  const scopeId = String(groupId);
  // Direct grant
  const direct = await prisma.userResourceRole.findFirst({
    where: { userId, resource: { key: "report_group" }, scopeId, positionId: null },
  });
  if (direct) return true;
  // Position-inherited grant
  const posIds = await getUserPositionIds(userId);
  if (posIds.length > 0) {
    const inherited = await prisma.userResourceRole.findFirst({
      where: { resource: { key: "report_group" }, scopeId, positionId: { in: posIds } },
    });
    if (inherited) return true;
  }
  return false;
}

// Check if user can submit to a report group (admin or member, NOT viewer)
export async function canSubmitToReportGroup(userId: number, groupId: number): Promise<boolean> {
  if (await checkPermission(userId, "system.admin")) return true;
  const scopeId = String(groupId);
  // Direct grant
  const direct = await prisma.userResourceRole.findFirst({
    where: {
      userId,
      resource: { key: "report_group" },
      role: { key: { in: ["admin", "member"] } },
      scopeId,
      positionId: null,
    },
  });
  if (direct) return true;
  // Position-inherited grant
  const posIds = await getUserPositionIds(userId);
  if (posIds.length > 0) {
    const inherited = await prisma.userResourceRole.findFirst({
      where: {
        resource: { key: "report_group" },
        role: { key: { in: ["admin", "member"] } },
        scopeId,
        positionId: { in: posIds },
      },
    });
    if (inherited) return true;
  }
  return false;
}

// ============================================================
// Convenience access checkers
// ============================================================

// Check HR module access (system admin OR module.hr.access)
export async function checkHRAccess(userId: number): Promise<boolean> {
  return (await checkPermission(userId, "system.admin"))
      || (await checkPermission(userId, "module.hr.access"));
}

// Check Works module access (system admin OR module.works.access)
export async function checkWorksAccess(userId: number): Promise<boolean> {
  return (await checkPermission(userId, "system.admin"))
      || (await checkPermission(userId, "module.works.access"));
}
