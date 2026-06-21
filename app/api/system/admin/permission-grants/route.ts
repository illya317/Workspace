import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticate, authorize } from "@workspace/platform/server/auth";
import {
  getManageableResourceKeys,
  canManageResourceGrant,
} from "@workspace/platform/server/auth";
import { getPermissionGrantData } from "@workspace/hr/server/permission-subjects";
import type { SubjectType } from "@workspace/platform/server/auth";

const subjectTypeSchema = z.enum(["user", "department", "position"]);

const permissionGrantSchema = z.object({
  subjectType: subjectTypeSchema,
  subjectId: z.coerce.number().int().positive(),
  resourceKey: z.string().trim().min(1),
  roleKey: z.string().trim().min(1),
  value: z.boolean(),
  scopeId: z.string().nullable().optional(),
});

export async function GET(request: Request) {
  const payload = await authenticate(request);
  if (!payload) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const isSysAdmin = await authorize({ user: payload.userId, resourceKey: "system", action: "admin" });
  const manageableKeys = await getManageableResourceKeys(payload.userId);

  if (!isSysAdmin && manageableKeys.size === 0) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const subjectType = (searchParams.get("subjectType") || "user") as SubjectType;
  const resourceKey = searchParams.get("resourceKey") || undefined;
  const scopeId = searchParams.get("scopeId") || undefined;

  const empty = { subjects: [], directGrants: [], positionGrants: [], departmentGrants: [], ancestorResourceKeys: [], maxRoleKey: "admin", isSystemAdmin: false, systemAdminBusinessBypass: false };
  if (!isSysAdmin && resourceKey && !manageableKeys.has(resourceKey)) return NextResponse.json(empty);

  const data = await getPermissionGrantData(subjectType, resourceKey, scopeId ?? null);

  // 附上当前资源及祖先的 maxRoleKey
  let maxRoleKey = "admin";
  if (resourceKey) {
    const { getResourceMaxRole } = await import("@workspace/platform/server/auth");
    maxRoleKey = await getResourceMaxRole(resourceKey);
  }

  // Batch 5.1: bypass toggle for frontend matrix display
  const { isSystemAdminBypassEnabled } = await import("@workspace/platform/server/auth");
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

  const parsedBody = permissionGrantSchema.safeParse(await request.json());
  if (!parsedBody.success) {
    return NextResponse.json({ error: "参数错误: 需要 subjectType, subjectId, resourceKey, roleKey, value" }, { status: 400 });
  }

  const { subjectType, subjectId, resourceKey, roleKey, value, scopeId } = parsedBody.data;

  // Only system.admin can grant/revoke admin role
  if (roleKey === "admin") {
    const isSysAdmin = await authorize({ user: payload.userId, resourceKey: "system", action: "admin" });
    if (!isSysAdmin) {
      return NextResponse.json({ error: "仅系统管理员可管理 admin 权限" }, { status: 403 });
    }
  }

  const canManage = await canManageResourceGrant(
    payload.userId,
    resourceKey,
    roleKey
  );
  if (!canManage) return NextResponse.json({ error: "无权限管理该资源权限" }, { status: 403 });

  if (value) {
    const { isRoleAllowedForResource, getResourceMaxRole } = await import("@workspace/platform/server/auth");
    if (!(await isRoleAllowedForResource(resourceKey, roleKey))) {
      const max = await getResourceMaxRole(resourceKey);
      const labels: Record<string, string> = { access: "访问", write: "编辑", delete: "删除", admin: "管理" };
      return NextResponse.json({ error: `该资源最高仅支持 ${labels[max] || max}` }, { status: 400 });
    }
  }

  try {
    const { setGrant } = await import("@workspace/platform/server/auth");
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
