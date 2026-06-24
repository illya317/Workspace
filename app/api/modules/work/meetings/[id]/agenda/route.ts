import { NextResponse } from "next/server";
import { z } from "zod";
import { routeIdParamsSchema } from "@workspace/platform/server/api";
import { requireApiAccess } from "@workspace/platform/server/auth";
import { createMeetingAgendaItem, meetingServiceResponse } from "@workspace/work/server";

const agendaSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  presenterUserId: z.coerce.number().int().positive().nullable().optional(),
  sortOrder: z.coerce.number().optional(),
}).passthrough();

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;
  const parsedParams = routeIdParamsSchema.safeParse(await params);
  if (!parsedParams.success) return NextResponse.json({ error: "会议 ID 无效" }, { status: 400 });
  const parsedBody = agendaSchema.safeParse(await request.json().catch(() => null));
  if (!parsedBody.success) return NextResponse.json({ error: parsedBody.error.issues[0]?.message || "议题参数无效" }, { status: 400 });

  return meetingServiceResponse(await createMeetingAgendaItem({
    userId: auth.user.userId,
    meetingId: parsedParams.data.id,
    body: parsedBody.data,
  }));
}
