import { NextResponse } from "next/server";
import { requireApiAccess } from "@workspace/platform/server/auth";
import { canUseProject, listProjectGantt } from "@workspace/work/server";

export async function GET(request: Request) {
  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;
  if (!(await canUseProject(auth.user.userId))) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const includeTasks = searchParams.get("includeTasks") === "1" || searchParams.get("includeTasks") === "true";
  return NextResponse.json(await listProjectGantt({
    userId: auth.user.userId,
    includeTasks,
  }));
}
