import { jsonErrorResponse, serviceResponse } from "@workspace/platform/server/api";
import { createApiRouteHandler } from "@workspace/platform/server/api-route";
import {
  notificationGroupPublicationSchema,
  publishNotificationToManagedGroup,
} from "@workspace/platform/server/wecom-group-notifications";

export const POST = createApiRouteHandler({
  bodySchema: notificationGroupPublicationSchema,
  handler: async ({ request, user, body }) => {
    const idempotencyKey = request.headers.get("idempotency-key")?.trim();
    if (!idempotencyKey) return jsonErrorResponse("缺少 Idempotency-Key 请求头", 400);
    const result = await publishNotificationToManagedGroup(
      user.userId,
      body,
      idempotencyKey,
    );
    if (result.ok === false) return serviceResponse(result);
    return Response.json(result.data, { status: result.data.replayed ? 200 : 201 });
  },
});
