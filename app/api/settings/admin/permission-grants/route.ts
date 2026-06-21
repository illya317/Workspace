import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApiAccess, isSuperAdmin, getManageableResourceKeys, canManageResourceGrant } from "@workspace/platform/server/auth";
import { isResourceEnabled } from "@workspace/platform/effective-module-registry";
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
  const auth = await requireAdminApiAccess(request);
  if (!auth.ok) return auth.response;
  const payload = auth.user;

  const isSysAdmin = await isSuperAdmin(payload.userId);
  const manageableKeys = await getManageableResourceKeys(payload.userId);

  if (!isSysAdmin && manageableKeys.size === 0) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const subjectType = (searchParams.get("subjectType") || "user") as SubjectType;
  const resourceKey = searchParams.get("resourceKey") || undefined;
  const scopeId = searchParams.get("scopeId") || undefined;

  const empty = { subjects: [], directGrants: [], positionGrants: [], departmentGrants: [], ancestorResourceKeys: [], maxRoleKey: "admin", isSystemAdmin: false };
  if (resourceKey && !isResourceEnabled(resourceKey)) return NextResponse.json(empty);
  if (!isSysAdmin && resourceKey && !manageableKeys.has(resourceKey)) return NextResponse.json(empty);

  const data = await getPermissionGrantData(subjectType, resourceKey, scopeId ?? null);

  let maxRoleKey = "admin";
  if (resourceKey) {
    const { getResourceMaxRole } = await import("@workspace/platform/server/auth");
    maxRoleKey = await getResourceMaxRole(resourceKey);
  }

  return NextResponse.json({
    ...data, maxRoleKey, isSystemAdmin: isSysAdmin,
  });
}

export async function PUT(request: Request) {
  const auth = await requireAdminApiAccess(request);
  if (!auth.ok) return auth.response;
  const payload = auth.user;

  const parsedBody = permissionGrantSchema.safeParse(await request.json());
  if (!parsedBody.success) {
    return NextResponse.json({ error: "参数错误: 需要 subjectType, subjectId, resourceKey, roleKey, value" }, { status: 400 });
  }

  const { subjectType, subjectId, resourceKey, roleKey, value, scopeId } = parsedBody.data;
  if (!isResourceEnabled(resourceKey)) {
    return NextResponse.json({ error: "模块未启用，不能配置该资源权限" }, { status: 403 });
  }

  if (roleKey === "admin") {
    const isSysAdmin = await isSuperAdmin(payload.userId);
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
