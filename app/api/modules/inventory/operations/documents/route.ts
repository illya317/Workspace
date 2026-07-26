import { createCommandRoute } from "@workspace/platform/server/api-route";
import { buildCreateInventoryDocumentRouteCommand, executeCreateInventoryDocumentRouteCommand } from "@workspace/inventory/server/route-commands";
import { createInventoryDocumentSchema } from "@workspace/inventory/server/schemas";

export const POST = createCommandRoute({
  bodySchema: createInventoryDocumentSchema,
  buildCommand: ({ body, user }) => buildCreateInventoryDocumentRouteCommand(body, user.userId),
  action: executeCreateInventoryDocumentRouteCommand,
});
