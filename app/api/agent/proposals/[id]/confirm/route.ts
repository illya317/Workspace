/**
 * POST /api/agent/proposals/[id]/confirm — 确认执行变更。
 * 二次鉴权：同用户、状态 pending、write 权限仍在、未过期。
 * 按 actionKey dispatch，不盲执行。
 */
import { NextResponse } from "next/server";
import { getSessionUserFromAuthPayload, requireApiAccess } from "@workspace/platform/server/auth";
import { hrAgentProposalExecutors } from "@workspace/hr/server/agent-tools";
import { confirmProposalAction } from "@workspace/platform/server/agent";
import { jsonErrorResponse, routeIdParamsSchema } from "@workspace/platform/server/api";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;

  const user = await getSessionUserFromAuthPayload(auth.user);
  if (!user) return jsonErrorResponse("Unauthorized", 401);

  const parsedParams = routeIdParamsSchema.safeParse(await params);
  if (!parsedParams.success) return jsonErrorResponse("Invalid id", 400);

  try {
    const result = await confirmProposalAction(parsedParams.data.id, user, hrAgentProposalExecutors);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "执行失败";
    return jsonErrorResponse(message, 500);
  }
}
