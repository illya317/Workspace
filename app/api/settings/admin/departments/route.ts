import { NextResponse } from "next/server";
import { z } from "zod";

import { deleteAdminDepartment, listAdminDepartments } from "@workspace/hr/server/admin-departments";
import { requireAdminApiAccess, isSuperAdmin } from "@workspace/platform/server/auth";
import { jsonErrorResponse } from "@workspace/platform/server/api";

const deleteDepartmentSchema = z.object({
  departmentId: z.coerce.number().int().positive(),
});

async function canAdminSystem(userId: number) {
  return isSuperAdmin(userId);
}

export async function GET(request: Request) {
  const auth = await requireAdminApiAccess(request);
  if (!auth.ok) return auth.response;
  const payload = auth.user;
  if (!(await canAdminSystem(payload.userId))) {
    return jsonErrorResponse("无权限", 403);
  }

  return NextResponse.json(await listAdminDepartments());
}

export async function DELETE(request: Request) {
  const auth = await requireAdminApiAccess(request);
  if (!auth.ok) return auth.response;
  const payload = auth.user;
  if (!(await canAdminSystem(payload.userId))) {
    return jsonErrorResponse("无权限", 403);
  }

  const parsed = deleteDepartmentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return jsonErrorResponse("缺少 departmentId", 400);
  }

  const result = await deleteAdminDepartment(parsed.data.departmentId);
  if (!result.success) return jsonErrorResponse(result.error, result.status);
  return NextResponse.json(result);
}
