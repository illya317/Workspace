import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonErrorResponse, routeIdParamsSchema } from "@workspace/platform/server/api";
import { requireApiAccess } from "@workspace/platform/server/auth";
import { updateUserNotification } from "@workspace/platform/server/notifications";

const bodySchema = z.object({
  action: z.enum(["read", "acknowledge", "reject", "clear"]),
});

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;

  const [rawParams, body] = await Promise.all([
    ctx.params,
    request.json().catch(() => null),
  ]);
  const parsedParams = routeIdParamsSchema.safeParse(rawParams);
  const parsedBody = bodySchema.safeParse(body);
  if (!parsedParams.success || !parsedBody.success) {
    return jsonErrorResponse("参数错误", 400);
  }

  const result = await updateUserNotification(auth.user.userId, parsedParams.data.id, parsedBody.data.action);
  if (!result.success) return jsonErrorResponse(result.error, result.status);
  return NextResponse.json({ success: true });
}
