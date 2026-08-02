import { readRequestExpectedVersion } from "@workspace/platform/server/api";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { failCommand, okCommand } from "@workspace/platform/server/domain-validation";
import {
  executeCreateExternalRelatedPartyCommand,
  ExternalRelatedPartyCreateSchema,
  ExternalRelatedPartyQuerySchema,
  listExternalRelatedParties,
} from "@workspace/external/server";

export const GET = createCommandRoute({
  querySchema: ExternalRelatedPartyQuerySchema,
  buildCommand: ({ query }) => okCommand(query),
  action: listExternalRelatedParties,
});

export const POST = createCommandRoute({
  bodySchema: ExternalRelatedPartyCreateSchema,
  buildCommand: ({ body, user, request }) => {
    const idempotencyKey = request.headers.get("idempotency-key")?.trim();
    return idempotencyKey
      ? okCommand({
          body,
          userId: user.userId,
          expectedVersion: readRequestExpectedVersion(request),
          idempotencyKey,
        })
      : failCommand("缺少 Idempotency-Key 请求头");
  },
  action: executeCreateExternalRelatedPartyCommand,
});
