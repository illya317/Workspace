import { createCommandRoute } from "@workspace/platform/server/api-route";
import { buildCreateInventoryItemRouteCommand, executeCreateInventoryItemRouteCommand } from "@workspace/inventory/server/route-commands";
import { createInventoryItemSchema } from "@workspace/inventory/server/schemas";

export const POST = createCommandRoute({
  bodySchema: createInventoryItemSchema,
  buildCommand: ({ body, user }) => buildCreateInventoryItemRouteCommand(body, user.userId),
  action: executeCreateInventoryItemRouteCommand,
});
