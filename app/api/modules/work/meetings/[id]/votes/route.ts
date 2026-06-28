import { z } from "zod";
import { jsonErrorResponse, routeIdParamsSchema } from "@workspace/platform/server/api";
import { requireApiAccess } from "@workspace/platform/server/auth";
import { castMeetingVote, closeMeetingProposal, createMeetingProposal, meetingServiceResponse } from "@workspace/work/server";

const voteActionSchema = z.object({
  action: z.enum(["create", "cast", "close"]).optional(),
  proposalId: z.coerce.number().int().positive().optional(),
  agendaItemId: z.coerce.number().int().positive().nullable().optional(),
  title: z.string().optional(),
  content: z.string().optional(),
  voteVisibility: z.string().optional(),
  minVotesRequired: z.coerce.number().int().positive().nullable().optional(),
  choice: z.string().optional(),
  note: z.string().optional(),
}).passthrough();

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;
  const parsedParams = routeIdParamsSchema.safeParse(await params);
  if (!parsedParams.success) return jsonErrorResponse("会议 ID 无效", 400);
  const parsedBody = voteActionSchema.safeParse(await request.json().catch(() => null));
  if (!parsedBody.success) return jsonErrorResponse("表决参数无效", 400);

  const action = parsedBody.data.action || (parsedBody.data.title ? "create" : "cast");
  if (action === "close") {
    if (!parsedBody.data.proposalId) return jsonErrorResponse("表决事项无效", 400);
    return meetingServiceResponse(await closeMeetingProposal({
      userId: auth.user.userId,
      meetingId: parsedParams.data.id,
      proposalId: parsedBody.data.proposalId,
    }));
  }
  if (action === "create") {
    return meetingServiceResponse(await createMeetingProposal({
      userId: auth.user.userId,
      meetingId: parsedParams.data.id,
      body: parsedBody.data,
    }));
  }
  return meetingServiceResponse(await castMeetingVote({
    userId: auth.user.userId,
    meetingId: parsedParams.data.id,
    body: parsedBody.data,
  }));
}
