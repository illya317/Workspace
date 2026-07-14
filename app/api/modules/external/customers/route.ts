import { createCommandRoute } from "@workspace/platform/server/api-route";
import { okCommand } from "@workspace/platform/server/domain-validation";
import {
  executeCreateExternalPartyCommand,
  ExternalPartyCreateSchema,
  ExternalPartyQuerySchema,
  listExternalParties,
} from "@workspace/external/server";

export const GET = createCommandRoute({
  querySchema: ExternalPartyQuerySchema,
  buildCommand: ({ query }) => okCommand({ category: "customer" as const, ...query }),
  action: listExternalParties,
});

export const POST = createCommandRoute({
  bodySchema: ExternalPartyCreateSchema,
  buildCommand: ({ body, user }) => okCommand({ category: "customer" as const, body, userId: user.userId }),
  action: executeCreateExternalPartyCommand,
});
