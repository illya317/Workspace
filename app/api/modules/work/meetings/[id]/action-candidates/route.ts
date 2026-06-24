import { NextResponse } from "next/server";
import { z } from "zod";
import { routeIdParamsSchema } from "@workspace/platform/server/api";
import { requireApiAccess } from "@workspace/platform/server/auth";
import { createMeetingActionCandidate, linkMeetingActionCandidate, meetingServiceResponse } from "@workspace/work/server";

const actionCandidateSchema = z.object({
  action: z.enum(["ignore", "linkWorkItem", "createWorkItem", "linkProjectTask", "createProjectTask"]).optional(),
  candidateId: z.coerce.number().int().positive().optional(),
  agendaItemId: z.coerce.number().int().positive().nullable().optional(),
  decisionId: z.coerce.number().int().positive().nullable().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  targetKind: z.string().optional(),
  workItemId: z.coerce.number().int().positive().optional(),
  projectTaskId: z.coerce.number().int().positive().optional(),
  projectId: z.coerce.number().int().positive().optional(),
  targetType: z.string().optional(),
  targetId: z.coerce.number().int().positive().optional(),
  ownerEmployeeId: z.coerce.number().int().positive().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  content: z.string().optional(),
  name: z.string().optional(),
  category: z.string().optional(),
}).passthrough();

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;
  const parsedParams = routeIdParamsSchema.safeParse(await params);
  if (!parsedParams.success) return NextResponse.json({ error: "会议 ID 无效" }, { status: 400 });
  const parsedBody = actionCandidateSchema.safeParse(await request.json().catch(() => null));
  if (!parsedBody.success) return NextResponse.json({ error: "行动候选参数无效" }, { status: 400 });

  if (parsedBody.data.action) {
    if (!parsedBody.data.candidateId) return NextResponse.json({ error: "行动候选 ID 无效" }, { status: 400 });
    return meetingServiceResponse(await linkMeetingActionCandidate({
      userId: auth.user.userId,
      meetingId: parsedParams.data.id,
      candidateId: parsedBody.data.candidateId,
      body: parsedBody.data,
    }));
  }

  return meetingServiceResponse(await createMeetingActionCandidate({
    userId: auth.user.userId,
    meetingId: parsedParams.data.id,
    body: parsedBody.data,
  }));
}
