import { NextResponse } from "next/server";
import { authenticate, checkHRAccess, checkHRWrite } from "@workspace/platform/server/auth";
import {
  getPositionDescriptionByCode,
  getPositionDescriptionTree,
  listPositionDescriptions,
  updatePositionDescription,
} from "@workspace/hr/server";

function serviceResponse<T>(result: { ok: true; data: T } | { ok: false; error: string; status?: number }) {
  if (result.ok) return NextResponse.json(result.data);
  return NextResponse.json({ error: result.error }, { status: result.status ?? 400 });
}

export async function GET(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await checkHRAccess(payload.userId, "access", "people.roster"))) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  if (searchParams.get("tree") === "1") return NextResponse.json(await getPositionDescriptionTree());
  if (code) return serviceResponse(await getPositionDescriptionByCode(code));
  return NextResponse.json(await listPositionDescriptions(searchParams.get("search") || ""));
}

export async function PUT(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await checkHRWrite(payload.userId, "people.roster"))) return NextResponse.json({ error: "无权限" }, { status: 403 });

  return serviceResponse(await updatePositionDescription(await request.json(), payload.userId));
}
