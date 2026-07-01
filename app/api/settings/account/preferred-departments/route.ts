import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonErrorResponse } from "@workspace/platform/server/api";
import { requireApiAccess } from "@workspace/platform/server/auth";
import {
  getUserPreferredDepartmentSettings,
  updateUserPreferredDepartmentIds,
} from "@workspace/platform/server/user-preferences";

const updatePreferredDepartmentsSchema = z.object({
  departmentIds: z.array(z.number().int().positive()).max(3),
});

export async function GET(request: Request) {
  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;

  const settings = await getUserPreferredDepartmentSettings(auth.user.userId);
  return NextResponse.json(settings);
}

export async function PUT(request: Request) {
  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = updatePreferredDepartmentsSchema.safeParse(body);
  if (!parsed.success) return jsonErrorResponse("参数错误", 400);

  try {
    const preferredDepartmentIds = await updateUserPreferredDepartmentIds(auth.user.userId, parsed.data.departmentIds);
    return NextResponse.json({ success: true, preferredDepartmentIds });
  } catch (error) {
    return jsonErrorResponse(error instanceof Error ? error.message : "保存常用部门失败", 400);
  }
}
