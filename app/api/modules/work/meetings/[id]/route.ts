import { NextResponse } from "next/server";
import { z } from "zod";
import { routeIdParamsSchema } from "@workspace/platform/server/api";
import { requireApiAccess } from "@workspace/platform/server/auth";
import { deleteMeeting, getMeetingDetail, meetingServiceResponse, updateMeeting } from "@workspace/work/server";

const updateMeetingSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  startAt: z.string().nullable().optional(),
  endAt: z.string().nullable().optional(),
  location: z.string().optional(),
  visibility: z.string().optional(),
  status: z.string().optional(),
  ownerUserId: z.coerce.number().int().positive().nullable().optional(),
  secretaryUserId: z.coerce.number().int().positive().nullable().optional(),
}).passthrough();

type MeetingRouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: MeetingRouteContext) {
  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;
  const parsedParams = routeIdParamsSchema.safeParse(await params);
  if (!parsedParams.success) return NextResponse.json({ error: "会议 ID 无效" }, { status: 400 });

  return meetingServiceResponse(await getMeetingDetail({ userId: auth.user.userId, meetingId: parsedParams.data.id }));
}

export async function PUT(request: Request, { params }: MeetingRouteContext) {
  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;
  const parsedParams = routeIdParamsSchema.safeParse(await params);
  if (!parsedParams.success) return NextResponse.json({ error: "会议 ID 无效" }, { status: 400 });
  const body = await request.json().catch(() => null);
  const parsedBody = updateMeetingSchema.safeParse(body);
  if (!parsedBody.success) return NextResponse.json({ error: parsedBody.error.issues[0]?.message || "会议参数无效" }, { status: 400 });

  return meetingServiceResponse(await updateMeeting({
    userId: auth.user.userId,
    meetingId: parsedParams.data.id,
    body: parsedBody.data,
  }));
}

export async function DELETE(request: Request, { params }: MeetingRouteContext) {
  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;
  const parsedParams = routeIdParamsSchema.safeParse(await params);
  if (!parsedParams.success) return NextResponse.json({ error: "会议 ID 无效" }, { status: 400 });

  return meetingServiceResponse(await deleteMeeting({ userId: auth.user.userId, meetingId: parsedParams.data.id }));
}
