import { readRequestExpectedVersion, routeIdParamsSchema } from "@workspace/platform/server/api";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { failCommand, okCommand } from "@workspace/platform/server/domain-validation";
import { executeDeleteExternalRelatedPartyCommand } from "@workspace/external/server";

export const DELETE = createCommandRoute({
  paramsSchema: routeIdParamsSchema,
  paramsError: "无效ID",
  buildCommand: ({ params, request, user }) => {
    const idempotencyKey = request.headers.get("idempotency-key")?.trim();
    return idempotencyKey ? okCommand({
      partyId: params.id,
      userId: user.userId,
      expectedVersion: readRequestExpectedVersion(request),
      idempotencyKey,
    }) : failCommand("缺少 Idempotency-Key 请求头");
  },
  action: executeDeleteExternalRelatedPartyCommand,
});
