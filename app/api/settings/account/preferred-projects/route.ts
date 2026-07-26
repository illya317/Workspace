import { NextResponse } from "next/server";
import { z } from "zod";

import { jsonErrorResponse } from "@workspace/platform/server/api";
import { requireApiAccess } from "@workspace/platform/server/auth";
import { callWorkspaceInternalJson } from "@workspace/platform/server/internal-unit-rpc";

const bodySchema = z.object({
  projectIds: z.array(z.number().int().positive()).max(3),
});

export async function GET(request: Request) {
  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;
  return NextResponse.json(await callWorkspaceInternalJson({
    callerUnitId: "workspace-shell",
    path: "/api/modules/work/internal/account",
    targetUnitId: "work",
    body: { operation: "preferredProjects.get", userId: auth.user.userId },
  }));
}

export async function PUT(request: Request) {
  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return jsonErrorResponse("参数错误", 400);
  return NextResponse.json(await callWorkspaceInternalJson({
    callerUnitId: "workspace-shell",
    path: "/api/modules/work/internal/account",
    targetUnitId: "work",
    body: { operation: "preferredProjects.update", userId: auth.user.userId, projectIds: body.data.projectIds },
  }));
}
