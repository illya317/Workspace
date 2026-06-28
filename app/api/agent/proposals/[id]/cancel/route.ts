import { NextResponse } from "next/server";
import { getSessionUserFromAuthPayload, requireApiAccess } from "@workspace/platform/server/auth";
import { cancelProposal } from "@workspace/platform/server/agent";
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
    const result = await cancelProposal(parsedParams.data.id, user);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "取消失败";
    return jsonErrorResponse(message, 500);
  }
}
