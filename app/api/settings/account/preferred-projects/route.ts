import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonErrorResponse } from "@workspace/platform/server/api";
import { requireApiAccess } from "@workspace/platform/server/auth";
import {
  getUserPreferredProjectSettings,
  updateUserPreferredProjectIds,
} from "@workspace/work/server";

const updatePreferredProjectsSchema = z.object({
  projectIds: z.array(z.number().int().positive()).max(3),
});

export async function GET(request: Request) {
  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;

  const settings = await getUserPreferredProjectSettings(auth.user.userId);
  return NextResponse.json(settings);
}

export async function PUT(request: Request) {
  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = updatePreferredProjectsSchema.safeParse(body);
  if (!parsed.success) return jsonErrorResponse("参数错误", 400);

  try {
    const preferredProjectIds = await updateUserPreferredProjectIds(auth.user.userId, parsed.data.projectIds);
    return NextResponse.json({ success: true, preferredProjectIds });
  } catch (error) {
    return jsonErrorResponse(error instanceof Error ? error.message : "保存常用项目失败", 400);
  }
}
