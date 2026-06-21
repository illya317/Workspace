import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonServiceResponse } from "@workspace/platform/server/api";
import { requireApiAccess, checkHRAccess, checkHRWrite } from "@workspace/platform/server/auth";
import {
  getPositionDescriptionByCode,
  getPositionDescriptionTree,
  listPositionDescriptions,
  updatePositionDescription,
} from "@workspace/hr/server";

const updatePositionDescriptionSchema = z.object({
  id: z.unknown().optional(),
  code: z.unknown().optional(),
  name: z.unknown().optional(),
  headcount: z.unknown().optional(),
  details: z.unknown().optional(),
}).passthrough();

export async function GET(request: Request) {
  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;
  const payload = auth.user;
  if (!(await checkHRAccess(payload.userId, "access", "hr.roster"))) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  if (searchParams.get("tree") === "1") return NextResponse.json(await getPositionDescriptionTree());
  if (code) return jsonServiceResponse(await getPositionDescriptionByCode(code));
  return NextResponse.json(await listPositionDescriptions(searchParams.get("search") || ""));
}

export async function PUT(request: Request) {
  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;
  const payload = auth.user;
  if (!(await checkHRWrite(payload.userId, "hr.roster"))) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const body = await request.json().catch(() => null);
  const parsedBody = updatePositionDescriptionSchema.safeParse(body);
  if (!parsedBody.success) return NextResponse.json({ error: "参数错误" }, { status: 400 });
  return jsonServiceResponse(await updatePositionDescription(parsedBody.data, payload.userId));
}
