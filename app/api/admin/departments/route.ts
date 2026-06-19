import { NextResponse } from "next/server";
import { z } from "zod";

import { deleteAdminDepartment, listAdminDepartments } from "@workspace/hr/server/admin-departments";
import { authenticate, authorize } from "@workspace/platform/server/auth";

const deleteDepartmentSchema = z.object({
  departmentId: z.coerce.number().int().positive(),
});

async function canAdminSystem(userId: number) {
  return authorize({ user: userId, resourceKey: "system", action: "admin" });
}

export async function GET(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await canAdminSystem(payload.userId))) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  return NextResponse.json(await listAdminDepartments());
}

export async function DELETE(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await canAdminSystem(payload.userId))) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const parsed = deleteDepartmentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "缺少 departmentId" }, { status: 400 });
  }

  const result = await deleteAdminDepartment(parsed.data.departmentId);
  if (!result.success) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result);
}
