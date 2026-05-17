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
  // Check old ReportGroupAdmin table
  const oldAdmin = await prisma.reportGroupAdmin.findUnique({
    where: { reportGroupId_userId: { reportGroupId: groupId, userId } },
  });
  if (oldAdmin) return true;
  // Check new ReportGroupMembership with role="admin"
  const membership = await prisma.reportGroupMembership.findUnique({
    where: { userId_reportGroupId: { userId, reportGroupId: groupId } },
  });
  return membership?.role === "admin";
}

export async function isAnyGroupAdmin(userId: number) {
  // Check old ReportGroupAdmin
  const oldCount = await prisma.reportGroupAdmin.count({
    where: { userId },
  });
  if (oldCount > 0) return true;
  // Check new ReportGroupMembership with role="admin"
  const newCount = await prisma.reportGroupMembership.count({
    where: { userId, role: "admin" },
  });
  return newCount > 0;
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
  // Check old tables
  const [isAdmin, isMember, isViewer] = await Promise.all([
    isGroupAdmin(payload.userId, groupId),
    prisma.reportGroupMember.findUnique({
      where: { reportGroupId_userId: { reportGroupId: groupId, userId: payload.userId } },
    }).then(Boolean),
    prisma.reportGroupViewer.findUnique({
      where: { reportGroupId_userId: { reportGroupId: groupId, userId: payload.userId } },
    }).then(Boolean),
  ]);
  if (isAdmin || isMember || isViewer) {
    return { error: null, status: 200, payload };
  }
  // Check new ReportGroupMembership (any role = access)
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
  // Check old tables
  const [isAdmin, isMember] = await Promise.all([
    isGroupAdmin(payload.userId, groupId),
    prisma.reportGroupMember.findUnique({
      where: { reportGroupId_userId: { reportGroupId: groupId, userId: payload.userId } },
    }).then(Boolean),
  ]);
  if (isAdmin || isMember) {
    return { error: null, status: 200, payload };
  }
  // Check new ReportGroupMembership (admin or member role)
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
// New permission system helpers (coexist with old booleans)
// ============================================================

// Helper: get permission ID by key
async function getPermissionId(key: string): Promise<number | null> {
  const perm = await prisma.permission.findUnique({ where: { key } });
  return perm?.id ?? null;
}

// Check if a user has a specific permission (system/module level)
export async function checkPermission(userId: number, permKey: string): Promise<boolean> {
  const permId = await getPermissionId(permKey);
  if (!permId) return false;
  const perm = await prisma.userPermission.findUnique({
    where: { userId_permissionId: { userId, permissionId: permId } },
  });
  return !!perm;
}

// Get all permissions for a user, organized by category
export async function getUserPermissions(userId: number) {
  const grants = await prisma.userPermission.findMany({
    where: { userId },
    include: {
      permission: {
        include: { category: true },
      },
    },
    orderBy: { permission: { category: { sortOrder: "asc" } } },
  });
  return grants;
}

// Get user's report group memberships
export async function getUserReportGroupMemberships(userId: number) {
  return prisma.reportGroupMembership.findMany({
    where: { userId },
    include: { reportGroup: { select: { id: true, name: true } } },
  });
}

// Get user's department admin assignments
export async function getUserDepartmentAdmins(userId: number) {
  return prisma.departmentAdmin.findMany({
    where: { userId },
    include: { department: { select: { id: true, name: true, company: true } } },
  });
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
  const membership = await prisma.reportGroupMembership.findUnique({
    where: { userId_reportGroupId: { userId, reportGroupId: groupId } },
  });
  return !!membership;
}

// Check if user can submit to a report group (admin or member, NOT viewer)
export async function canSubmitToReportGroup(userId: number, groupId: number): Promise<boolean> {
  const membership = await prisma.reportGroupMembership.findUnique({
    where: { userId_reportGroupId: { userId, reportGroupId: groupId } },
  });
  return membership?.role === "admin" || membership?.role === "member";
}
