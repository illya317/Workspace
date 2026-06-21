import { NextResponse } from "next/server";
import { z } from "zod";

import { requireApiAccess, authorize, isSuperAdmin } from "@workspace/platform/server/auth";
import {
  deleteDepartmentCode,
  getDepartmentCodes,
  upsertDepartmentCode,
} from "@workspace/hr/server/department-codes";

const querySchema = z.object({
  companys: z.string().optional(),
  company: z.string().optional(),
});

const upsertDepartmentCodeSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  company: z.string().optional(),
  companyCode: z.string().optional(),
  originalCode: z.string().optional(),
});

const deleteDepartmentCodeSchema = z.object({
  code: z.string().min(1),
});

async function canUseRoster(userId: number, action: "access" | "write" | "delete") {
  return (
    (await isSuperAdmin(userId)) ||
    (await authorize({ user: userId, resourceKey: "hr.roster", action })) ||
    (await authorize({ user: userId, resourceKey: "hr", action }))
  );
}

export async function GET(request: Request) {

  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;
  const payload = auth.user;
  if (!(await canUseRoster(payload.userId, "access"))) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({
    companys: searchParams.get("companys") || undefined,
    company: searchParams.get("company") || undefined,
  });
  if (!parsed.success) return NextResponse.json({ error: "参数无效" }, { status: 400 });

  return NextResponse.json(await getDepartmentCodes(parsed.data));
}

export async function PUT(request: Request) {

  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;
  const payload = auth.user;
  if (!(await canUseRoster(payload.userId, "write"))) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const parsed = upsertDepartmentCodeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "缺少参数" }, { status: 400 });

  const result = await upsertDepartmentCode(parsed.data, payload.userId);
  if (!result.success) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result);
}

export async function DELETE(request: Request) {

  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;
  const payload = auth.user;
  if (!(await canUseRoster(payload.userId, "delete"))) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const parsed = deleteDepartmentCodeSchema.safeParse({
    code: searchParams.get("code") || undefined,
  });
  if (!parsed.success) return NextResponse.json({ error: "缺少code" }, { status: 400 });

  const result = await deleteDepartmentCode(parsed.data.code);
  if (!result.success) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result);
}
