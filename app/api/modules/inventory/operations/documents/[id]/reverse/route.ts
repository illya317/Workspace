import { routeIdParamsSchema } from "@workspace/platform/server/api";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { buildInventoryDocumentLifecycleRouteCommand, executeInventoryDocumentLifecycleRouteCommand } from "@workspace/inventory/server/route-commands";

export const POST = createCommandRoute({
  paramsSchema: routeIdParamsSchema,
  buildCommand: ({ params, user }) => buildInventoryDocumentLifecycleRouteCommand({ id: params.id, action: "reverse" }, user.userId),
  action: executeInventoryDocumentLifecycleRouteCommand,
});
