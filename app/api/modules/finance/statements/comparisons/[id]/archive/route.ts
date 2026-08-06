import {
  buildArchiveComparisonPackageRouteCommand,
  executeArchiveComparisonPackageRouteCommand,
} from "@workspace/finance/server/statements/comparison/route-commands";
import { routeIdParamsSchema } from "@workspace/platform/server/api";
import { createCommandRoute } from "@workspace/platform/server/api-route";

export const POST = createCommandRoute({
  paramsSchema: routeIdParamsSchema,
  buildCommand: ({ params, user }) => buildArchiveComparisonPackageRouteCommand({
    packageId: params.id,
    userId: user.userId,
  }),
  action: (command) => executeArchiveComparisonPackageRouteCommand(command),
});
