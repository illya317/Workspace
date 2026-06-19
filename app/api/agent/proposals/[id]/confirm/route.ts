/**
 * POST /api/agent/proposals/[id]/confirm — 确认执行变更。
 * 二次鉴权：同用户、状态 pending、write 权限仍在、未过期。
 * 按 actionKey dispatch，不盲执行。
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/server/auth/session";
import { hrAgentProposalExecutors } from "@workspace/hr/server/agent-tools";
import { confirmProposalAction } from "@workspace/platform/server/agent";

const paramsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  try {
    const result = await confirmProposalAction(parsedParams.data.id, user, hrAgentProposalExecutors);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "执行失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
