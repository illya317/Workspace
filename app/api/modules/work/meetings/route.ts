import { NextResponse } from "next/server";
import { z } from "zod";
import { routeIdParamsSchema } from "@workspace/platform/server/api";
import { requireApiAccess } from "@workspace/platform/server/auth";
import { createMeeting, listMeetings, meetingServiceResponse } from "@workspace/work/server";

const createMeetingSchema = z.object({
  typeId: z.coerce.number().int().positive(),
  seriesId: z.coerce.number().int().positive().nullable().optional(),
  title: z.string().min(1),
  description: z.string().optional(),
  startAt: z.string().nullable().optional(),
  endAt: z.string().nullable().optional(),
  location: z.string().optional(),
  visibility: z.string().optional(),
  ownerUserId: z.coerce.number().int().positive().nullable().optional(),
  secretaryUserId: z.coerce.number().int().positive().nullable().optional(),
  participantUserIds: z.array(z.coerce.number().int().positive()).optional(),
}).passthrough();

export async function GET(request: Request) {
  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const typeIdParam = searchParams.get("typeId");
  const typeId = typeIdParam ? routeIdParamsSchema.safeParse({ id: typeIdParam }) : null;
  if (typeIdParam && !typeId?.success) return NextResponse.json({ error: "会议类型无效" }, { status: 400 });

  return meetingServiceResponse(await listMeetings({
    userId: auth.user.userId,
    typeId: typeId?.success ? typeId.data.id : null,
  }));
}

export async function POST(request: Request) {
  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = createMeetingSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "会议参数无效" }, { status: 400 });

  return meetingServiceResponse(await createMeeting({ userId: auth.user.userId, body: parsed.data }));
}
