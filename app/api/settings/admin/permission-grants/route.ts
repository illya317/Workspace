import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApiAccess, isSuperAdmin, getManageableResourceKeys } from "@workspace/platform/server/auth";
import { isResourceEnabled } from "@workspace/platform/effective-module-registry";
import { getPermissionGrantData } from "@workspace/hr/server/permission-subjects";
import type { SubjectType } from "@workspace/platform/server/auth";
import { jsonErrorResponse } from "@workspace/platform/server/api";
import { setPermissionGrantFromRequest } from "@workspace/platform/server/rbac/action-grant-request";

const subjectTypeSchema = z.enum(["user", "department", "position"]);

const permissionGrantSchema = z.object({
  subjectType: subjectTypeSchema,
  subjectId: z.coerce.number().int().positive(),
  resourceKey: z.string().trim().min(1),
  actionKey: z.string().trim().min(1).optional(),
  roleKey: z.string().trim().min(1).optional(),
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
    return jsonErrorResponse("无权限", 403);
  }

  const { searchParams } = new URL(request.url);
  const subjectType = (searchParams.get("subjectType") || "user") as SubjectType;
  const resourceKey = searchParams.get("resourceKey") || undefined;
  const scopeId = searchParams.get("scopeId") || undefined;

  const empty = { subjects: [], directGrants: [], positionGrants: [], departmentGrants: [], implicitGrants: [], directActionGrants: [], positionActionGrants: [], departmentActionGrants: [], ancestorResourceKeys: [], actionRecords: {}, maxRoleKey: "admin", isSystemAdmin: false };
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
    return jsonErrorResponse("参数错误: 需要 subjectType, subjectId, resourceKey, actionKey 或 roleKey, value", 400);
  }

  const input = parsedBody.data;
  try {
    const result = await setPermissionGrantFromRequest({ ...input, actorUserId: payload.userId, isSystemAdmin: await isSuperAdmin(payload.userId) });
    if (!result.ok) return jsonErrorResponse(result.error, result.status ?? 400);
    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "操作失败";
    return jsonErrorResponse(msg, 400);
  }
}
