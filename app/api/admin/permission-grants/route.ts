import { NextResponse } from "next/server";
import { authenticate, checkPermission } from "@/lib/auth";
import {
  getManageableResourceKeys,
  canManageResourceGrant,
} from "@/server/rbac/admin-scope";
import { getPermissionGrantData } from "@/server/services/admin/permission-subjects";
import type { SubjectType } from "@/server/rbac/grants";

export async function GET(request: Request) {
  const payload = await authenticate(request);
  if (!payload) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const isSysAdmin = await checkPermission(payload.userId, "system", "admin");
  const manageableKeys = await getManageableResourceKeys(payload.userId);

  if (!isSysAdmin && manageableKeys.size === 0) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const subjectType = (searchParams.get("subjectType") || "user") as SubjectType;
  const resourceKey = searchParams.get("resourceKey") || undefined;
  const scopeId = searchParams.get("scopeId") || undefined;

  // Non-admin clicking un-manageable resource: return empty, not 403
  if (!isSysAdmin && resourceKey && !manageableKeys.has(resourceKey)) {
    return NextResponse.json({ subjects: [], directGrants: [], positionGrants: [], departmentGrants: [], ancestorResourceKeys: [], maxRoleKey: "admin", isSystemAdmin: false, systemAdminBusinessBypass: false });
  }

  const data = await getPermissionGrantData(subjectType, resourceKey, scopeId ?? null);

  // 附上当前资源及祖先的 maxRoleKey
  let maxRoleKey = "admin";
  if (resourceKey) {
    const { getResourceMaxRole } = await import("@/server/rbac/maxRole");
    maxRoleKey = await getResourceMaxRole(resourceKey);
  }

  // Batch 5.1: bypass toggle for frontend matrix display
  const { isSystemAdminBypassEnabled } = await import("@/server/rbac/bypass");
  const bypassEnabled = await isSystemAdminBypassEnabled();

  return NextResponse.json({
    ...data, maxRoleKey, isSystemAdmin: isSysAdmin,
    systemAdminBusinessBypass: bypassEnabled,
  });
}

export async function PUT(request: Request) {
  const payload = await authenticate(request);
  if (!payload) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const body = await request.json();
  const { subjectType, subjectId, resourceKey, roleKey, value, scopeId } = body;

  if (
    !subjectType ||
    !subjectId ||
    !resourceKey ||
    !roleKey ||
    typeof value !== "boolean"
  ) {
    return NextResponse.json(
      {
        error: "参数错误: 需要 subjectType, subjectId, resourceKey, roleKey, value",
      },
      { status: 400 }
    );
  }

  // Only system.admin can grant/revoke admin role
  if (roleKey === "admin") {
    const isSysAdmin = await checkPermission(payload.userId, "system", "admin");
    if (!isSysAdmin) {
      return NextResponse.json({ error: "仅系统管理员可管理 admin 权限" }, { status: 403 });
    }
  }

  const canManage = await canManageResourceGrant(
    payload.userId,
    resourceKey,
    roleKey
  );
  if (!canManage) {
    return NextResponse.json(
      { error: "无权限管理该资源权限" },
      { status: 403 }
    );
  }

  // 检查 role 是否超过资源允许的最高角色
  if (value) {
    const { isRoleAllowedForResource } = await import("@/server/rbac/maxRole");
    const allowed = await isRoleAllowedForResource(resourceKey, roleKey);
    if (!allowed) {
      const { getResourceMaxRole } = await import("@/server/rbac/maxRole");
      const max = await getResourceMaxRole(resourceKey);
      return NextResponse.json(
        { error: `该资源最高仅支持 ${max === "access" ? "访问" : max === "write" ? "编辑" : max === "delete" ? "删除" : "管理"}` },
        { status: 400 }
      );
    }
  }

  try {
    const { setGrant } = await import("@/server/rbac/grants");
    await setGrant(
      subjectType as SubjectType,
      subjectId,
      resourceKey,
      roleKey,
      value,
      {
        actorUserId: payload.userId,
        scopeId: scopeId ?? null,
      }
    );
    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "操作失败";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}