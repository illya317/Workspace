import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticate, checkHRAccess, checkHRWrite, checkHRDelete } from "@workspace/platform/server/auth";
import { getPositionCodes, upsertPositionCode, deletePositionCode } from "@workspace/hr/server/position-codes";

const upsertPositionCodeSchema = z.object({
  code: z.string().trim().min(1),
  name: z.string().trim().min(1),
  company: z.string().optional(),
  originalCode: z.string().optional(),
  departmentCode: z.string().optional(),
});

const deletePositionCodeQuerySchema = z.object({
  code: z.string().trim().min(1),
});

export async function GET(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await checkHRAccess(payload.userId, "access", "hr.roster"))) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const result = await getPositionCodes({
    companys: searchParams.get("companys") || undefined,
    company: searchParams.get("company") || undefined,
    departmentCode: searchParams.get("departmentCode") || undefined,
    positionCode: searchParams.get("positionCode") || undefined,
  });
  return NextResponse.json(result);
}

export async function PUT(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await checkHRWrite(payload.userId, "hr.roster"))) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const parsedBody = upsertPositionCodeSchema.safeParse(await request.json());
  if (!parsedBody.success) return NextResponse.json({ error: "缺少参数" }, { status: 400 });

  const result = await upsertPositionCode(parsedBody.data, payload.userId);
  return NextResponse.json(result);
}

export async function DELETE(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await checkHRDelete(payload.userId, "hr.roster"))) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const parsedQuery = deletePositionCodeQuerySchema.safeParse({ code: searchParams.get("code") });
  if (!parsedQuery.success) return NextResponse.json({ error: "缺少code" }, { status: 400 });

  const result = await deletePositionCode(parsedQuery.data.code);
  return NextResponse.json(result);
}
