import { NextResponse } from "next/server";
import { z } from "zod";
import { routeIdParamsSchema } from "@workspace/platform/server/api";
import {
  addDepartmentAdmin,
  listDepartmentAdmins,
  removeDepartmentAdmin,
} from "@workspace/platform/server/department-admins";
import { requireAdminApiAccess } from "@workspace/platform/server/auth";

const departmentAdminBodySchema = z.object({
  departmentId: z.coerce.number().int().positive(),
  userId: z.coerce.number().int().positive(),
});

// GET - 获取所有部门及其管理员
export async function GET(request: Request) {
  const auth = await requireAdminApiAccess(request);
  if (!auth.ok) return auth.response;

  const { departments, admins } = await listDepartmentAdmins();
  return NextResponse.json({ departments, admins });
}

// PUT - 添加部门管理员
export async function PUT(request: Request) {
  const auth = await requireAdminApiAccess(request);
  if (!auth.ok) return auth.response;

  const parsed = departmentAdminBodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "缺少参数" }, { status: 400 });

  const result = await addDepartmentAdmin(parsed.data);
  if (!result.success) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result);
}

// DELETE - 删除部门管理员
export async function DELETE(request: Request) {
  const auth = await requireAdminApiAccess(request);
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const parsed = routeIdParamsSchema.safeParse(Object.fromEntries(searchParams));
  if (!parsed.success) return NextResponse.json({ error: "缺少id" }, { status: 400 });

  return NextResponse.json(await removeDepartmentAdmin(parsed.data.id));
}
