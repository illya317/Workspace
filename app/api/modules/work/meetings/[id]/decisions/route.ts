import { NextResponse } from "next/server";
import { z } from "zod";
import { routeIdParamsSchema } from "@workspace/platform/server/api";
import { requireApiAccess } from "@workspace/platform/server/auth";
import { createMeetingDecision, meetingServiceResponse } from "@workspace/work/server";

const decisionSchema = z.object({
  agendaItemId: z.coerce.number().int().positive().nullable().optional(),
  proposalId: z.coerce.number().int().positive().nullable().optional(),
  kind: z.string().optional(),
  title: z.string().min(1),
  content: z.string().optional(),
  effectiveDate: z.string().nullable().optional(),
}).passthrough();

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;
  const parsedParams = routeIdParamsSchema.safeParse(await params);
  if (!parsedParams.success) return NextResponse.json({ error: "会议 ID 无效" }, { status: 400 });
  const parsedBody = decisionSchema.safeParse(await request.json().catch(() => null));
  if (!parsedBody.success) return NextResponse.json({ error: parsedBody.error.issues[0]?.message || "决议参数无效" }, { status: 400 });

  return meetingServiceResponse(await createMeetingDecision({
    userId: auth.user.userId,
    meetingId: parsedParams.data.id,
    body: parsedBody.data,
  }));
}
