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
  // Check both old boolean AND new UserPermission
  if (user?.isWorkListAdmin) {
    return { error: null, status: 200, payload };
  }
  const hasAdminPerm = await checkPermission(payload.userId, "system.admin");
  if (hasAdminPerm) {
    return { error: null, status: 200, payload };
  }
  return { error: "无权限", status: 403, payload: null };
}

export async function isGroupAdmin(userId: number, groupId: number) {
  const grant = await prisma.userResourceRole.findFirst({
    where: {
      userId,
      resource: { key: "report_group" },
      role: { key: "admin" },
      scopeId: String(groupId),
    },
  });
  return !!grant;
}

export async function isAnyGroupAdmin(userId: number) {
  const count = await prisma.userResourceRole.count({
    where: {
      userId,
      resource: { key: "report_group" },
      role: { key: "admin" },
    },
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
  // New: system admin bypass
  const superAdmin = await prisma.userResourceRole.findFirst({
    where: {
      userId: payload.userId,
      resource: { key: "system" },
      role: { key: "access" },
      scopeId: null,
    },
  });
  if (superAdmin) {
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
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { isWorkListAdmin: true },
  });
  if (user?.isWorkListAdmin) {
    return { error: null, status: 200, payload };
  }
  // Also check new system.admin permission
  const isSuperAdmin = await checkPermission(payload.userId, "system.admin");
  if (isSuperAdmin) {
    return { error: null, status: 200, payload };
  }
  // Check UserResourceRole(report_group, scopeId=groupId) — any role grants access
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
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { isWorkListAdmin: true },
  });
  if (user?.isWorkListAdmin) {
    return { error: null, status: 200, payload };
  }
  // Also check new system.admin permission
  const isSuperAdmin = await checkPermission(payload.userId, "system.admin");
  if (isSuperAdmin) {
    return { error: null, status: 200, payload };
  }
  // Check UserResourceRole(report_group, admin|member, scopeId=groupId)
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
        wxUserId: user.wxUserId,
        name: user.name,
        departmentId: user.departmentId,
        departmentName: user.departmentName,
      };
    }
  }

  return null;
}

// ============================================================
// New RBAC0 permission system helpers
// ============================================================

// Known role keys — used to parse "resourceKey.roleKey" strings
const KNOWN_ROLES = ["access", "admin", "write", "read", "member", "viewer"];

function parsePermKey(permKey: string): { resourceKey: string; roleKey: string } {
  // Try to split on a known role suffix: "system.admin" → resource="system", role="admin"
  for (const role of KNOWN_ROLES) {
    if (permKey.endsWith(`.${role}`)) {
      const resourceKey = permKey.slice(0, -(role.length + 1));
      return { resourceKey, roleKey: role };
    }
  }
  // No known role suffix: treat whole key as resource, default role="access"
  // e.g. "module.hr" → resource="module.hr", role="access"
  return { resourceKey: permKey, roleKey: "access" };
}

// Check if a user has a specific resource+role grant (e.g. "system.admin", "module.hr")
export async function checkPermission(userId: number, permKey: string): Promise<boolean> {
  const parsed = parsePermKey(permKey);
  const grant = await prisma.userResourceRole.findFirst({
    where: {
      userId,
      resource: { key: parsed.resourceKey },
      role: { key: parsed.roleKey },
      scopeId: null, // global toggle only; scoped assignments don't count here
    },
  });
  return !!grant;
}

// Get all UserResourceRole grants for a user
export async function getUserPermissions(userId: number) {
  return prisma.userResourceRole.findMany({
    where: { userId },
    include: {
      resource: true,
      role: true,
    },
    orderBy: { resource: { sortOrder: "asc" } },
  });
}

// Get user's report group memberships (via UserResourceRole, resource="report_group")
export async function getUserReportGroupMemberships(userId: number) {
  return prisma.userResourceRole.findMany({
    where: {
      userId,
      resource: { key: "report_group" },
      role: { key: { in: ["admin", "member", "viewer"] } },
    },
    select: {
      id: true,
      scopeId: true,
      role: { select: { key: true } },
    },
  });
}

// Get user's department admin assignments (via UserResourceRole, resource="department", role="admin")
export async function getUserDepartmentAdmins(userId: number) {
  return prisma.userResourceRole.findMany({
    where: {
      userId,
      resource: { key: "department" },
      role: { key: "admin" },
    },
    include: {
      resource: true,
      role: true,
    },
  });
}

// Check if the request is from a system admin (isWorkListAdmin or UserResourceRole system.access)
// Convenience wrapper that handles authenticate + admin check
export async function isAdmin(request: Request): Promise<boolean> {
  const payload = await authenticate(request);
  if (!payload) return false;
  return isSuperAdmin(payload.userId);
}

// Backward compat: check if user is super admin
export async function isSuperAdmin(userId: number): Promise<boolean> {
  // Check both old boolean AND new UserPermission
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isWorkListAdmin: true },
  });
  if (user?.isWorkListAdmin) return true;
  return checkPermission(userId, "system.admin");
}

// Check if user has any access to a report group (admin, member, OR viewer)
export async function canAccessReportGroup(userId: number, groupId: number): Promise<boolean> {
  const grant = await prisma.userResourceRole.findFirst({
    where: {
      userId,
      resource: { key: "report_group" },
      scopeId: String(groupId),
    },
  });
  return !!grant;
}

// Check if user can submit to a report group (admin or member, NOT viewer)
export async function canSubmitToReportGroup(userId: number, groupId: number): Promise<boolean> {
  const grant = await prisma.userResourceRole.findFirst({
    where: {
      userId,
      resource: { key: "report_group" },
      role: { key: { in: ["admin", "member"] } },
      scopeId: String(groupId),
    },
  });
  return !!grant;
}
