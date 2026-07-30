import { NextResponse } from "next/server";
import { z } from "zod";

import { jsonErrorResponse } from "@workspace/platform/server/api";
import { requireApiAccess } from "@workspace/platform/server/auth";
import { callWorkspaceInternalJson } from "@workspace/platform/server/internal-unit-rpc";

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).catch(5),
  offset: z.coerce.number().int().min(0).catch(0),
  category: z.enum(["all", "ordinary", "workflow", "approval", "review", "publish"]).optional(),
  filter: z.enum(["all", "todo", "originated"]).optional(),
  keyword: z.string().trim().max(120).catch(""),
  readState: z.enum(["all", "unread", "pending", "read"]).optional(),
  workflowRequestId: z.coerce.number().int().positive().optional(),
}).passthrough();
const bodySchema = z.object({ action: z.literal("markAllRead") });

function queryFrom(request: Request) {
  return querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams.entries()));
}

export async function GET(request: Request) {
  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;
  const query = queryFrom(request);
  if (!query.success) return jsonErrorResponse("参数错误", 400);
  return NextResponse.json(await callWorkspaceInternalJson({
    callerUnitId: "workspace-shell",
    path: "/api/modules/work/internal/account",
    targetUnitId: "work",
    body: { operation: "notification.list", userId: auth.user.userId, query: query.data },
  }));
}

export async function DELETE(request: Request) {
  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;
  const query = queryFrom(request);
  if (!query.success) return jsonErrorResponse("参数错误", 400);
  return NextResponse.json(await callWorkspaceInternalJson({
    callerUnitId: "workspace-shell",
    path: "/api/modules/work/internal/account",
    targetUnitId: "work",
    body: { operation: "notification.clear", userId: auth.user.userId, query: query.data },
  }));
}

export async function PATCH(request: Request) {
  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;
  const [body, query] = await Promise.all([request.json().catch(() => null), Promise.resolve(queryFrom(request))]);
  const parsedBody = bodySchema.safeParse(body);
  if (!parsedBody.success || !query.success) return jsonErrorResponse("参数错误", 400);
  return NextResponse.json(await callWorkspaceInternalJson({
    callerUnitId: "workspace-shell",
    path: "/api/modules/work/internal/account",
    targetUnitId: "work",
    body: { operation: "notification.markAllRead", userId: auth.user.userId, query: query.data },
  }));
}
