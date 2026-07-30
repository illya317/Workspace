import { createCommandRoute } from "@workspace/platform/server/api-route";
import { okCommand } from "@workspace/platform/server/domain-validation";
import {
  executeCreateExternalPartyCommand,
  externalDirectCommandId,
  ExternalPartyCreateSchema,
  ExternalPartyQuerySchema,
  listExternalParties,
} from "@workspace/external/server";

export const GET = createCommandRoute({
  querySchema: ExternalPartyQuerySchema,
  buildCommand: ({ query, user }) => okCommand({ category: "supplier" as const, userId: user.userId, ...query }),
  action: listExternalParties,
});

export const POST = createCommandRoute({
  bodySchema: ExternalPartyCreateSchema,
  buildCommand: ({ body, user, request }) => okCommand({
    category: "supplier" as const,
    body,
    userId: user.userId,
    idempotencyKey: externalDirectCommandId(request),
  }),
  action: executeCreateExternalPartyCommand,
});
