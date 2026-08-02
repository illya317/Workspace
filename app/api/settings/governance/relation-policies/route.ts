import { NextResponse } from "next/server";

import { jsonErrorResponse } from "@workspace/platform/server/api";
import { isSuperAdmin, requireApiAccess } from "@workspace/platform/server/auth";
import {
  RelationPolicyManagementConflictError,
  RelationPolicyManagementNotFoundError,
  RelationPolicyManagementValidationError,
  listRelationPolicyManagementCatalog,
  mutateRelationPolicyManagement,
} from "@workspace/settings/server/relation-policy-management";
import { relationPolicyPatchSchema } from "@workspace/settings/server/relation-policy-route-schema";

async function requireRoot(request: Request) {
  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth;
  if (!(await isSuperAdmin(auth.user.userId))) {
    return { ok: false as const, response: jsonErrorResponse("无权限", 403) };
  }
  return auth;
}

export async function GET(request: Request) {
  const auth = await requireRoot(request);
  if (!auth.ok) return auth.response;
  try {
    return NextResponse.json(await listRelationPolicyManagementCatalog());
  } catch (error) {
    console.error("relation policy catalog load failed", error);
    return jsonErrorResponse("加载关系策略失败", 500);
  }
}

export async function PATCH(request: Request) {
  const auth = await requireRoot(request);
  if (!auth.ok) return auth.response;
  const parsed = relationPolicyPatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonErrorResponse("关系策略参数无效", 400);
  try {
    return NextResponse.json(await mutateRelationPolicyManagement(parsed.data, auth.user.userId));
  } catch (error) {
    if (error instanceof RelationPolicyManagementNotFoundError) {
      return jsonErrorResponse(error.message, 404);
    }
    if (error instanceof RelationPolicyManagementConflictError) {
      return jsonErrorResponse(error.message, 409);
    }
    if (error instanceof RelationPolicyManagementValidationError) {
      return jsonErrorResponse(error.message, 422);
    }
    console.error("relation policy update failed", error);
    return jsonErrorResponse("关系策略更新失败", 500);
  }
}
