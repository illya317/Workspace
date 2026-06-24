import { NextResponse } from "next/server";
import { z } from "zod";
import { routeIdParamsSchema } from "@workspace/platform/server/api";
import { requireApiAccess } from "@workspace/platform/server/auth";
import { createMeetingMinuteEntry, meetingServiceResponse } from "@workspace/work/server";

const minuteSchema = z.object({
  agendaItemId: z.coerce.number().int().positive().nullable().optional(),
  content: z.string().min(1),
  kind: z.string().optional(),
}).passthrough();

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;
  const parsedParams = routeIdParamsSchema.safeParse(await params);
  if (!parsedParams.success) return NextResponse.json({ error: "会议 ID 无效" }, { status: 400 });
  const parsedBody = minuteSchema.safeParse(await request.json().catch(() => null));
  if (!parsedBody.success) return NextResponse.json({ error: parsedBody.error.issues[0]?.message || "纪要参数无效" }, { status: 400 });

  return meetingServiceResponse(await createMeetingMinuteEntry({
    userId: auth.user.userId,
    meetingId: parsedParams.data.id,
    body: parsedBody.data,
  }));
}
