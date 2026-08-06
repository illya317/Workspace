import {
  buildSaveComparisonMappingRouteCommand,
  executeSaveComparisonMappingRouteCommand,
  comparisonMappingSaveBodySchema,
} from "@workspace/finance/server/statements/comparison/route-commands";
import { routeIdParamsSchema } from "@workspace/platform/server/api";
import { createCommandRoute } from "@workspace/platform/server/api-route";

export const PUT = createCommandRoute({
  paramsSchema: routeIdParamsSchema,
  bodySchema: comparisonMappingSaveBodySchema,
  bodyError: "映射确认参数无效",
  buildCommand: ({ params, body, user }) => buildSaveComparisonMappingRouteCommand({
    packageId: params.id,
    body,
    userId: user.userId,
  }),
  action: (command) => executeSaveComparisonMappingRouteCommand(command),
});
