import { NextResponse } from "next/server";
import { z } from "zod";
import { routeIdParamsSchema } from "@workspace/platform/server/api";
import { requireApiAccess } from "@workspace/platform/server/auth";
import { meetingServiceResponse, upsertMeetingParticipant } from "@workspace/work/server";

const participantSchema = z.object({
  userId: z.coerce.number().int().positive(),
  role: z.string().optional(),
  canVote: z.boolean().optional(),
  attendanceStatus: z.string().optional(),
}).passthrough();

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;
  const parsedParams = routeIdParamsSchema.safeParse(await params);
  if (!parsedParams.success) return NextResponse.json({ error: "会议 ID 无效" }, { status: 400 });
  const parsedBody = participantSchema.safeParse(await request.json().catch(() => null));
  if (!parsedBody.success) return NextResponse.json({ error: "参会人参数无效" }, { status: 400 });

  return meetingServiceResponse(await upsertMeetingParticipant({
    userId: auth.user.userId,
    meetingId: parsedParams.data.id,
    body: parsedBody.data,
  }));
}
