import { NextResponse } from "next/server";
import { requireApiAccess } from "@workspace/platform/server/auth";
import { canUseProject, listProjectGantt } from "@workspace/work/server";
import { jsonErrorResponse } from "@workspace/platform/server/api";

export async function GET(request: Request) {
  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;
  if (!(await canUseProject(auth.user.userId))) {
    return jsonErrorResponse("无权限", 403);
  }

  const { searchParams } = new URL(request.url);
  const includeTasks = searchParams.get("includeTasks") === "1" || searchParams.get("includeTasks") === "true";
  return NextResponse.json(await listProjectGantt({
    userId: auth.user.userId,
    includeTasks,
  }));
}
