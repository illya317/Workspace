import { NextResponse } from "next/server";
import { authenticate, checkHRAccess, checkHRWrite, checkHRDelete } from "@/lib/auth";
import { getPositionCodes, upsertPositionCode, deletePositionCode } from "@workspace/hr/server/position-codes";

export async function GET(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await checkHRAccess(payload.userId, "access", "people.roster"))) return NextResponse.json({ error: "无权限" }, { status: 403 });

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
  if (!(await checkHRWrite(payload.userId, "people.roster"))) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const body = await request.json();
  if (!body.code || !body.name) return NextResponse.json({ error: "缺少参数" }, { status: 400 });

  const result = await upsertPositionCode(body, payload.userId);
  return NextResponse.json(result);
}

export async function DELETE(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await checkHRDelete(payload.userId, "people.roster"))) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  if (!code) return NextResponse.json({ error: "缺少code" }, { status: 400 });

  const result = await deletePositionCode(code);
  return NextResponse.json(result);
}
